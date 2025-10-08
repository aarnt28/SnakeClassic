from __future__ import annotations

import os
from pathlib import Path

from typing import List

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator

from .leaderboard import LeaderboardStore, ensure_difficulty, normalize_score, sanitize_name

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
LEADERBOARD_LIMIT = 100

app = FastAPI(title="Snake Classic")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_index_html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")

default_db_path = Path("/app/data") / "leaderboard.db"
db_path = Path(os.environ.get("LEADERBOARD_DB_PATH", str(default_db_path)))
store = LeaderboardStore(db_path, limit=LEADERBOARD_LIMIT)


class LeaderboardEntryResponse(BaseModel):
    name: str
    score: int
    difficulty: str
    submitted_at: str


class LeaderboardPayload(BaseModel):
    entries: List[LeaderboardEntryResponse]
    total: int


class LeaderboardSubmission(BaseModel):
    name: str = Field(default="Anonymous", max_length=24)
    score: int = Field(default=0, ge=0)
    difficulty: str = Field(default="easy")

    @validator("name", pre=True, always=True)
    def validate_name(cls, value: str | None) -> str:
        return sanitize_name(value)

    @validator("score", pre=True, always=True)
    def validate_score(cls, value) -> int:
        return normalize_score(value)

    @validator("difficulty", pre=True, always=True)
    def validate_difficulty(cls, value: str | None) -> str:
        return ensure_difficulty(value)


class LeaderboardSubmissionResponse(BaseModel):
    entries: List[LeaderboardEntryResponse]
    entry: LeaderboardEntryResponse
    rank: int | None


@app.get("/", response_class=HTMLResponse)
async def read_index() -> str:
    """Serve the main game page."""

    return _index_html


@app.get("/api/leaderboard", response_model=LeaderboardPayload)
async def get_leaderboard(
    limit: int = Query(10, ge=1, le=LEADERBOARD_LIMIT),
    difficulty: str | None = Query(None),
) -> LeaderboardPayload:
    difficulty_filter = ensure_difficulty(difficulty) if difficulty else None
    entries = await store.get_entries(difficulty=difficulty_filter)
    limited = entries[:limit]
    return LeaderboardPayload(entries=limited, total=len(entries))


@app.post("/api/leaderboard", response_model=LeaderboardSubmissionResponse, status_code=201)
async def submit_leaderboard(submission: LeaderboardSubmission) -> LeaderboardSubmissionResponse:
    entries, entry, rank = await store.submit(
        name=submission.name,
        score=submission.score,
        difficulty=submission.difficulty,
    )
    return LeaderboardSubmissionResponse(entries=entries, entry=entry, rank=rank)
