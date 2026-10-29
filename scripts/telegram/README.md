# Telegram OSINT Scraper with Telethon (MTProto)

This module implements direct Telegram MTProto channel scraping for World Monitor using [Telethon](https://github.com/LonamiWebs/Telethon).

It connects to Telegram's native MTProto servers, scrapes the configured OSINT and news channels without rate-limiting issues or HTML rendering bottlenecks, and synchronizes normalized posts directly to Upstash Redis for the `api/social-intel` endpoint and dashboard panel.

---

## 1. Prerequisites & Setup

Install Python dependencies:

```bash
cd scripts/telegram
pip install -r requirements.txt
```

---

## 2. Telegram API Credentials

To use Telegram MTProto via Telethon, you need your Telegram `api_id` and `api_hash`:
1. Log in to [https://my.telegram.org/apps](https://my.telegram.org/apps).
2. Create an application (e.g. name: `WorldMonitor`).
3. Copy your `api_id` and `api_hash`.

---

## 3. Generate StringSession (Interactive)

Run the session generator:

```bash
python generate_session.py
```

Follow the prompts to enter your phone number, the verification code sent by Telegram, and your 2FA password (if enabled). It will output:

```env
TELEGRAM_SESSION=1BJWap1wBu...
```

Add this to your `.env` or deployment environment variables.

---

## 4. Running the Telethon Scraper

### One-shot Run (e.g. for Cron or Manual Ingestion)
```bash
python telethon_scraper.py --once
```

### Continuous Daemon (Polling Loop)
Runs continuously, polling channels every 120 seconds:
```bash
python telethon_scraper.py --poll --interval 120
```

### Save Output to Local JSON
```bash
python telethon_scraper.py --once --output telethon_feed.json
```

---

## 5. Running on the Pre-existing Railway Proxy Worker (Recommended)

World Monitor already includes an MTProto scraper running directly inside the pre-existing Railway relay (`scripts/ais-relay.cjs`) using GramJS (the JavaScript implementation of Telethon / MTProto).

### How It Works:
1. **Stateful MTProto Polling**: The Railway proxy worker keeps a persistent TCP connection to Telegram MTProto and automatically polls channels defined in [`data/telegram-channels.json`](file:///c:/Users/lepko/Documents/GitHub/worldmonitor/data/telegram-channels.json).
2. **HTTP Endpoint for Vercel**: Exposes `GET /telegram/feed?channels=...&limit=100` which Vercel calls via `WS_RELAY_URL`.
3. **Optional Upstash Redis Cache**: If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set on Railway, the worker automatically writes fresh post snapshots to Redis on every poll cycle (`worldmonitor:telegram:telethon:feed:v1`).

### Railway Worker Environment Variables:
Set these in your Railway service dashboard:
- `TELEGRAM_API_ID` - Telegram API ID from https://my.telegram.org/apps
- `TELEGRAM_API_HASH` - Telegram API Hash
- `TELEGRAM_SESSION` - StringSession string (generated with `node telegram/session-auth.mjs` or `python generate_session.py`)
- `TELEGRAM_CHANNEL_SET` - Channel set to poll (`full` or `social_intel`, defaults to `full`)
- `TELEGRAM_POLL_INTERVAL_MS` - Polling frequency in ms (default: `60000`, min: `15000`)
- `RELAY_SHARED_SECRET` - Shared secret between Vercel and Railway
- `UPSTASH_REDIS_REST_URL` (optional) - Upstash Redis REST URL for cross-cloud caching
- `UPSTASH_REDIS_REST_TOKEN` (optional) - Upstash Redis REST Token

### Vercel Environment Variables:
Set these in your Vercel project settings:
- `WS_RELAY_URL` - The HTTPS URL of your Railway proxy (e.g. `https://your-relay.up.railway.app`)
- `RELAY_SHARED_SECRET` - Matching secret configured on Railway
- `GEMINI_API_KEY` - Google AI Studio key for `text-embedding-004` and `gemini-1.5-flash-8b` briefings
- `BLUESKY_API_KEY` (optional) - Bluesky App Password or JWT
- `UPSTASH_REDIS_REST_URL` (optional) - Upstash Redis URL

---

## 6. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_API_ID` | Yes | Telegram API ID from `my.telegram.org` |
| `TELEGRAM_API_HASH` | Yes | Telegram API Hash from `my.telegram.org` |
| `TELEGRAM_SESSION` | Yes | Telethon / GramJS `StringSession` token |
| `WS_RELAY_URL` | Yes (on Vercel) | Railway relay URL (e.g. `https://relay.up.railway.app`) |
| `RELAY_SHARED_SECRET` | Recommended | Shared authentication secret between Vercel and Railway |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis REST URL (for pushing to web dashboard) |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST Token |
| `REDIS_FEED_KEY` | Optional | Redis key for all posts (default: `worldmonitor:telegram:telethon:feed:v1`) |
| `TELEGRAM_CHANNELS` | Optional | Comma-separated list of channel handles to monitor |

