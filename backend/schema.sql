-- ─────────────────────────────────────────────────────────────────────────
-- Scope — SQLite schema
-- This file is for reference. The API auto-creates the schema on startup
-- via init_db() in core/database.py.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY,
    title      TEXT    NOT NULL,
    lat        REAL    NOT NULL,
    lng        REAL    NOT NULL,
    start_time TEXT    NOT NULL,          -- ISO 8601 string, e.g. 2026-04-11T17:00:00+00:00
    link       TEXT    NOT NULL,
    location   TEXT,
    source     TEXT    NOT NULL DEFAULT 'terplink',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS events_start_time_idx ON events (start_time);
