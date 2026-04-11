"""
core/database.py — PostgreSQL connection and event helpers.

Uses psycopg2 with a standard DATABASE_URL connection string.
All workers write here. The API reads from here.

Setup:
  1. Install PostgreSQL locally or spin up a free instance (Render, Railway, etc.)
  2. Run backend/schema.sql to create the events table
  3. Set DATABASE_URL in your .env file
"""

import os
from contextlib import contextmanager
from typing import Any, Dict, List

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


def _get_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set in .env")
    return psycopg2.connect(url)


@contextmanager
def _cursor():
    """Context manager that yields a DictCursor and auto-commits/rolls back."""
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                yield cur
    finally:
        conn.close()


# ── Write ──────────────────────────────────────────────────────────────────

def upsert_events(events: List[Dict[str, Any]]) -> int:
    """
    Insert or update events by primary key (id).
    Returns the number of rows written.
    """
    if not events:
        return 0

    with _cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO events (id, title, lat, lng, start_time, link, location, source)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                title      = EXCLUDED.title,
                lat        = EXCLUDED.lat,
                lng        = EXCLUDED.lng,
                start_time = EXCLUDED.start_time,
                link       = EXCLUDED.link,
                location   = EXCLUDED.location,
                source     = EXCLUDED.source,
                updated_at = NOW()
            """,
            [
                (
                    e["id"],
                    e["title"],
                    e["lat"],
                    e["lng"],
                    e["start_time"],
                    e["link"],
                    e.get("location"),
                    e.get("source", "terplink"),
                )
                for e in events
            ],
        )
        return cur.rowcount


# ── Read ───────────────────────────────────────────────────────────────────

def get_upcoming_events() -> List[Dict[str, Any]]:
    """Return all future events with valid coordinates, ordered by start_time."""
    with _cursor() as cur:
        cur.execute(
            """
            SELECT id, title, lat, lng, start_time, link, location, source
            FROM   events
            WHERE  start_time >= NOW()
            ORDER  BY start_time
            """
        )
        return [dict(row) for row in cur.fetchall()]
