"""
core/database.py — SQLite connection and event helpers.

The database file lives at backend/scope.db (created automatically on first run).
No environment variables required.
"""

import json
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
    """Create all tables if they don't exist. Called on API startup."""
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
        # Additive migration — safe on existing DBs
        try:
            cur.execute("ALTER TABLE events ADD COLUMN embedding TEXT")
        except Exception:
            pass  # column already exists
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id          INTEGER PRIMARY KEY,
                events_channel_id INTEGER NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                google_sub         TEXT    NOT NULL UNIQUE,
                email              TEXT    NOT NULL,
                name               TEXT,
                refresh_token      TEXT,
                gmail_sync_enabled INTEGER NOT NULL DEFAULT 1,
                last_gmail_sync    TEXT,
                created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub)"
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
            INSERT INTO events (id, title, lat, lng, start_time, link, location, source, embedding, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                title      = excluded.title,
                lat        = excluded.lat,
                lng        = excluded.lng,
                start_time = excluded.start_time,
                link       = excluded.link,
                location   = excluded.location,
                source     = excluded.source,
                embedding  = COALESCE(excluded.embedding, events.embedding),
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
                    e.get("embedding"),
                )
                for e in events
            ],
        )
        return cur.rowcount


# ── Read ───────────────────────────────────────────────────────────────────

def _filter_future(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep only rows whose start_time is in the future."""
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


def get_upcoming_events() -> List[Dict[str, Any]]:
    """Return all future events ordered by start_time."""
    with _cursor() as cur:
        cur.execute(
            "SELECT id, title, lat, lng, start_time, link, location, source "
            "FROM events WHERE start_time >= datetime('now') ORDER BY start_time"
        )
        return [dict(r) for r in cur.fetchall()]


def get_events_since(since: datetime) -> List[Dict[str, Any]]:
    """Return future events updated after `since`, ordered by start_time."""
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    since_str = since.isoformat()
    with _cursor() as cur:
        cur.execute(
            "SELECT id, title, lat, lng, start_time, link, location, source "
            "FROM events WHERE updated_at > ? AND start_time >= datetime('now') ORDER BY start_time",
            (since_str,),
        )
        return [dict(r) for r in cur.fetchall()]


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


def get_all_embeddings() -> Dict[int, List[float]]:
    """
    Return all stored event embeddings as {event_id: [float]}.
    Called once at API startup to populate the in-memory embedding cache.
    """
    with _cursor() as cur:
        cur.execute("SELECT id, embedding FROM events WHERE embedding IS NOT NULL")
        result: Dict[int, List[float]] = {}
        for row in cur.fetchall():
            try:
                result[row["id"]] = json.loads(row["embedding"])
            except Exception:
                pass
    return result


def get_events_channel(guild_id: int) -> Optional[int]:
    """Get the target events channel for a given guild. Returns None if not set."""
    with _cursor() as cur:
        cur.execute(
            "SELECT events_channel_id FROM guild_settings WHERE guild_id = ?",
            (guild_id,),
        )
        row = cur.fetchone()
        return row["events_channel_id"] if row else None


# ── Users ──────────────────────────────────────────────────────────────────

def upsert_user(google_sub: str, email: str, name: Optional[str], refresh_token: Optional[str]) -> Dict[str, Any]:
    """Insert or update a user by Google subject ID. Returns the user row."""
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (google_sub, email, name, refresh_token, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(google_sub) DO UPDATE SET
                email         = excluded.email,
                name          = excluded.name,
                refresh_token = COALESCE(excluded.refresh_token, users.refresh_token),
                updated_at    = datetime('now')
            """,
            (google_sub, email, name, refresh_token),
        )
        cur.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,))
        return dict(cur.fetchone())


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Return a user row by primary key, or None if not found."""
    with _cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def get_all_users_with_refresh_tokens() -> List[Dict[str, Any]]:
    """Return all users who have a stored refresh token and gmail sync enabled."""
    with _cursor() as cur:
        cur.execute(
            "SELECT * FROM users WHERE refresh_token IS NOT NULL AND gmail_sync_enabled = 1"
        )
        return [dict(r) for r in cur.fetchall()]
