"""
core/ai_parser.py — Use Gemini Flash to extract structured event data
from unstructured text (Discord messages, email newsletters, etc.).

TODO: Wire up the Gemini API key in .env and implement extract_event().
"""

import os
from typing import Any, Dict, Optional


def extract_event(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Given a blob of text (Discord message, email body, etc.), return a
    normalised event dict or None if no event was detected.

    Expected output shape:
        {
            "title":      str,
            "location":   str,   # raw string — geocoder will convert to lat/lng
            "start_time": str,   # ISO-8601 if parseable, else raw string
            "link":       str,
            "source":     str,   # "discord" | "gmail"
        }
    """
    # TODO: implement with google-generativeai SDK
    # import google.generativeai as genai
    # genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    # model = genai.GenerativeModel("gemini-1.5-flash")
    # ...
    raise NotImplementedError("ai_parser.extract_event() not yet implemented")
