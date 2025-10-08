"""Server-side leaderboard persistence utilities."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

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
    """File-backed leaderboard storage with asyncio-friendly locking."""

    def __init__(self, path: Path, limit: int = 100) -> None:
        self._path = path
        self._limit = limit
        self._lock = asyncio.Lock()

    async def get_entries(self) -> List[dict]:
        async with self._lock:
            return [record.to_dict() for record in self._load_records()]

    async def submit(self, *, name: str, score: int, difficulty: str) -> tuple[List[dict], dict, int]:
        record = LeaderboardRecord(
            name=sanitize_name(name),
            score=normalize_score(score),
            difficulty=ensure_difficulty(difficulty),
            submitted_at=datetime.now(timezone.utc).isoformat(),
        )

        async with self._lock:
            records = self._load_records()
            records.append(record)
            records.sort(key=lambda item: (-item.score, item.submitted_at))

            rank = self._rank_of(records, record)

            limited = records[: self._limit]
            self._save_records(limited)

            return [item.to_dict() for item in limited], record.to_dict(), rank

    def _load_records(self) -> List[LeaderboardRecord]:
        if not self._path.exists():
            return []
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

        payload = raw.get("entries") if isinstance(raw, dict) else raw
        if not isinstance(payload, list):
            return []

        records: List[LeaderboardRecord] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            name = sanitize_name(item.get("name"))
            score = normalize_score(item.get("score"))
            difficulty = ensure_difficulty(item.get("difficulty"))
            submitted_at_raw = item.get("submitted_at")
            if isinstance(submitted_at_raw, str):
                submitted_at = submitted_at_raw
            else:
                submitted_at = datetime.now(timezone.utc).isoformat()
            records.append(
                LeaderboardRecord(
                    name=name,
                    score=score,
                    difficulty=difficulty,
                    submitted_at=submitted_at,
                ),
            )

        records.sort(key=lambda item: (-item.score, item.submitted_at))
        return records[: self._limit]

    def _save_records(self, records: Iterable[LeaderboardRecord]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = {"entries": [record.to_dict() for record in records]}
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @staticmethod
    def _rank_of(records: List[LeaderboardRecord], record: LeaderboardRecord) -> int:
        for index, item in enumerate(records):
            if item.submitted_at == record.submitted_at and item.name == record.name and item.score == record.score:
                return index + 1
        extended = sorted(records + [record], key=lambda item: (-item.score, item.submitted_at))
        for index, item in enumerate(extended):
            if item.submitted_at == record.submitted_at and item.name == record.name and item.score == record.score:
                return index + 1
        return len(records) + 1
