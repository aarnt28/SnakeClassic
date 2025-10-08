"""Server-side leaderboard persistence utilities."""

from __future__ import annotations

import asyncio
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Sequence

ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"}
MAX_NAME_LENGTH = 24


def sanitize_name(value: str | None) -> str:
    """Normalize a player name for storage."""

    if not isinstance(value, str):
        return "Anonymous"
    cleaned = value.strip()[:MAX_NAME_LENGTH]
    return cleaned or "Anonymous"


def ensure_difficulty(value: str | None) -> str:
    """Clamp difficulty values to the supported set."""

    if not isinstance(value, str):
        return "easy"
    lowered = value.strip().lower()
    return lowered if lowered in ALLOWED_DIFFICULTIES else "easy"


def normalize_score(value: int | float | str) -> int:
    """Convert arbitrary score input into a bounded integer."""

    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        numeric = 0
    return max(0, numeric)


@dataclass(slots=True)
class LeaderboardRecord:
    """A normalized leaderboard entry."""

    name: str
    score: int
    difficulty: str
    submitted_at: str

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "score": self.score,
            "difficulty": self.difficulty,
            "submitted_at": self.submitted_at,
        }


class LeaderboardStore:
    """SQLite-backed leaderboard storage with asyncio-friendly locking."""

    def __init__(self, path: Path, limit: int = 100) -> None:
        self._path = path
        self._limit = limit
        self._lock = asyncio.Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.touch(exist_ok=True)
        self._initialize_database()

    async def get_entries(
        self, *, difficulty: str | None = None, limit: int | None = None
    ) -> List[dict]:
        """Return leaderboard rows, optionally filtered by difficulty."""

        difficulty_filter = ensure_difficulty(difficulty) if difficulty else None
        requested_limit = limit if limit is not None else self._limit
        async with self._lock:
            rows = await asyncio.to_thread(
                self._fetch_rows, requested_limit, difficulty_filter
            )
        return [self._row_to_dict(row) for row in rows]

    async def submit(
        self, *, name: str, score: int, difficulty: str
    ) -> tuple[List[dict], dict, int]:
        record = LeaderboardRecord(
            name=sanitize_name(name),
            score=normalize_score(score),
            difficulty=ensure_difficulty(difficulty),
            submitted_at=datetime.now(timezone.utc).isoformat(),
        )

        async with self._lock:
            row_id = await asyncio.to_thread(self._insert_record, record)
            all_rows = await asyncio.to_thread(
                self._fetch_rows, None, record.difficulty
            )
            rank = self._rank_of_rows(all_rows, row_id)
            await asyncio.to_thread(self._trim_to_limit)
            limited_rows = await asyncio.to_thread(
                self._fetch_rows, self._limit, record.difficulty
            )

        entry_row = next((row for row in all_rows if row["id"] == row_id), None)
        entry_dict = (
            self._row_to_dict(entry_row)
            if entry_row is not None
            else record.to_dict()
        )
        return [self._row_to_dict(row) for row in limited_rows], entry_dict, rank

    def _initialize_database(self) -> None:
        with sqlite3.connect(self._path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    difficulty TEXT NOT NULL,
                    submitted_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_leaderboard_score_submitted
                    ON leaderboard (score DESC, submitted_at ASC)
                """
            )

    def _fetch_rows(
        self, limit: int | None, difficulty: str | None = None
    ) -> List[sqlite3.Row]:
        with sqlite3.connect(self._path) as connection:
            connection.row_factory = sqlite3.Row
            query = (
                "SELECT id, name, score, difficulty, submitted_at "
                "FROM leaderboard"
            )
            params: tuple = ()
            if difficulty:
                query += " WHERE difficulty = ?"
                params += (difficulty,)
            query += " ORDER BY score DESC, submitted_at ASC, id ASC"
            if limit is not None:
                query += " LIMIT ?"
                params += (limit,)
            cursor = connection.execute(query, params)
            return cursor.fetchall()

    def _insert_record(self, record: LeaderboardRecord) -> int:
        with sqlite3.connect(self._path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO leaderboard (name, score, difficulty, submitted_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    record.name,
                    record.score,
                    record.difficulty,
                    record.submitted_at,
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def _trim_to_limit(self) -> None:
        with sqlite3.connect(self._path) as connection:
            for difficulty in sorted(ALLOWED_DIFFICULTIES):
                connection.execute(
                    """
                    DELETE FROM leaderboard
                    WHERE difficulty = ? AND id NOT IN (
                        SELECT id FROM leaderboard
                        WHERE difficulty = ?
                        ORDER BY score DESC, submitted_at ASC, id ASC
                        LIMIT ?
                    )
                    """,
                    (difficulty, difficulty, self._limit),
                )
            connection.commit()

    @staticmethod
    def _row_to_dict(row: sqlite3.Row | None) -> dict:
        if row is None:
            return {}
        return {
            "name": sanitize_name(row["name"]),
            "score": normalize_score(row["score"]),
            "difficulty": ensure_difficulty(row["difficulty"]),
            "submitted_at": row["submitted_at"],
        }

    @staticmethod
    def _rank_of_rows(rows: Sequence[sqlite3.Row], row_id: int) -> int:
        for index, row in enumerate(rows):
            if int(row["id"]) == row_id:
                return index + 1
        return len(rows) + 1
