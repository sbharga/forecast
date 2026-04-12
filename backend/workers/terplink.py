"""
workers/terplink.py — Fetch events from TerpLink and write to SQLite.

Run manually:   python -m workers.terplink
Run on a cron:  add to crontab or a scheduler (e.g., every 30 min)
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

import requests

from core.database import upsert_events
from core.embedder import embedding_to_json, generate_embedding
from core.geocoder import get_coordinates

log = logging.getLogger("forecast.terplink")

TERPLINK_URL = "https://terplink.umd.edu/api/discovery/event/search"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 ForecastBot/1.0"
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
    t0 = time.perf_counter()
    log.info("[terplink] Fetching up to %d events from TerpLink…", limit)

    try:
        resp = requests.get(
            TERPLINK_URL,
            params={"status": "Approved", "take": limit},
            headers=HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
    except requests.Timeout:
        log.error("[terplink] Request timed out after 10s.")
        return 0
    except requests.HTTPError as e:
        log.error("[terplink] HTTP %d from TerpLink.", e.response.status_code)
        return 0

    raw_events = resp.json().get("value", [])
    log.info("[terplink] Received %d raw events. Geocoding + embedding…", len(raw_events))

    map_ready: List[Dict[str, Any]] = []
    skipped = 0
    for e in raw_events:
        location = (e.get("location") or "").strip()
        coords = get_coordinates(location)
        if coords is None:
            skipped += 1
            continue

        lat, lng = coords
        event_id = e.get("id")
        title = (e.get("name") or "").strip()

        embed_text = title
        if location:
            embed_text += " " + location
        try:
            embedding = embedding_to_json(generate_embedding(embed_text))
        except Exception as emb_err:
            log.warning("[terplink] Embedding failed for '%s': %s", title, emb_err)
            embedding = None

        map_ready.append(
            {
                "id":         event_id,
                "title":      title,
                "lat":        lat,
                "lng":        lng,
                "start_time": _normalize_time(e.get("startsOn", "")),
                "link":       f"https://terplink.umd.edu/event/{event_id}",
                "location":   location or None,
                "source":     "terplink",
                "embedding":  embedding,
            }
        )

    log.info("[terplink] Geocoded %d events (%d skipped — no coords).", len(map_ready), skipped)

    written = upsert_events(map_ready)
    elapsed = time.perf_counter() - t0
    log.info("[terplink] Done. Upserted %d events in %.1fs.", written, elapsed)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%H:%M:%S")
    from core.database import init_db
    init_db()
    fetch_and_sync()
