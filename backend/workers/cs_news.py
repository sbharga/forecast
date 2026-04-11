"""
workers/cs_news.py — Pull UMD CS department news and write to the database.

Feed:  https://cs.umd.edu/feeds/news/all  (RSS 2.0)

Because news articles don't carry an explicit location, every item is pinned
to the Brendan Iribe Center (the CS building) by default.  The pubDate is
used as start_time so items appear on the date they were published.

Run manually:   python -m workers.cs_news
Cron suggestion: every 6 hours (news updates less frequently than TerpLink)
"""

import sys
import zlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List

import feedparser

from core.database import upsert_events

CS_NEWS_FEED = "https://cs.umd.edu/feeds/news/all"

# Iribe Center coordinates — default pin for all CS news items
IRIBE_LAT = 38.9891607057353
IRIBE_LNG = -76.9364438800535


def _stable_id(url: str) -> int:
    """
    Generate a stable positive BIGINT from a URL so we can upsert without
    a natural integer primary key from the feed.
    Uses CRC32 — collision probability is negligible for a few hundred articles.
    """
    return zlib.crc32(url.encode()) & 0x7FFFFFFF


def _parse_date(entry) -> str:
    """
    Return an ISO-8601 string from an RSS entry's date fields.
    Falls back to UTC now if no date is present.
    """
    # feedparser normalises dates into a time.struct_time at entry.published_parsed
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    # Raw string fallback
    if hasattr(entry, "published") and entry.published:
        try:
            return parsedate_to_datetime(entry.published).isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def fetch_and_sync() -> int:
    """
    Parse the CS news RSS feed and upsert entries into the database.
    Returns the number of rows written.
    """
    print(f"[cs_news] Fetching feed: {CS_NEWS_FEED}")

    feed = feedparser.parse(CS_NEWS_FEED)

    if feed.bozo and not feed.entries:
        print(
            f"[cs_news] ERROR: Could not parse feed — {feed.bozo_exception}",
            file=sys.stderr,
        )
        return 0

    print(f"[cs_news] Found {len(feed.entries)} articles. Building records...")

    records: List[Dict[str, Any]] = []
    for entry in feed.entries:
        link = entry.get("link", "").strip()
        title = entry.get("title", "").strip()
        if not link or not title:
            continue

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
            }
        )

    written = upsert_events(records)
    print(f"[cs_news] Upserted {written} articles to the database.")
    return written


if __name__ == "__main__":
    fetch_and_sync()
