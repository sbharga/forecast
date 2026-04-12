"""
core/ai_parser.py — Use Gemini Flash to extract structured event data
from unstructured text (Discord messages, email newsletters, etc.).
"""

import json
import logging
import os
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

log = logging.getLogger("scope.ai_parser")

# Load valid campus buildings
_CAMPUS_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "campus_map.json")
with open(_CAMPUS_MAP_PATH) as f:
    _buildings = json.load(f)
    VALID_BUILDINGS = [b["name"] for b in _buildings]

_api_key = os.environ.get("GEMINI_API_KEY")
_client = genai.Client(api_key=_api_key) if _api_key else None

_SYSTEM_PROMPT = f"""
You are an event extraction AI. Extract the details of the event described in the text/image.
Return ONLY a valid JSON object with the following keys and NO markdown formatting or wrapping backticks:
- "title": event name (string)
- "start_time": strictly an ISO-8601 string, e.g. "2026-04-12T18:00:00-04:00"
- "location": you MUST choose the closest matching building from this list: {json.dumps(VALID_BUILDINGS)}. If the location is off-campus or does not match any building in this list, you MUST set location to null.
- "link": string, or empty string if none
- "source": always "discord"

If the input does not describe an event, return exactly: null
"""


def extract_event(
    raw_text: str, image_bytes: Optional[bytes] = None, image_mime_type: str = "image/png"
) -> Optional[Dict[str, Any]]:
    """
    Given a blob of text (Discord message, email body, etc.) and an optional image,
    return a normalised event dict or None if no event was detected.

    Expected output shape:
        {
            "title":      str,
            "location":   str,   # Must be one of the VALID_BUILDINGS or null
            "start_time": str,   # ISO-8601
            "link":       str,
            "source":     str,   # "discord"
        }
    """
    if _client is None:
        log.error("[ai_parser] GEMINI_API_KEY is not set — cannot parse event.")
        return None

    parts = [types.Part.from_text(text=raw_text)]
    if image_bytes:
        parts.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type))

    try:
        response = _client.models.generate_content(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(system_instruction=_SYSTEM_PROMPT),
            contents=parts,
        )
        text = response.text.strip()

        if text == "null":
            return None

        # Strip Markdown code fences if the model ignored the instruction
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        data = json.loads(text.strip())

        # Validate that location is either null or in our list
        if data.get("location") not in VALID_BUILDINGS:
            data["location"] = None

        return data
    except Exception as e:
        log.error("[ai_parser] Failed to parse event: %s", e)
        return None
