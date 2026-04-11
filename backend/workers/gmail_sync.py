"""
workers/gmail_sync.py — Process forwarded opportunity newsletters via Gmail.

TODO:
  1. Enable Gmail API in Google Cloud Console
  2. Download credentials.json and add GMAIL_CREDENTIALS_PATH to .env
  3. Set GMAIL_LABEL to the label you apply to forwarded newsletters
  4. For each unread email in that label, call core.ai_parser.extract_event()
  5. Call core.database.upsert_events() and mark email as read

Run:  python -m workers.gmail_sync
"""

# from googleapiclient.discovery import build
# from core.ai_parser import extract_event
# from core.database import upsert_events


def main():
    raise NotImplementedError(
        "Gmail worker not yet implemented. See TODO comments above."
    )


if __name__ == "__main__":
    main()
