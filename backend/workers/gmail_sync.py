"""
workers/gmail_sync.py — Scan each signed-in user's Gmail for event-related emails
and populate the events database.

For each user who has granted gmail.readonly access, this worker:
  1. Queries unread messages in their inbox from the past day.
  2. Passes the email body through the Gemini AI parser (source='gmail').
  3. Geocodes the extracted location.
  4. Upserts the event into the database.
  5. Marks the email as read.

Runs as a background asyncio task started in api/main.py lifespan.
"""

import asyncio
import base64
import hashlib
import os
from typing import Any, Dict

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

from core.ai_parser import extract_event
from core.database import get_all_users_with_refresh_tokens, upsert_events
from core.geocoder import get_coordinates

POLL_INTERVAL_SECONDS = 900  # 15 minutes

_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _build_credentials(refresh_token: str) -> Credentials:
    """Return Google OAuth2 Credentials from a stored refresh token."""
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=_CLIENT_ID,
        client_secret=None,  # public (mobile) client — no secret
        token_uri=_TOKEN_URI,
    )


def _decode_email_body(payload: Dict[str, Any]) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    mime_type = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime_type == "text/plain" and body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")

    # Walk multipart parts, prefer text/plain
    parts = payload.get("parts", [])
    for part in parts:
        text = _decode_email_body(part)
        if text:
            return text

    return ""


def _stable_event_id(message_id: str) -> int:
    """Generate a stable integer event ID from a Gmail message ID."""
    return int(hashlib.sha256(f"gmail:{message_id}".encode()).hexdigest()[:15], 16)


def sync_user_gmail(user: Dict[str, Any]) -> int:
    """
    Synchronously scan a single user's Gmail for new events.
    Returns the number of events upserted.
    """
    if not _CLIENT_ID:
        print("Gmail sync: GOOGLE_CLIENT_ID not set, skipping")
        return 0

    creds = _build_credentials(user["refresh_token"])
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    # Fetch unread messages from the past day
    try:
        result = service.users().messages().list(
            userId="me",
            q="is:unread newer_than:1d",
            maxResults=20,
        ).execute()
    except HttpError as e:
        print(f"Gmail sync: failed to list messages for {user['email']}: {e}")
        return 0

    messages = result.get("messages", [])
    if not messages:
        return 0

    events_to_upsert = []

    for msg_ref in messages:
        msg_id = msg_ref["id"]
        try:
            message = service.users().messages().get(
                userId="me", id=msg_id, format="full"
            ).execute()
        except HttpError as e:
            print(f"Gmail sync: failed to fetch message {msg_id}: {e}")
            continue

        body = _decode_email_body(message.get("payload", {}))
        if not body.strip():
            continue

        event = extract_event(body, source="gmail")
        if event is None:
            # Not an event email — mark as read so we don't reprocess it
            _mark_read(service, msg_id, user["email"])
            continue

        # Geocode location
        location = event.get("location")
        coords = get_coordinates(location) if location else None
        if coords is None:
            # Can't place on map — skip but mark read
            _mark_read(service, msg_id, user["email"])
            continue

        lat, lng = coords
        events_to_upsert.append({
            "id": _stable_event_id(msg_id),
            "title": event.get("title", "Untitled Event"),
            "lat": lat,
            "lng": lng,
            "start_time": event.get("start_time", ""),
            "link": event.get("link", ""),
            "location": location,
            "source": "gmail",
        })

        _mark_read(service, msg_id, user["email"])

    if events_to_upsert:
        upsert_events(events_to_upsert)

    return len(events_to_upsert)


def _mark_read(service, message_id: str, email: str) -> None:
    try:
        service.users().messages().modify(
            userId="me",
            id=message_id,
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()
    except HttpError as e:
        print(f"Gmail sync: failed to mark {message_id} as read for {email}: {e}")


async def run_gmail_sync_loop() -> None:
    """Background loop that periodically syncs Gmail for all registered users."""
    while True:
        users = get_all_users_with_refresh_tokens()
        for user in users:
            try:
                count = sync_user_gmail(user)
                if count > 0:
                    print(f"Gmail sync: upserted {count} event(s) for {user['email']}")
            except Exception as e:
                print(f"Gmail sync: error for {user['email']}: {e}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
