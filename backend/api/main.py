"""
api/main.py — FastAPI server. Reads from SQLite; never calls TerpLink directly.
Workers populate the database; this just serves it.

Start:  uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv

# Must run before any local imports so module-level os.environ.get() calls see the values
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.routes.auth import router as auth_router
from core.database import get_all_embeddings, get_events_since, get_upcoming_deadlines, get_upcoming_events, init_db
from core.embedder import generate_embedding
from core.scoring import preload as preload_embeddings, score_events
from workers.gmail_sync import run_gmail_sync_loop

# Temporary local switch: keep the API running without starting the Discord bot.
DISCORD_BOT_ENABLED = True

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("forecast.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("[api] Initializing database…")
    init_db()
    log.info("[api] Database ready.")

    # Warm up embedding model and load all event vectors into memory
    log.info("[api] Warming up embedding model…")
    try:
        generate_embedding("warmup", task_type="RETRIEVAL_QUERY")
        log.info("[api] Embedding model ready.")
        preload_embeddings(get_all_embeddings())
    except Exception as e:
        log.warning("[api] Embedding model failed to load — semantic scoring disabled: %s", e)

    bot_task = None
    if DISCORD_BOT_ENABLED:
        bot_token = os.environ.get("DISCORD_BOT_TOKEN")
        if bot_token:
            from workers.discord import bot

            log.info("[api] Starting Discord bot…")
            bot_task = asyncio.create_task(bot.start(bot_token))
        else:
            log.warning("[api] DISCORD_BOT_TOKEN not set — bot will not start.")
    else:
        log.warning("[api] Discord bot startup is temporarily disabled.")

    log.info("[api] Starting Gmail sync loop…")
    gmail_task = asyncio.create_task(run_gmail_sync_loop())

    yield

    if bot_task:
        log.info("[api] Shutting down Discord bot…")
        from workers.discord import bot

        await bot.close()

    gmail_task.cancel()
    try:
        await gmail_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Forecast API", version="0.7.0", lifespan=lifespan)

app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Event(BaseModel):
    id: int
    title: str
    lat: float
    lng: float
    start_time: str
    link: str
    location: Optional[str] = None
    source: Optional[str] = None
    semantic_score: int = 0


@app.get("/api/events", response_model=List[Event])
def get_events(since: Optional[str] = None, keywords: Optional[str] = None):
    """
    Return upcoming events from the database.
    ?since=<iso>      — delta sync, only events updated after this timestamp
    ?keywords=a,b,c   — compute semantic priority_score per event
    """
    t0 = time.perf_counter()
    try:
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                log.warning("[api] Bad 'since' value: %s", since)
                raise HTTPException(status_code=400, detail="Invalid 'since' timestamp — use ISO 8601 format")
            rows = get_events_since(since_dt)
            mode = f"delta since={since_dt.isoformat()}"
        else:
            rows = get_upcoming_events()
            mode = "full"

        # Semantic scoring — only when keywords are provided
        scores: dict = {}
        if keywords:
            kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
            if kw_list:
                try:
                    kw_text = " ".join(kw_list)
                    kw_vec  = generate_embedding(kw_text, task_type="RETRIEVAL_QUERY")
                    scores  = score_events([r["id"] for r in rows], kw_vec)
                    log.info("[api] Scored %d events for keywords=%r", len(rows), kw_list)
                except Exception as e:
                    log.warning("[api] Scoring failed, returning score=0: %s", e)

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log.info("[api] GET /api/events  mode=%-6s  rows=%d  kw=%s  %.1fms",
                 mode, len(rows), repr(keywords) if keywords else "none", elapsed_ms)

        return [
            {
                "id":             row["id"],
                "title":          row["title"],
                "lat":            row["lat"],
                "lng":            row["lng"],
                "start_time":     row["start_time"],
                "link":           row["link"],
                "location":       row.get("location"),
                "source":         row.get("source"),
                "semantic_score": scores.get(row["id"], 0),
            }
            for row in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        log.exception("[api] Database error in GET /api/events")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


class Deadline(BaseModel):
    id: int
    title: str
    source: str
    link: str
    deadline_time: str


@app.get("/api/deadlines", response_model=List[Deadline])
def get_deadlines():
    """Return all upcoming deadlines sorted by deadline_time ASC."""
    try:
        rows = get_upcoming_deadlines()
        log.info("[api] GET /api/deadlines  rows=%d", len(rows))
        return [
            {
                "id":            row["id"],
                "title":         row["title"],
                "source":        row["source"],
                "link":          row["link"],
                "deadline_time": row["deadline_time"],
            }
            for row in rows
        ]
    except Exception as e:
        log.exception("[api] Database error in GET /api/deadlines")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}
