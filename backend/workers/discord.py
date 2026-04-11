"""
workers/discord.py — Listen to UMD Discord servers and extract opportunities.

TODO:
  1. Add DISCORD_BOT_TOKEN to .env
  2. Invite the bot to your server with read-message permissions
  3. Set DISCORD_CHANNEL_IDS (comma-separated) in .env
  4. Implement on_message to call core.ai_parser.extract_event()
  5. Call core.database.upsert_events() with the parsed result

Run:  python -m workers.discord
"""

import os

# import discord
# from core.ai_parser import extract_event
# from core.database import upsert_events


def main():
    raise NotImplementedError(
        "Discord worker not yet implemented. See TODO comments above."
    )


if __name__ == "__main__":
    main()
