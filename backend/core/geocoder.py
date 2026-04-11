"""
core/geocoder.py — Fuzzy-match a location string to UMD GPS coordinates.
Used by all workers (TerpLink, Discord, Gmail) to normalise locations.
"""

import json
import os
import re
from typing import Optional, Tuple

from thefuzz import process

_buildings: Optional[list] = None

# campus_map.json sits one level up from core/
_CAMPUS_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "campus_map.json")

SCORE_THRESHOLD = 70


def _load_buildings() -> list:
    global _buildings
    if _buildings is None:
        with open(_CAMPUS_MAP_PATH) as f:
            _buildings = json.load(f)
    return _buildings


def _clean(location: str) -> str:
    s = location.strip()
    s = re.sub(r",.*", "", s)               # drop after comma
    s = re.sub(r"\b\d{3,4}\b", "", s)       # room numbers
    s = re.sub(
        r"\b(room|rm|suite|ste|floor|fl|bldg|building)\b", "", s, flags=re.I
    )
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s


def get_coordinates(location_string: str) -> Optional[Tuple[float, float]]:
    """
    Return (lat, lng) for a location string, or None if no confident match.
    Short/vague strings ("Online", "Zoom", "TBA") return None automatically.
    """
    if not location_string or not location_string.strip():
        return None

    cleaned = _clean(location_string)
    if len(cleaned) < 7:
        return None

    buildings = _load_buildings()
    names = [b["name"] for b in buildings]
    result = process.extractOne(cleaned, names, score_cutoff=SCORE_THRESHOLD)
    if result is None:
        return None

    matched_name = result[0]
    building = next((b for b in buildings if b["name"] == matched_name), None)
    if building is None:
        return None

    return building["lat"], building["lng"]
