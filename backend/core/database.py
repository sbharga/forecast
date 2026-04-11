"""
core/database.py — SQLite connection and event helpers.

The database file lives at backend/scope.db (created automatically on first run).
No environment variables required.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "scope.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _cursor():
    """Context manager that yields a cursor and auto-commits/rolls back."""
    conn = _get_conn()
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Schema init ────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create the events table if it doesn't exist. Called on API startup."""
    with _cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id         INTEGER PRIMARY KEY,
                title      TEXT    NOT NULL,
                lat        REAL    NOT NULL,
                lng        REAL    NOT NULL,
                start_time TEXT    NOT NULL,
                link       TEXT    NOT NULL,
                location   TEXT,
                source     TEXT    NOT NULL DEFAULT 'terplink',
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS events_start_time_idx ON events (start_time)"
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id          INTEGER PRIMARY KEY,
                events_channel_id INTEGER NOT NULL
            )
            """
        )


# ── Write ──────────────────────────────────────────────────────────────────

def upsert_events(events: List[Dict[str, Any]]) -> int:
    """
    Insert or update events by primary key (id).
    Returns the number of rows affected.
    """
    if not events:
        return 0

    with _cursor() as cur:
        cur.executemany(
            """
            INSERT INTO events (id, title, lat, lng, start_time, link, location, source, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                title      = excluded.title,
                lat        = excluded.lat,
                lng        = excluded.lng,
                start_time = excluded.start_time,
                link       = excluded.link,
                location   = excluded.location,
                source     = excluded.source,
                updated_at = datetime('now')
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
            "SELECT id, title, lat, lng, start_time, link, location, source "
            "FROM events ORDER BY start_time"
        )
        rows = [dict(r) for r in cur.fetchall()]

    # Filter to future events in Python to avoid SQLite timezone quirks
    now = datetime.now(timezone.utc)
    result = []
    for r in rows:
        try:
            st = datetime.fromisoformat(r["start_time"])
            if st.tzinfo is None:
                st = st.replace(tzinfo=timezone.utc)
            if st >= now:
                result.append(r)
        except ValueError:
            result.append(r)  # include if unparseable rather than silently drop
    return result


# ── Guild Settings ─────────────────────────────────────────────────────────

def set_events_channel(guild_id: int, channel_id: int) -> None:
    """Set the target events channel for a given guild."""
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO guild_settings (guild_id, events_channel_id)
            VALUES (?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                events_channel_id = excluded.events_channel_id
            """,
            (guild_id, channel_id),
        )


def get_events_channel(guild_id: int) -> Optional[int]:
    """Get the target events channel for a given guild. Returns None if not set."""
    with _cursor() as cur:
        cur.execute(
            "SELECT events_channel_id FROM guild_settings WHERE guild_id = ?",
            (guild_id,),
        )
        row = cur.fetchone()
        return row["events_channel_id"] if row else None
