"""
workers/gmail_sync.py — Scan each signed-in user's Gmail for deadlines and events.

For each user who has granted gmail.readonly access, this worker:
  1. Queries messages since the last sync (first run: past 7 days, read or unread).
  2. Passes the email body through the Gemini AI parser (source='gmail').
  3. Saves any extracted deadline immediately (no location needed).
  4. Geocodes the location and saves map events if a campus building matched.
  5. Updates last_gmail_sync so the next run only fetches new messages.

Runs as a background asyncio task started in api/main.py lifespan.
"""

import asyncio
import base64
import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

from core.ai_parser import extract_event
from core.database import (
    get_all_users_with_refresh_tokens,
    update_last_gmail_sync,
    upsert_deadline,
    upsert_events,
)
from core.geocoder import get_coordinates

log = logging.getLogger("forecast.gmail")

POLL_INTERVAL_SECONDS = 900  # 15 minutes
INITIAL_LOOKBACK_DAYS = 7    # how far back to look on a user's first sync

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
    for part in payload.get("parts", []):
        text = _decode_email_body(part)
        if text:
            return text

    return ""


def _stable_event_id(message_id: str) -> int:
    """Generate a stable integer event ID from a Gmail message ID."""
    return int(hashlib.sha256(f"gmail:{message_id}".encode()).hexdigest()[:15], 16)


def sync_user_gmail(user: Dict[str, Any]) -> Dict[str, int]:
    """
    Scan one user's Gmail for deadlines and events since their last sync.
    Returns a dict with counts: { 'emails': N, 'deadlines': N, 'events': N }
    """
    if not _CLIENT_ID:
        log.error("[gmail] GOOGLE_CLIENT_ID not set — skipping sync")
        return {"emails": 0, "deadlines": 0, "events": 0}

    email = user["email"]

    # Build the date-range query.
    # Use last_gmail_sync if available, else look back INITIAL_LOOKBACK_DAYS.
    last_sync = user.get("last_gmail_sync")
    if last_sync:
        try:
            dt = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
            after_epoch = int(dt.timestamp())
            query = f"after:{after_epoch}"
            log.info("[gmail] Syncing %s since %s", email, last_sync)
        except ValueError:
            query = f"newer_than:{INITIAL_LOOKBACK_DAYS}d"
            log.info("[gmail] Syncing %s (bad last_sync timestamp, using %dd window)", email, INITIAL_LOOKBACK_DAYS)
    else:
        query = f"newer_than:{INITIAL_LOOKBACK_DAYS}d"
        log.info("[gmail] First sync for %s — looking back %d days", email, INITIAL_LOOKBACK_DAYS)

    creds   = _build_credentials(user["refresh_token"])
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    try:
        result = service.users().messages().list(
            userId="me",
            q=query,
            maxResults=50,
        ).execute()
    except HttpError as e:
        log.error("[gmail] Failed to list messages for %s: %s", email, e)
        return {"emails": 0, "deadlines": 0, "events": 0}

    messages = result.get("messages", [])
    log.info("[gmail] %s — found %d message(s) to scan", email, len(messages))

    if not messages:
        _record_sync(user)
        return {"emails": 0, "deadlines": 0, "events": 0}

    deadline_count  = 0
    events_to_upsert = []

    for msg_ref in messages:
        msg_id = msg_ref["id"]
        try:
            message = service.users().messages().get(
                userId="me", id=msg_id, format="full"
            ).execute()
        except HttpError as e:
            log.warning("[gmail] Failed to fetch message %s: %s", msg_id, e)
            continue

        body = _decode_email_body(message.get("payload", {}))
        if not body.strip():
            continue

        event = extract_event(body, source="gmail")
        if event is None:
            log.debug("[gmail] Message %s — no event/deadline found", msg_id)
            continue

        log.info("[gmail] Message %s — extracted: title=%r deadline=%s location=%s",
                 msg_id,
                 event.get("title"),
                 event.get("deadline_time"),
                 event.get("location"))

        # Save deadline (no location required)
        if event.get("deadline_time"):
            upsert_deadline(
                title         = event.get("title") or "Untitled",
                source        = "gmail",
                link          = event.get("link") or "",
                deadline_time = event["deadline_time"],
            )
            deadline_count += 1
            log.info("[gmail] Saved deadline: %r due %s", event.get("title"), event["deadline_time"])

        # Save map event if location resolves to a campus building
        location = event.get("location")
        if location:
            coords = get_coordinates(location)
            if coords:
                lat, lng = coords
                events_to_upsert.append({
                    "id":         _stable_event_id(msg_id),
                    "title":      event.get("title", "Untitled Event"),
                    "lat":        lat,
                    "lng":        lng,
                    "start_time": event.get("start_time", ""),
                    "link":       event.get("link", ""),
                    "location":   location,
                    "source":     "gmail",
                })

    if events_to_upsert:
        upsert_events(events_to_upsert)

    _record_sync(user)

    log.info("[gmail] %s — done. deadlines=%d events=%d", email, deadline_count, len(events_to_upsert))
    return {"emails": len(messages), "deadlines": deadline_count, "events": len(events_to_upsert)}


def _record_sync(user: Dict[str, Any]) -> None:
    """Stamp last_gmail_sync so the next run only fetches new messages."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        update_last_gmail_sync(user["id"], now)
    except Exception as e:
        log.warning("[gmail] Could not update last_gmail_sync for %s: %s", user["email"], e)


async def run_gmail_sync_loop() -> None:
    """Background loop that periodically syncs Gmail for all registered users."""
    while True:
        if not _CLIENT_ID:
            log.error("[gmail] GOOGLE_CLIENT_ID not set — Gmail sync loop idle")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue

        users = get_all_users_with_refresh_tokens()
        log.info("[gmail] Sync tick — %d user(s) with refresh tokens", len(users))

        for user in users:
            try:
                sync_user_gmail(user)
            except Exception as e:
                log.exception("[gmail] Unexpected error syncing %s: %s", user["email"], e)

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
