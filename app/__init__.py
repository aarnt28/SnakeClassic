from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Snake Classic")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

_index_html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
async def read_index() -> str:
    """Serve the main game page."""

    return _index_html
