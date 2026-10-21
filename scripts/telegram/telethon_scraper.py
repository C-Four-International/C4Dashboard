#!/usr/bin/env python3
"""
Telethon MTProto Telegram Scraper for World Monitor.
Scrapes prominent news and OSINT channels directly via Telegram's MTProto API
and writes normalized JSON posts to Upstash Redis (and/or local file).

Usage:
  # Scrape once and push to Upstash Redis:
  python telethon_scraper.py --once

  # Continuous scraping poll daemon:
  python telethon_scraper.py --poll --interval 120

  # Save to local JSON file:
  python telethon_scraper.py --once --output telethon_feed.json

Required Environment Variables:
  TELEGRAM_API_ID      - Telegram API ID from https://my.telegram.org
  TELEGRAM_API_HASH    - Telegram API Hash from https://my.telegram.org
  TELEGRAM_SESSION     - (Recommended) Telethon StringSession (generate with generate_session.py)
  OR TELEGRAM_BOT_TOKEN / TELEGRAM_API_KEY - Bot token if running via bot auth

Optional Environment Variables:
  UPSTASH_REDIS_REST_URL   - Upstash Redis REST endpoint
  UPSTASH_REDIS_REST_TOKEN - Upstash Redis REST authorization token
  REDIS_FEED_KEY           - Redis key for all posts (default: worldmonitor:telegram:telethon:feed:v1)
  TELEGRAM_CHANNELS        - Comma-separated list of target channels
"""

import os
import sys
import json
import time
import argparse
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.types import Channel, Chat
except ImportError:
    print("Error: telethon is not installed. Run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    requests = None

# Default prominent OSINT channels
DEFAULT_CHANNELS = [
    "liveukraine_media",
    "clashreport",
    "osinttechnical",
    "inaborodina",
    "MiddleEastSpectator",
    "militarnyi_eng",
    "warmonitor",
    "bellingcat",
]

DEFAULT_REDIS_FEED_KEY = "worldmonitor:telegram:telethon:feed:v1"
DEFAULT_REDIS_CHANNEL_PREFIX = "worldmonitor:telegram:channel"
DEFAULT_CACHE_TTL_SECONDS = 21600  # 6 hours


def log(msg: str):
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{timestamp}] [Telethon] {msg}", flush=True)


def push_to_upstash_redis(key: str, value: Any, ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS) -> bool:
    """Push serialized JSON to Upstash Redis via REST API."""
    redis_url = os.getenv("UPSTASH_REDIS_REST_URL")
    redis_token = os.getenv("UPSTASH_REDIS_REST_TOKEN")

    if not redis_url or not redis_token:
        return False

    if not requests:
        log("requests module not installed, skipping Upstash Redis push")
        return False

    try:
        serialized = json.dumps(value, ensure_ascii=False)
        url = f"{redis_url.rstrip('/')}/set/{requests.utils.quote(key)}/{requests.utils.quote(serialized)}/EX/{ttl_seconds}"
        headers = {"Authorization": f"Bearer {redis_token}"}
        resp = requests.post(url, headers=headers, timeout=5)
        return resp.status_code == 200
    except Exception as e:
        log(f"Upstash Redis push failed for key '{key}': {e}")
        return False


async def create_telethon_client() -> TelegramClient:
    """Initialize Telethon MTProto client using StringSession or Bot Token."""
    api_id_str = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")

    if not api_id_str or not api_hash:
        raise ValueError(
            "Missing TELEGRAM_API_ID or TELEGRAM_API_HASH in environment variables. "
            "Get them from https://my.telegram.org/apps"
        )

    api_id = int(api_id_str)
    session_str = os.getenv("TELEGRAM_SESSION", "")
    session = StringSession(session_str)

    client = TelegramClient(session, api_id, api_hash, connection_retries=3)

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_API_KEY")
    if bot_token and not session_str:
        await client.start(bot_token=bot_token)
    else:
        await client.connect()
        if not await client.is_user_authorized():
            if session_str:
                raise ValueError("TELEGRAM_SESSION string is invalid or expired. Run generate_session.py.")
            elif bot_token:
                await client.start(bot_token=bot_token)
            else:
                raise ValueError(
                    "Telethon client is not authorized. Please generate a TELEGRAM_SESSION with generate_session.py "
                    "or provide TELEGRAM_BOT_TOKEN."
                )

    return client


