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

## 5. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_API_ID` | Yes | Telegram API ID from `my.telegram.org` |
| `TELEGRAM_API_HASH` | Yes | Telegram API Hash from `my.telegram.org` |
| `TELEGRAM_SESSION` | Yes (or bot) | Telethon `StringSession` token |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_API_KEY` | Optional | Bot token fallback if running as a bot |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis REST URL (for pushing to web dashboard) |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST Token |
| `REDIS_FEED_KEY` | Optional | Redis key for all posts (default: `worldmonitor:telegram:telethon:feed:v1`) |
| `TELEGRAM_CHANNELS` | Optional | Comma-separated list of channel handles to monitor |
