"""
api/main.py — FastAPI server. Reads from SQLite; never calls TerpLink directly.
Workers populate the database; this just serves it.

Start:  uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from core.database import get_upcoming_events, get_events_since, init_db
from workers.discord import bot

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    
    # Start bot
    bot_token = os.environ.get("DISCORD_BOT_TOKEN")
    bot_task = None
    if bot_token:
        bot_task = asyncio.create_task(bot.start(bot_token))
        
    yield
    
    # Cleanup
    if bot_task:
        await bot.close()


app = FastAPI(title="Scope API", version="0.4.0", lifespan=lifespan)

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


@app.get("/api/events", response_model=List[Event])
def get_events(since: Optional[str] = None):
    """
    Return upcoming events from the database.
    Pass ?since=<iso_timestamp> to get only events updated after that time (delta sync).
    Omit for a full load.
    """
    try:
        if since:
            try:
                since_dt = datetime.fromisoformat(since)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid 'since' timestamp — use ISO 8601 format")
            return get_events_since(since_dt)
        return get_upcoming_events()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}