async def scrape_channel_messages(client: TelegramClient, channel_name: str, limit: int = 15) -> List[Dict[str, Any]]:
    """Scrape recent posts from a specific channel via MTProto."""
    clean_channel = channel_name.strip().lstrip("@")
    posts: List[Dict[str, Any]] = []

    try:
        entity = await client.get_entity(clean_channel)
        title = getattr(entity, "title", clean_channel)

        async for msg in client.iter_messages(entity, limit=limit):
            raw_text = msg.message or getattr(msg, "text", "") or ""
            if not raw_text.strip():
                continue

            dt = msg.date
            published_at = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)

            post_id = f"tg-telethon-{clean_channel}-{msg.id}"
            post_url = f"https://t.me/{clean_channel}/{msg.id}"

            posts.append({
                "id": post_id,
                "platform": "telegram",
                "author": f"@{clean_channel}",
                "authorName": title,
                "url": post_url,
                "publishedAt": published_at,
                "rawText": raw_text,
                "views": getattr(msg, "views", 0) or 0,
                "forwards": getattr(msg, "forwards", 0) or 0,
                "hasMedia": bool(msg.media),
            })
    except Exception as e:
        log(f"Failed to scrape channel @{clean_channel}: {e}")

    return posts


async def scrape_all_channels(client: TelegramClient, channels: List[str], limit_per_channel: int = 15) -> List[Dict[str, Any]]:
    """Scrape all configured channels sequentially to avoid Telegram flood limits."""
    all_posts: List[Dict[str, Any]] = []

    for channel in channels:
        channel = channel.strip()
        if not channel:
            continue
        log(f"Scraping @{channel}...")
        posts = await scrape_channel_messages(client, channel, limit=limit_per_channel)
        all_posts.extend(posts)
        log(f"Retrieved {len(posts)} messages from @{channel}")
        # Brief throttle between channels to respect Telegram MTProto rate limits
        await asyncio.sleep(0.5)

    # Sort descending by publishedAt
    all_posts.sort(key=lambda p: p.get("publishedAt", ""), reverse=True)
    return all_posts


async def run_scrape_cycle(client: TelegramClient, channels: List[str], limit: int, output_file: Optional[str], dry_run: bool):
    """Execute a single scraping cycle and persist results."""
    start_time = time.time()
    posts = await scrape_all_channels(client, channels, limit_per_channel=limit)
    elapsed = time.time() - start_time

    log(f"Total posts collected via Telethon: {len(posts)} across {len(channels)} channels ({elapsed:.2f}s)")

    if output_file:
        try:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(posts, f, ensure_ascii=False, indent=2)
            log(f"Saved {len(posts)} posts to local file: {output_file}")
        except Exception as e:
            log(f"Failed to write output file: {e}")

    if not dry_run:
        redis_feed_key = os.getenv("REDIS_FEED_KEY", DEFAULT_REDIS_FEED_KEY)
        pushed = push_to_upstash_redis(redis_feed_key, posts)
        if pushed:
            log(f"Successfully pushed {len(posts)} posts to Upstash Redis ({redis_feed_key})")
        else:
            log("Upstash Redis push skipped or failed (check UPSTASH_REDIS_REST_URL)")


async def main():
    parser = argparse.ArgumentParser(description="Telethon MTProto Telegram Scraper for World Monitor")
    parser.add_argument("--once", action="store_true", help="Scrape once and exit")
    parser.add_argument("--poll", action="store_true", help="Run continuously in a polling loop")
    parser.add_argument("--interval", type=int, default=120, help="Poll interval in seconds (default: 120)")
    parser.add_argument("--limit", type=int, default=15, help="Messages to fetch per channel (default: 15)")
    parser.add_argument("--channels", type=str, default="", help="Comma-separated channel list")
    parser.add_argument("--output", type=str, default=None, help="Save JSON output to specified file")
    parser.add_argument("--dry-run", action="store_true", help="Print stats without writing to Redis")

    args = parser.parse_args()

    channels_env = os.getenv("TELEGRAM_CHANNELS", "")
    if args.channels:
        channel_list = [c.strip() for c in args.channels.split(",") if c.strip()]
    elif channels_env:
        channel_list = [c.strip() for c in channels_env.split(",") if c.strip()]
    else:
        channel_list = DEFAULT_CHANNELS

    log(f"Starting Telethon scraper with {len(channel_list)} target channels")

    client = await create_telethon_client()
    try:
        if args.poll:
            log(f"Entering continuous polling loop (interval: {args.interval}s)")
            while True:
                try:
                    await run_scrape_cycle(client, channel_list, args.limit, args.output, args.dry_run)
                except Exception as e:
                    log(f"Error during scrape cycle: {e}")
                await asyncio.sleep(args.interval)
        else:
            await run_scrape_cycle(client, channel_list, args.limit, args.output, args.dry_run)
    finally:
        await client.disconnect()
        log("Telethon client disconnected.")


if __name__ == "__main__":
    asyncio.run(main())
