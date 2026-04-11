"""
api/main.py — FastAPI server. Reads from SQLite; never calls TerpLink directly.
Workers populate the database; this just serves it.

Start:  uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.database import get_upcoming_events, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


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
def get_events():
    """
    Return all upcoming geocoded events from the database.
    Run workers/terplink.py first to populate data.
    """
    try:
        return get_upcoming_events()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}
