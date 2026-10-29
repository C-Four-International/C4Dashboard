#!/usr/bin/env python3
"""
Interactive helper to generate a Telethon StringSession.
Prints TELEGRAM_SESSION=<string> which can be placed in .env or passed as an environment variable.

Usage:
  python generate_session.py
"""

import sys
import asyncio

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
except ImportError:
    print("Error: telethon is not installed. Run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)


async def main():
    print("=" * 60)
    print("Telethon StringSession Generator for World Monitor")
    print("=" * 60)
    print("You will need your API ID and API Hash from https://my.telegram.org/apps\n")

    api_id_str = input("Enter TELEGRAM_API_ID: ").strip()
    api_hash = input("Enter TELEGRAM_API_HASH: ").strip()

    if not api_id_str or not api_hash:
        print("Error: Both API ID and API Hash are required.")
        sys.exit(1)

    api_id = int(api_id_str)
    client = TelegramClient(StringSession(), api_id, api_hash)

    print("\nConnecting to Telegram MTProto servers...")
    await client.start()

    session_str = client.session.save()
    print("\n" + "=" * 60)
    print("✅ Authorization Successful! Your TELEGRAM_SESSION is:\n")
    print(f"TELEGRAM_SESSION={session_str}")
    print("=" * 60)
    print("\nAdd TELEGRAM_SESSION to your remote deployment environment variables.")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
