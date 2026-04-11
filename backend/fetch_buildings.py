"""
fetch_buildings.py — One-shot script to populate campus_map.json.

Run this once before starting the server:
    python fetch_buildings.py
"""

import json
import sys
import requests

UMD_BUILDINGS_URL = "https://api.umd.io/v0/map/buildings"


def main():
    print(f"Fetching buildings from {UMD_BUILDINGS_URL} ...")
    try:
        resp = requests.get(UMD_BUILDINGS_URL, timeout=15)
        resp.raise_for_status()
    except requests.Timeout:
        print("ERROR: Request timed out.", file=sys.stderr)
        sys.exit(1)
    except requests.HTTPError as e:
        print(f"ERROR: HTTP {e.response.status_code}", file=sys.stderr)
        sys.exit(1)

    raw = resp.json()

    buildings = []
    for b in raw:
        name = b.get("name", "").strip()
        lat = b.get("lat")
        lng = b.get("lng")
        if name and lat is not None and lng is not None:
            buildings.append({"name": name, "lat": float(lat), "lng": float(lng)})

    if not buildings:
        print("ERROR: No buildings returned — check the API response.", file=sys.stderr)
        sys.exit(1)

    with open("campus_map.json", "w") as f:
        json.dump(buildings, f, indent=2)

    print(f"Loaded {len(buildings)} buildings → campus_map.json")


if __name__ == "__main__":
    main()
