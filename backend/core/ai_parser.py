"""
core/ai_parser.py — Use Gemini Flash to extract structured event data
from unstructured text (Discord messages, email newsletters, etc.).

TODO: Wire up the Gemini API key in .env and implement extract_event().
"""

import json
import os
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

# Load valid campus buildings
_CAMPUS_MAP_PATH = os.path.join(os.path.dirname(__file__), "..", "campus_map.json")
with open(_CAMPUS_MAP_PATH) as f:
    _buildings = json.load(f)
    VALID_BUILDINGS = [b["name"] for b in _buildings]

_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))


def extract_event(
    raw_text: str,
    image_bytes: Optional[bytes] = None,
    image_mime_type: str = "image/png",
    source: str = "discord",
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
            "source":     str,   # matches the `source` argument
        }
    """
    system_prompt = f"""
You are an event extraction AI. Extract the details of the event described in the text/image.
Return ONLY a valid JSON object with the following keys and NO markdown formatting or wrapping backticks:
- "title": event name (string)
- "start_time": strictly an ISO-8601 string, e.g. "2026-04-12T18:00:00-04:00"
- "location": you MUST choose the closest matching building from this list: {json.dumps(VALID_BUILDINGS)}. If the location is off-campus or does not match any building in this list, you MUST set location to null.
- "link": string, or empty string if none
- "source": always "{source}"

If the input does not describe an event, return exactly: null
"""

    contents: list = [raw_text]
    if image_bytes:
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type))

    try:
        response = _client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=system_prompt),
        )
        text = response.text.strip()
        if text == "null":
            return None
        
        # Remove any Markdown codeblock wrapping if the model ignored the instruction
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
        print(f"Error parsing event: {e}")
        return None
