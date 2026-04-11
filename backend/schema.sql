-- ─────────────────────────────────────────────────────────────────────────
-- Scope — Supabase schema
-- Paste this into the Supabase SQL Editor and click Run.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id         BIGINT           PRIMARY KEY,
  title      TEXT             NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  start_time TIMESTAMPTZ      NOT NULL,
  link       TEXT             NOT NULL,
  location   TEXT,
  source     TEXT             NOT NULL DEFAULT 'terplink',
  created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Fast date-range queries for GET /api/events
CREATE INDEX IF NOT EXISTS events_start_time_idx ON events (start_time);

-- Auto-bump updated_at on every update
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
