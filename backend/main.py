from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from pydantic import BaseModel

app = FastAPI(title="Scope API", version="0.1.0")

# Allow all origins during development so the Expo app can reach this server
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
    start_time: str  # ISO-8601
    link: str


MOCK_EVENTS: List[Event] = [
    Event(
        id=1,
        title="Hackathon Kickoff @ Iribe",
        lat=38.9891,
        lng=-76.9364,
        start_time="2026-04-12T10:00:00-04:00",
        link="https://terplink.umd.edu/event/1",
    ),
    Event(
        id=2,
        title="CS Career Fair",
        lat=38.9880,
        lng=-76.9370,
        start_time="2026-04-13T12:00:00-04:00",
        link="https://terplink.umd.edu/event/2",
    ),
    Event(
        id=3,
        title="Research Symposium – Stamp Student Union",
        lat=38.9874,
        lng=-76.9445,
        start_time="2026-04-14T09:00:00-04:00",
        link="https://terplink.umd.edu/event/3",
    ),
]


@app.get("/api/events", response_model=List[Event])
def get_events():
    """Return a list of upcoming campus events with geo-coordinates."""
    return MOCK_EVENTS


@app.get("/health")
def health():
    return {"status": "ok"}
