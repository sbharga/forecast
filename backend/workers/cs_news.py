"""
workers/cs_news.py — Pull UMD CS department news and write to the database.

Feed:  https://cs.umd.edu/feeds/news/all  (RSS 2.0)

Run manually:   python -m workers.cs_news
Cron suggestion: every 6 hours
"""

import logging
import time
import zlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List

import feedparser

from core.database import upsert_events
from core.embedder import embedding_to_json, generate_embedding

log = logging.getLogger("forecast.cs_news")

CS_NEWS_FEED = "https://cs.umd.edu/feeds/news/all"

IRIBE_LAT = 38.9891607057353
IRIBE_LNG = -76.9364438800535


def _stable_id(url: str) -> int:
    return zlib.crc32(url.encode()) & 0x7FFFFFFF


def _parse_date(entry) -> str:
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    if hasattr(entry, "published") and entry.published:
        try:
            return parsedate_to_datetime(entry.published).isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def fetch_and_sync() -> int:
    t0 = time.perf_counter()
    log.info("[cs_news] Fetching feed: %s", CS_NEWS_FEED)

    feed = feedparser.parse(CS_NEWS_FEED)

    if feed.bozo and not feed.entries:
        log.error("[cs_news] Could not parse feed — %s", feed.bozo_exception)
        return 0

    log.info("[cs_news] Received %d articles. Building records…", len(feed.entries))

    records: List[Dict[str, Any]] = []
    skipped = 0
    for entry in feed.entries:
        link = entry.get("link", "").strip()
        title = entry.get("title", "").strip()
        if not link or not title:
            skipped += 1
            continue

        try:
            embedding = embedding_to_json(generate_embedding(title))
        except Exception as emb_err:
            log.warning("[cs_news] Embedding failed for '%s': %s", title, emb_err)
            embedding = None

        records.append(
            {
                "id":         _stable_id(link),
                "title":      title,
                "lat":        IRIBE_LAT,
                "lng":        IRIBE_LNG,
                "start_time": _parse_date(entry),
                "link":       link,
                "location":   "Brendan Iribe Center for Computer Science and Engineering",
                "source":     "cs_news",
                "embedding":  embedding,
            }
        )

    written = upsert_events(records)
    elapsed = time.perf_counter() - t0
    log.info("[cs_news] Done. Upserted %d articles (%d skipped) in %.1fs.", written, skipped, elapsed)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s", datefmt="%H:%M:%S")
    from core.database import init_db
    init_db()
    fetch_and_sync()
