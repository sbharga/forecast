"""
scraper.py — TerpLink event scraper stub.

Replace the placeholder logic with real TerpLink API calls or
HTML scraping once you have a valid session token / API key.
"""

import requests
from typing import List, Dict, Any

TERPLINK_BASE_URL = "https://terplink.umd.edu"


def fetch_terplink(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Fetch upcoming public events from TerpLink.

    Returns a list of raw event dicts (not yet normalized to the
    Event schema used by main.py).  Caller is responsible for
    mapping fields to {id, title, lat, lng, start_time, link}.

    Args:
        limit: Maximum number of events to return.

    Returns:
        List of event dicts from TerpLink.

    Raises:
        requests.HTTPError: If the request fails.
    """
    # TODO: Replace with the real TerpLink API endpoint.
    # The Campus Labs / Anthology Engage API is typically:
    #   GET /api/discovery/event/search?endsAfter=<ISO>&status=Approved&take=<limit>
    # You may need an Authorization header with a bearer token.
    url = f"{TERPLINK_BASE_URL}/api/discovery/event/search"
    params = {
        "status": "Approved",
        "take": limit,
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()

    data = response.json()
    # The Engage API wraps results in a "value" key
    events = data.get("value", [])
    return events


if __name__ == "__main__":
    # Quick smoke-test — run with:  python scraper.py
    import json

    events = fetch_terplink(limit=5)
    print(json.dumps(events, indent=2))
