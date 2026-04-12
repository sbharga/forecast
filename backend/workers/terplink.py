"""
workers/terplink.py — Fetch events from TerpLink and write to SQLite.

Run manually:   python -m workers.terplink
Run on a cron:  add to crontab or a scheduler (e.g., every 30 min)
"""

import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

import requests

from core.database import upsert_events
from core.geocoder import get_coordinates

TERPLINK_URL = "https://terplink.umd.edu/api/discovery/event/search"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 ScopeBot/1.0"
    ),
    "Accept": "application/json",
}


def _normalize_time(raw: str) -> str:
    if not raw:
        return raw
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except (ValueError, TypeError):
        return raw


def fetch_and_sync(limit: int = 300) -> int:
    """
    Pull up to `limit` approved events from TerpLink, geocode them,
    and upsert into SQLite. Returns the number of events written.
    """
    print(f"[terplink] Fetching up to {limit} events from TerpLink...")

    try:
        resp = requests.get(
            TERPLINK_URL,
            params={"status": "Approved", "take": limit},
            headers=HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
    except requests.Timeout:
        print("[terplink] ERROR: Request timed out.", file=sys.stderr)
        return 0
    except requests.HTTPError as e:
        print(f"[terplink] ERROR: HTTP {e.response.status_code}", file=sys.stderr)
        return 0

    raw_events = resp.json().get("value", [])
    print(f"[terplink] Got {len(raw_events)} raw events. Geocoding...")

    map_ready: List[Dict[str, Any]] = []
    for e in raw_events:
        location = (e.get("location") or "").strip()
        coords = get_coordinates(location)
        if coords is None:
            continue

        lat, lng = coords
        event_id = e.get("id")
        map_ready.append(
            {
                "id":         event_id,
                "title":      (e.get("name") or "").strip(),
                "lat":        lat,
                "lng":        lng,
                "start_time": _normalize_time(e.get("startsOn", "")),
                "link":       f"https://terplink.umd.edu/event/{event_id}",
                "location":   location or None,
                "source":     "terplink",
            }
        )

    written = upsert_events(map_ready)
    print(f"[terplink] Upserted {written} map-ready events to scope.db.")
    return written


if __name__ == "__main__":
    fetch_and_sync()
