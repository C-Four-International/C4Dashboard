import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// Prominent, verified OSINT institutions, defense researchers, and wires on Bluesky (AT Protocol)
const BLUESKY_ACCOUNTS = [
  // Leading OSINT Institutions & Geolocation Verification
  'bellingcat.com',               // Bellingcat - Gold-standard investigative OSINT
  'thestudyofwar.bsky.social',    // Institute for the Study of War (ISW) - Conflict & frontline maps
  'geoconfirmed.org',             // GeoConfirmed - Conflict imagery geolocation & verification
  'criticalthreats.bsky.social',  // Critical Threats Project (AEI) - Middle East, Iran & Sahel monitoring

  // Premier Independent OSINT Researchers & Analysts
  'eliothiggins.bsky.social',     // Eliot Higgins - Bellingcat founder, weapon forensics & geolocations
  'osinttechnical.bsky.social',   // OSINTtechnical - Military equipment, air defense & tactical footage
  'covertshores.bsky.social',     // H I Sutton / Covert Shores - Naval, submarine & maritime OSINT
  'tatarigami.bsky.social',       // Tatarigami_UA / Frontelligence - Satellite imagery & military logistics
  'vcdgf555.bsky.social',         // Evergreen Intel - Strategic reconnaissance flights & vessel tracking
  'emilkastehelmi.bsky.social',   // Emil Kastehelmi / Black Bird Group - Tactical frontline mapping
  'defmon3.bsky.social',          // Defmon3 - Frontline military map analyst & strike assessments
  'armscontrolwonk.bsky.social',  // Jeffrey Lewis / CNS - Missile & nuclear proliferation OSINT
  'giancarlofiorella.bsky.social',// Giancarlo Fiorella - Bellingcat research director
  'trbrtc.bsky.social',           // Christiaan Triebert - NYT Visual Investigations / ex-Bellingcat
  'aric.bsky.social',             // Aric Toler - NYT Visual Investigations / ex-Bellingcat

  // Defense Think Tanks & Strategic Analysts
  'rusi.bsky.social',             // Royal United Services Institute - Premier European defense analysis
  'csis.org',                     // Center for Strategic & International Studies (CSIS) - Aerospace & security
  'michaelkofman.bsky.social',    // Michael Kofman - Carnegie Endowment, military capability analyst
  'warontherocks.bsky.social',    // War on the Rocks - Military strategy & national security

  // Primary Wires & On-the-Ground Reporters (for corroboration & ground-truth)
  'kyivindependent.com',          // The Kyiv Independent - Eastern European breaking news & war tracking
  'reuters.com',                  // Reuters - Global breaking wire
  'apnews.com',                   // The Associated Press - Global breaking wire
  'aljazeera.com',                // Al Jazeera English - Middle East & Global South breaking coverage
];

// Prominent, verified OSINT and Defense channels on Telegram
const TELEGRAM_CHANNELS = [
  // 1. Dedicated English OSINT & Wire Aggregators
  'clashreport',                  // Clash Report - Real-time military footage, weapons & equipment updates
  'liveukraine_media',            // Live: Ukraine - Daily military briefings, air strikes & battlefield damage
  'bellingcat',                   // Bellingcat - Official investigative OSINT publications & forensics
  'LiveUAMap',                    // LiveUAMap - Direct conflict map updates & verified geolocations
  'BNONews',                      // BNO News - High-speed factual breaking wires & security alerts
  'osinttechnical',               // OSINTtechnical - Air defense, drone footage & hardware forensics
  'OSINTdefender',                // OSINTdefender - Strategic flights, naval movements & defense tracking
  'defensepoliticsasia',          // Defense Politics Asia - Military order-of-battle & map updates
  'militarnyi_eng',               // Militarnyi in English - Defense tech & frontline equipment portal
  'kyivpost_official',            // Kyiv Post - Verified ground-truth English newsroom
  'AuroraIntel',                  // Aurora Intel - Conflict tracking & verified alerts
  'GeopoliticalCenter',           // GeopoliticalCenter - Airspace, naval & European defense alerts

  // 2. Verified Frontline Mapping, Tactical Forensics & Defense Intelligence
  'deepstateua',                  // DeepStateUA - Premier frontline map & visual battlefield verification
  'informnapalm',                 // InformNapalm - International volunteer intelligence & weapon tracking
  'GeneralStaffZSU',              // General Staff of AFU - Official operational military situation reports
  'kpszsu',                       // Air Force Command of AFU - Real-time air alerts & missile/drone intercept statistics
  'DIUkraine',                    // Defense Intelligence of Ukraine (GUR) - Official intelligence updates
  'suspilnenews',                 // Suspilne News - Ukrainian national public broadcaster
  'ukrpravda_news',               // Ukrainska Pravda - Primary investigative & breaking newsroom
  'spravdi',                      // Spravdi - Centre for Strategic Communication
  'milinfolive',                  // Military Informant - Hardware forensics, strike assessments & drone tracking
  'SSternenko',                   // Serhii Sternenko - Aerial drone reconnaissance & frontline strike documentation
];

// 3-hour cache TTL (10,800 seconds = 10,800,000 ms)
const CACHE_TTL_SECONDS = 3 * 60 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

// In-memory cache for edge runtime instance
let memoryCache = {
  data: null,
  expiresAt: 0,
};
let lastKnownGoodData = null;

// In-flight request deduplication to prevent stampedes & redundant CPU execution
let inFlightPromise = null;

// ============================================================================
// Upstash Redis Helpers (if configured)
// ============================================================================
async function getRedisCache(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ? JSON.parse(json.result) : null;
  } catch {
    return null;
  }
}

async function setRedisCache(key, value, ttlSeconds) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    // Upstash REST command format in POST body avoids URL length limits for large JSON payloads
    const payload = JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: payload,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      // Fallback: /set/key?ex=ttlSeconds with JSON body
      await fetch(`${url}/set/${encodeURIComponent(key)}?ex=${ttlSeconds}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(3000),
      });
    }
  } catch (err) {
    console.warn('[SocialIntel] Upstash Redis SET error:', err?.message || err);
  }
}

// ============================================================================
// Noise Filtering & Prompt Cleaning (Local & Non-Agentic)
// ============================================================================

// Hoisted regex patterns to prevent repeated RegExp instantiation per post
const BOILERPLATE_PATTERNS = [
  /subscribe\s*(?:to|on)?\s*(?:our)?\s*(?:telegram|channel|updates|newsletter|patreon)?/gi,
  /join\s*(?:our)?\s*(?:telegram|channel|group|discord|community)?/gi,
  /follow\s*(?:us|me)?\s*(?:on)?\s*(?:twitter|x|bluesky|telegram)?/gi,
  /forwarded\s*from\b[^\n]*/gi,
  /breaking\s*news\s*:/gi,
  /flash\s*:/gi,
  /urgent\s*:/gi,
  /link\s*in\s*(?:bio|comments|description)/gi,
  /source\s*:\s*\S+/gi,
  /click\s*here/gi,
  /read\s*more\s*at[^\n]*/gi,
  /support\s*independent\s*journalism/gi,
  /all\s*rights\s*reserved/gi,
];

export function cleanPostText(text) {
  if (!text) return '';
  let cleaned = String(text);

  // 1. Remove URLs (http, https, t.me, bsky.app, bit.ly, etc.)
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');
  cleaned = cleaned.replace(/(?:^|\s)(?:t\.me|bsky\.app|bit\.ly|x\.com|twitter\.com)\/\S+/gi, '');

  // 2. Remove HTML entities & tags
  cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 3. Remove common boilerplate & promotional patterns
  for (const pat of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pat, ' ');
  }

  // 4. Remove emojis & pictorial characters (preserve numbers 0-9)
  cleaned = cleaned.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]/gu, '');

  // 5. Clean up hashtags (keep informative word)
  cleaned = cleaned.replace(/#(\w+)/g, '$1');

  // 6. Remove mentions @username
  cleaned = cleaned.replace(/@[\w.-]+/g, '');

  // 7. Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

export function isSubstantivePost(cleanedText) {
  if (!cleanedText || cleanedText.length < 35) return false;
  const words = cleanedText.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;

  const conversational = /^(good morning|good evening|happy new year|thoughts\?|what do you think|poll:|reminder:|thread:)/i;
  if (conversational.test(cleanedText)) return false;

  return true;
}

export function enforceBriefingWordLimit(text, maxWords = 24) {
  let cleaned = text.trim().replace(/^["']|["']$/g, '').replace(/[*_#`]/g, '');
  const words = cleaned.split(/\s+/);
  if (words.length <= maxWords) return cleaned;
  let truncated = words.slice(0, maxWords).join(' ');
  truncated = truncated.replace(/[,;:\-\s]+$/, '');
  if (!/[.!?]$/.test(truncated)) truncated += '.';
  return truncated;
}

// ============================================================================
// Math & Clustering Helpers
// ============================================================================
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Optimized word set extraction for Jaccard similarity
export function extractWordSet(text) {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
}

// Zero-allocation set Jaccard similarity: |A ∩ B| / (|A| + |B| - |A ∩ B|)
export function fastSetJaccard(wordsA, wordsB) {
  if (!wordsA || !wordsB || wordsA.size === 0 || wordsB.size === 0) return 0;
  const [smaller, larger] = wordsA.size < wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA];
  let intersection = 0;
  for (const w of smaller) {
    if (larger.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Backward-compatible string-based helper
export function jaccardSimilarity(textA, textB) {
  return fastSetJaccard(extractWordSet(textA), extractWordSet(textB));
}

// ============================================================================
// Data Ingestion: Bluesky & Telegram
// ============================================================================

// Bluesky AT Protocol Session Cache
let blueskySession = {
  accessJwt: null,
  expiresAt: 0,
};

/**
 * Handles Bluesky AT Protocol authentication per official documentation:
 * If BLUESKY_API_KEY is an app password (identifier:password), authenticates via
 * com.atproto.server.createSession and caches the session JWT.
 * If already an access JWT (starts with 'eyJ'), uses directly.
 */
async function getBlueskyAuthHeader(apiKey) {
  if (!apiKey) return null;
  const trimmed = apiKey.trim();

  // Direct JWT Bearer token
  if (trimmed.startsWith('eyJ')) {
    return `Bearer ${trimmed}`;
  }

  // App Password format: "identifier:password" (or handle:password)
  if (trimmed.includes(':')) {
    if (blueskySession.accessJwt && blueskySession.expiresAt > Date.now()) {
      return `Bearer ${blueskySession.accessJwt}`;
    }

    const colonIdx = trimmed.indexOf(':');
    const identifier = trimmed.slice(0, colonIdx);
    const password = trimmed.slice(colonIdx + 1);

    try {
      const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'WorldMonitor-Intel/1.0 (+https://worldmonitor.app)',
        },
        body: JSON.stringify({ identifier, password }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const session = await res.json();
        if (session.accessJwt) {
          blueskySession = {
            accessJwt: session.accessJwt,
            // Tokens typically last 2 hours; cache for 90m
            expiresAt: Date.now() + 90 * 60 * 1000,
          };
          return `Bearer ${session.accessJwt}`;
        }
      } else {
        console.warn('[SocialIntel] Bluesky createSession failed:', res.status, await res.text());
      }
    } catch (err) {
      console.warn('[SocialIntel] Bluesky auth exception:', err.message);
    }
  }

  return `Bearer ${trimmed}`;
}

/**
 * Fetches author feed via AT Protocol XRPC app.bsky.feed.getAuthorFeed per official documentation:
 * Parameters:
 *   - actor: handle or DID (required)
 *   - filter: 'posts_no_replies' to get primary posts and broadcasts (omits conversational @-replies)
 *   - limit: 15 (integer, range 1-100)
 */
async function fetchBlueskyAuthorPosts(actor, authHeader) {
  // Use public AppView endpoint or main bsky.social endpoint
  const baseUrl = authHeader ? 'https://bsky.social/xrpc' : 'https://public.api.bsky.app/xrpc';
  const url = new URL(`${baseUrl}/app.bsky.feed.getAuthorFeed`);
  url.searchParams.set('actor', actor);
  url.searchParams.set('filter', 'posts_no_replies');
  url.searchParams.set('limit', '15');

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'WorldMonitor-Intel/1.0 (+https://worldmonitor.app)',
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(3500) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.feed || !Array.isArray(data.feed)) return [];

    const posts = [];
    for (const item of data.feed) {
      const p = item.post;
      if (!p || !p.record || !p.record.text) continue;

      // Extract rkey from AT Protocol URI: at://<did>/app.bsky.feed.post/<rkey>
      const rkey = p.uri ? p.uri.split('/').pop() : '';
      const authorHandle = p.author?.handle || actor;
      const postUrl = rkey
        ? `https://bsky.app/profile/${authorHandle}/post/${rkey}`
        : `https://bsky.app/profile/${authorHandle}`;

      // Check if this was a repost per AT Protocol FeedViewPost schema
      const isRepost = item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';
      const repostedBy = isRepost && item.reason.by ? item.reason.by.displayName || item.reason.by.handle : undefined;

      posts.push({
        id: `bsky-${p.cid || rkey || Math.random().toString(36).slice(2)}`,
        platform: 'bluesky',
        author: authorHandle,
        authorName: p.author?.displayName || authorHandle,
        url: postUrl,
        publishedAt: p.record.createdAt || p.indexedAt || new Date().toISOString(),
        rawText: p.record.text,
        repostedBy,
      });
    }
    return posts;
  } catch (err) {
    console.warn(`[SocialIntel] Bluesky fetch failed for ${actor}:`, err.message);
    return [];
  }
}

/**
 * Fetches updates via Telegram Bot API per official documentation:
 * Endpoint: POST https://api.telegram.org/bot<token>/getUpdates
 * Parameters:
 *   - allowed_updates: ['channel_post', 'message', 'edited_channel_post']
 *   - limit: 100
 */
async function fetchTelegramBotUpdates(apiKey) {
  if (!apiKey) return [];
  const trimmed = apiKey.trim();
  // Validate Telegram Bot Token structure: <bot_id>:<token>
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(trimmed)) return [];

  const url = `https://api.telegram.org/bot${trimmed}/getUpdates`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor-Intel/1.0 (+https://worldmonitor.app)',
      },
      body: JSON.stringify({
        allowed_updates: ['channel_post', 'message', 'edited_channel_post'],
        limit: 100,
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      console.warn('[SocialIntel] Telegram getUpdates returned status:', res.status);
      return [];
    }

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return [];

    const posts = [];
    for (const update of data.result) {
      const msg = update.channel_post || update.message || update.edited_channel_post;
      if (!msg) continue;

      // Per Telegram Bot API docs, photo/video/document posts place text in 'caption'
      const text = msg.text || msg.caption || '';
      if (!text || text.trim().length === 0) continue;

      const chat = msg.chat || {};
      const username = chat.username ? chat.username.replace(/^@/, '') : '';
      const authorHandle = username ? `@${username}` : (chat.title || 'Telegram Channel');
      const postUrl = username
        ? `https://t.me/${username}/${msg.message_id}`
        : `https://t.me/c/${String(chat.id).replace(/^-100/, '')}/${msg.message_id}`;

      const publishedAt = msg.date
        ? new Date(msg.date * 1000).toISOString()
        : new Date().toISOString();

      posts.push({
        id: `tg-bot-${msg.message_id}-${Date.now().toString(36)}`,
        platform: 'telegram',
        author: authorHandle,
        authorName: chat.title || authorHandle,
        url: postUrl,
        publishedAt,
        rawText: text,
      });
    }

    return posts;
  } catch (err) {
    console.warn('[SocialIntel] Telegram Bot getUpdates error:', err.message);
    return [];
  }
}

/**
 * Fetches public channel posts using Telegram's official Web Widget DOM structure (https://t.me/s/<channel>)
 * and optional MTProto relay if configured:
 * Structure:
 *   - .tgme_widget_message container with data-post="<channel>/<id>"
 *   - .tgme_widget_message_text (or .js-message_text)
 *   - a.tgme_widget_message_date with <time datetime="...">
 *   - .tgme_widget_message_owner_name
 */
/**
 * Fetches batched posts directly from the pre-existing Railway proxy worker running MTProto:
 * Endpoint: GET /telegram/feed?channels=...&limit=100
 */
export async function fetchRailwayTelegramFeed(channels, apiKey) {
  const relayBase = process.env.WS_RELAY_URL;
  if (!relayBase) return [];

  let relay = relayBase;
  if (relay.startsWith('wss://')) relay = relay.replace('wss://', 'https://');
  if (relay.startsWith('ws://')) relay = relay.replace('ws://', 'http://');

  try {
    const channelParam = Array.isArray(channels) ? channels.join(',') : channels;
    const url = new URL('/telegram/feed', relay);
    if (channelParam) url.searchParams.set('channels', channelParam);
    url.searchParams.set('limit', '100');

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor-Intel/1.0 (+https://worldmonitor.app)',
    };
    const secret = process.env.RELAY_SHARED_SECRET || process.env.WORLDMONITOR_RELAY_KEY || apiKey;
    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
      headers['x-relay-key'] = secret;
      headers['X-Telegram-Key'] = secret;
    }

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(3500) });
    if (!res.ok) {
      console.warn('[SocialIntel] Railway Telegram feed HTTP status:', res.status);
      return [];
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : data.items || data.messages || [];
    if (!Array.isArray(items) || items.length === 0) return [];

    return items.map(m => {
      const ch = (m.channel || (m.author ? String(m.author).replace(/^@/, '') : '')).trim();
      const chTitle = m.authorName || m.channelTitle || ch || 'Telegram Channel';
      const pubAt = m.publishedAt || m.ts || (m.date ? new Date(typeof m.date === 'number' ? m.date * 1000 : m.date).toISOString() : new Date().toISOString());
      const raw = m.rawText || m.text || m.message || m.caption || '';
      return {
        id: `tg-relay-${ch || 'post'}-${m.id || Math.random().toString(36).slice(2)}`,
        platform: 'telegram',
        author: ch ? `@${ch}` : '@telegram',
        authorName: chTitle,
        url: m.url || (ch && m.id ? `https://t.me/${ch}/${m.id}` : `https://t.me/${ch}`),
        publishedAt: pubAt,
        rawText: raw,
      };
    }).filter(p => p.rawText.length > 0);
  } catch (err) {
    console.warn('[SocialIntel] Railway Telegram feed fetch failed:', err.message);
    return [];
  }
}

/**
 * Fetches public channel posts using Telegram's official Web Widget DOM structure (https://t.me/s/<channel>)
 * Structure:
 *   - .tgme_widget_message container with data-post="<channel>/<id>"
 *   - .tgme_widget_message_text (or .js-message_text)
 *   - a.tgme_widget_message_date with <time datetime="...">
 *   - .tgme_widget_message_owner_name
 */
async function fetchTelegramChannelPosts(channel) {
  const previewUrl = `https://t.me/s/${channel}`;
  try {
    const res = await fetch(previewUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const posts = [];
    // Telegram widget message items are demarcated by class="tgme_widget_message"
    const messageBlocks = html.split(/<div[^>]*class="[^"]*tgme_widget_message\b/i);

    // Telegram channels list messages chronologically; parse only the latest 8 messages to prevent excessive regex processing
    const startIndex = Math.max(1, messageBlocks.length - 8);
    for (let i = startIndex; i < messageBlocks.length; i++) {
      const block = messageBlocks[i];

      // Extract channel & message ID from data-post="channel/id"
      const postMatch = block.match(/data-post="([a-zA-Z0-9_]+)\/(\d+)"/i);
      const postMsgId = postMatch ? postMatch[2] : '';
      const postChannel = postMatch ? postMatch[1] : channel;

      // Extract text content (.tgme_widget_message_text or .js-message_text)
      const textMatch = block.match(/<div[^>]*class="[^"]*(?:tgme_widget_message_text|js-message_text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (!textMatch) continue;

      // Extract datetime from <time datetime="...">
      const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/i);
      const publishedAt = timeMatch ? timeMatch[1] : new Date().toISOString();

      // Extract channel owner/display title
      const ownerMatch = block.match(/<div[^>]*class="[^"]*tgme_widget_message_owner_name[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const authorTitle = ownerMatch ? ownerMatch[1].replace(/<[^>]+>/g, '').trim() : channel;

      const postUrl = postMsgId ? `https://t.me/${postChannel}/${postMsgId}` : `https://t.me/${channel}`;
      const rawText = textMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

      posts.push({
        id: `tg-${channel}-${postMsgId || posts.length}-${Date.now().toString(36)}`,
        platform: 'telegram',
        author: `@${postChannel}`,
        authorName: authorTitle || postChannel,
        url: postUrl,
        publishedAt,
        rawText,
      });
    }
    return posts;
  } catch (err) {
    console.warn(`[SocialIntel] Telegram preview fetch failed for ${channel}:`, err.message);
    return [];
  }
}

/**
 * Fetches posts scraped via Python Telethon service from Upstash Redis.
 * Key: worldmonitor:telegram:telethon:feed:v1 (configured by REDIS_FEED_KEY)
 */
async function fetchTelethonRedisPosts() {
  const redisKey = process.env.REDIS_FEED_KEY || 'worldmonitor:telegram:telethon:feed:v1';
  try {
    const cached = await getRedisCache(redisKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch (err) {
    console.warn('[SocialIntel] Telethon Redis fetch error:', err.message);
  }
  return [];
}

// Ingest all candidate accounts across Bluesky and Telegram (with Railway proxy worker & fallback)
async function ingestTelegramPosts(tgKey) {
  let tgPosts = [];
  if (process.env.WS_RELAY_URL) {
    tgPosts = await fetchRailwayTelegramFeed(TELEGRAM_CHANNELS, tgKey);
  }

  if (tgPosts.length === 0) {
    tgPosts = await fetchTelethonRedisPosts();
  }

  if (tgPosts.length < 6) {
    // Only scrape top 12 primary channels to prevent edge gateway timeout
    const channelsToScrape = TELEGRAM_CHANNELS.slice(0, 12);
    const previewResults = await Promise.allSettled(
      channelsToScrape.map(ch => fetchTelegramChannelPosts(ch))
    );
    for (const r of previewResults) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        tgPosts.push(...r.value);
      }
    }
  }

  if (tgKey) {
    const botPosts = await fetchTelegramBotUpdates(tgKey);
    if (botPosts.length > 0) tgPosts.push(...botPosts);
  }

  return tgPosts;
}

async function ingestBlueskyPosts(bskyKey) {
  const authHeader = await getBlueskyAuthHeader(bskyKey);
  const bskyResults = await Promise.allSettled(
    BLUESKY_ACCOUNTS.map(account => fetchBlueskyAuthorPosts(account, authHeader))
  );

  const bskyPosts = [];
  for (const r of bskyResults) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      bskyPosts.push(...r.value);
    }
  }

  return bskyPosts;
}

async function ingestAllPosts() {
  const bskyKey = process.env.BLUESKY_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;

  // Ingest Telegram and Bluesky concurrently
  const [tgPosts, bskyPosts] = await Promise.all([
    ingestTelegramPosts(tgKey),
    ingestBlueskyPosts(bskyKey),
  ]);

  return [...tgPosts, ...bskyPosts];
}

// ============================================================================
// Google AI Studio: text-embedding-004 & lowest-cost LLM briefing
// ============================================================================
async function batchEmbedTexts(texts, geminiKey) {
  if (!geminiKey || texts.length === 0) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${geminiKey}`;

  // Batch up to 90 items per request
  const requests = texts.slice(0, 90).map(t => ({
    model: 'models/text-embedding-004',
    content: { parts: [{ text: t.slice(0, 800) }] },
  }));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.warn('[SocialIntel] text-embedding-004 HTTP Error:', res.status, await res.text());
      return null;
    }

    const json = await res.json();
    if (!json.embeddings || !Array.isArray(json.embeddings)) return null;
    return json.embeddings.map(e => e.values);
  } catch (err) {
    console.warn('[SocialIntel] text-embedding-004 error:', err.message);
    return null;
  }
}

async function generateAirGappedBriefing(clusterPosts, geminiKey) {
  const combinedContext = clusterPosts.map((p, idx) => `[Source ${idx + 1} (${p.platform} / ${p.author})]: ${p.cleanedText}`).join('\n');

  const systemInstruction = `You are an air-gapped factual intelligence briefing engine. You synthesize corroborated social media intelligence from verified OSINT and news monitors into ultra-concise event briefings.

STRICT PROTOCOL:
1. Language: You MUST ALWAYS write the briefing in ENGLISH. Many sources are written in Ukrainian, Russian, or other languages; you MUST translate and synthesize all information into fluent, concise English. NEVER output Cyrillic characters or non-English text under any circumstances.
2. Grounding: You must ONLY state concrete, corroborated facts directly reported in the provided source texts. Do NOT extrapolate, speculate, or introduce any outside facts.
3. Brevity: The briefing MUST be UNDER 40 WORDS, but not less than 15 words, and must be coherent and cohesive without being abruptly cut off.
4. Tone: Telegraphic, objective wire-service intelligence style (e.g. 'Ukrainian air defenses intercepted 14 drones over Kharkiv; power infrastructure sustained minor damage.').
5. Formatting: Output ONLY the raw factual briefing in English. No preambles, titles, translation notes, source citations, quotes, or markdown formatting.`;

  // Use Google AI Studio's lowest cost models: gemini-1.5-flash-8b with gemini-2.0-flash-lite fallback
  const models = ['gemini-1.5-flash-8b', 'gemini-2.0-flash-lite'];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: `CORROBORATED SOURCE REPORTS (Translate non-English source reports into English):\n${combinedContext}\n\nGenerate the <=25 word factual briefing strictly in English:` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 60,
          },
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const json = await res.json();
        const rawBrief = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        // Ensure result is present and does not contain raw Cyrillic text
        if (rawBrief && !/[\u0400-\u04FF]/.test(rawBrief)) {
          return {
            briefing: enforceBriefingWordLimit(rawBrief, 24),
            modelUsed: model,
          };
        }
      }
    } catch {
      // Try next model
    }
  }

  return null;
}

// ============================================================================
// Google Pre-Trained Translation API Hook & Neural Translation Utilities
// ============================================================================
export {
  NON_ENGLISH_REGEX,
  NON_ENGLISH_CHARS_REGEX,
  hasNonEnglishText,
  hasNonEnglishCharacters,
  decodeHtmlEntities,
  translateTextWithGoogle,
  batchTranslateWithGoogle,
} from './_translate.js';

import {
  NON_ENGLISH_CHARS_REGEX,
  hasNonEnglishText,
  hasNonEnglishCharacters,
  translateTextWithGoogle,
  batchTranslateWithGoogle,
} from './_translate.js';

/**
 * Synthesizes a factual intelligence briefing (<25 words) from cluster posts
 * by translating foreign source snippets into English via Google's pre-trained translation API,
 * replacing generic operational notices with real translated event telemetry.
 */
export async function generateBriefingWithGoogleTranslation(clusterPosts) {
  if (!Array.isArray(clusterPosts) || clusterPosts.length === 0) {
    return generateLocalBriefingFallback(clusterPosts);
  }

  // Look for any existing English post or pre-translated post first
  const existingEnglishPost = clusterPosts.find(p => p.translatedText && !hasNonEnglishText(p.translatedText)) ||
    clusterPosts.find(p => !hasNonEnglishText(p.cleanedText));

  if (existingEnglishPost) {
    const sourceText = existingEnglishPost.translatedText || existingEnglishPost.cleanedText;
    const firstSentence = sourceText.split(/[.!?]\s+/)[0] || sourceText;
    return {
      briefing: enforceBriefingWordLimit(firstSentence, 24),
      modelUsed: existingEnglishPost.translatedText ? 'google-pretrained-translation' : 'local-corroborator',
    };
  }

  // If all posts are non-English, choose the most informative post and translate it
  const bestPost = clusterPosts.reduce((best, cur) => {
    return cur.cleanedText.length < best.cleanedText.length ? cur : best;
  }, clusterPosts[0]);

  let translated = bestPost.translatedText;
  if (!translated || hasNonEnglishText(translated)) {
    try {
      translated = await translateTextWithGoogle(bestPost.cleanedText, 'en');
      bestPost.translatedText = translated;
      bestPost.isTranslated = true;
    } catch {
      // Fallback
    }
  }

  // If translation succeeded and is in English, build an informative briefing
  if (translated && !hasNonEnglishText(translated)) {
    const firstSentence = translated.split(/[.!?]\s+/)[0] || translated;
    return {
      briefing: enforceBriefingWordLimit(firstSentence, 24),
      modelUsed: 'google-pretrained-translation',
    };
  }

  // If translation failed, fallback to local operational notice
  return generateLocalBriefingFallback(clusterPosts);
}

// Local deterministic fallback synthesizer if AI Studio is offline or has no key
export function generateLocalBriefingFallback(clusterPosts) {
  if (!Array.isArray(clusterPosts) || clusterPosts.length === 0) {
    return { briefing: 'No substantive reports identified.', modelUsed: 'local-corroborator' };
  }

  // Prefer posts that have an English translation or are already in English
  const englishPosts = clusterPosts.filter(p => {
    if (p.translatedText && !hasNonEnglishText(p.translatedText)) return true;
    return !hasNonEnglishText(p.cleanedText);
  });
  const candidatePool = englishPosts.length > 0 ? englishPosts : clusterPosts;

  const bestPost = candidatePool.reduce((best, cur) => {
    const curLen = (cur.translatedText || cur.cleanedText).length;
    const bestLen = (best.translatedText || best.cleanedText).length;
    return curLen < bestLen ? cur : best;
  }, candidatePool[0]);

  // If the chosen post has a translated text from Google Pre-Trained Translation, use it!
  if (bestPost.translatedText && !hasNonEnglishText(bestPost.translatedText)) {
    const firstSentence = bestPost.translatedText.split(/[.!?]\s+/)[0] || bestPost.translatedText;
    return {
      briefing: enforceBriefingWordLimit(firstSentence, 24),
      modelUsed: 'google-pretrained-translation',
    };
  }

  // If the chosen post is in Cyrillic or other non-English language and not yet translated, provide a clean English operational notice
  if (hasNonEnglishText(bestPost.cleanedText)) {
    const author = bestPost.authorName || bestPost.author || 'OSINT channel';
    return {
      briefing: enforceBriefingWordLimit(`${author} published operational military situation updates and frontline telemetry.`, 24),
      modelUsed: 'local-corroborator',
    };
  }

  const firstSentence = bestPost.cleanedText.split(/[.!?]\s+/)[0] || bestPost.cleanedText;
  return {
    briefing: enforceBriefingWordLimit(firstSentence, 24),
    modelUsed: 'local-corroborator',
  };
}

// ============================================================================
// Core Aggregation, Clustering & Cross-Referencing
// ============================================================================
async function buildSocialIntelBriefings() {
  const geminiKey = process.env.GEMINI_API_KEY;

  // 1. Ingest raw posts
  const rawPosts = await ingestAllPosts();

  // 2. Local noise-filtering & prompt cleaning
  const cleanedPosts = [];
  const seenHashes = new Set();

  for (const post of rawPosts) {
    const cleaned = cleanPostText(post.rawText);
    if (!isSubstantivePost(cleaned)) continue;

    // Local deduplication key
    const snippetKey = cleaned.slice(0, 60).toLowerCase();
    if (seenHashes.has(snippetKey)) continue;
    seenHashes.add(snippetKey);

    cleanedPosts.push({
      ...post,
      cleanedText: cleaned,
    });
  }

  if (cleanedPosts.length === 0) {
    return {
      briefings: [],
      totalPostsScraped: rawPosts.length,
      totalSubstantivePosts: 0,
      generatedAt: new Date().toISOString(),
      cachedUntil: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      cacheExpiresInSeconds: CACHE_TTL_SECONDS,
      modelUsed: geminiKey ? 'gemini-1.5-flash-8b + text-embedding-004' : 'local-corroborator',
      sourcesMonitored: {
        bluesky: BLUESKY_ACCOUNTS,
        telegram: TELEGRAM_CHANNELS,
      },
    };
  }

  // 3. Semantic Clustering via text-embedding-004
  let clusters = [];
  const embeddings = geminiKey ? await batchEmbedTexts(cleanedPosts.map(p => p.cleanedText), geminiKey) : null;

  if (embeddings && embeddings.length === cleanedPosts.length) {
    const visited = new Set();
    const SIMILARITY_THRESHOLD = 0.77; // Close semantic alignment for event correlation

    for (let i = 0; i < cleanedPosts.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [cleanedPosts[i]];
      visited.add(i);

      for (let j = i + 1; j < cleanedPosts.length; j++) {
        if (visited.has(j)) continue;
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim >= SIMILARITY_THRESHOLD) {
          cluster.push(cleanedPosts[j]);
          visited.add(j);
        }
      }
      clusters.push(cluster);
    }
  } else {
    // Optimized Jaccard similarity fallback with precomputed word sets (O(N) allocations instead of O(N^2))
    const wordSets = cleanedPosts.map(p => extractWordSet(p.cleanedText));
    const visited = new Set();
    for (let i = 0; i < cleanedPosts.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [cleanedPosts[i]];
      visited.add(i);

      for (let j = i + 1; j < cleanedPosts.length; j++) {
        if (visited.has(j)) continue;
        const sim = fastSetJaccard(wordSets[i], wordSets[j]);
        if (sim >= 0.28) {
          cluster.push(cleanedPosts[j]);
          visited.add(j);
        }
      }
      clusters.push(cluster);
    }
  }

  // 4. Cross-Referencing & Selection:
  // Categorize clusters into multi-source corroborated events and single-monitor signals
  const corroboratedClusters = [];
  const singleTgClusters = [];
  const singleBskyClusters = [];

  for (const cluster of clusters) {
    const distinctAuthors = new Set(cluster.map(p => `${p.platform}:${p.author}`));
    if (distinctAuthors.size >= 2) {
      corroboratedClusters.push(cluster);
    } else {
      const isTg = cluster.some(p => p.platform === 'telegram');
      if (isTg) {
        singleTgClusters.push(cluster);
      } else {
        singleBskyClusters.push(cluster);
      }
    }
  }

  // Sort corroborated by source count desc, then latest date
  corroboratedClusters.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const timeA = new Date(a[0]?.publishedAt || 0).getTime();
    const timeB = new Date(b[0]?.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  // Sort single-source clusters by recency
  singleTgClusters.sort((a, b) => {
    const timeA = new Date(a[0]?.publishedAt || 0).getTime();
    const timeB = new Date(b[0]?.publishedAt || 0).getTime();
    return timeB - timeA;
  });
  singleBskyClusters.sort((a, b) => {
    const timeA = new Date(a[0]?.publishedAt || 0).getTime();
    const timeB = new Date(b[0]?.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  // Balanced selection: Corroborated multi-source events first, followed by balanced breaking Telegram OSINT & Bluesky signals
  const finalClusters = [
    ...corroboratedClusters.slice(0, 12),
    ...singleTgClusters.slice(0, 6),
    ...singleBskyClusters.slice(0, 6),
  ];

  // 5. Batch-translate foreign posts in final clusters via Google Pre-Trained Translation
  const foreignPosts = [];
  for (const cluster of finalClusters) {
    for (const post of cluster) {
      if (hasNonEnglishText(post.cleanedText) && !post.translatedText) {
        foreignPosts.push(post);
      }
    }
  }

  if (foreignPosts.length > 0 && !geminiKey) {
    try {
      const uniqueTexts = Array.from(new Set(foreignPosts.map(p => p.cleanedText))).slice(0, 10);
      const translatedList = await batchTranslateWithGoogle(uniqueTexts, 'en');
      const textMap = new Map();
      uniqueTexts.forEach((orig, idx) => {
        textMap.set(orig, translatedList[idx]);
      });

      for (const post of foreignPosts) {
        const translated = textMap.get(post.cleanedText);
        if (translated && !hasNonEnglishText(translated)) {
          post.translatedText = translated;
          post.isTranslated = true;
        }
      }
    } catch (err) {
      console.warn('[SocialIntel] Batch Google translation error:', err.message);
    }
  }

  // 6. Briefing Generation (< 25 words) - parallelized with bounded concurrency
  const briefings = [];
  let modelUsedOverall = 'local-corroborator';
  const CONCURRENCY = 6;

  for (let i = 0; i < finalClusters.length; i += CONCURRENCY) {
    const chunk = finalClusters.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (cluster, chunkIdx) => {
        const clusterIndex = i + chunkIdx;
        const distinctAuthors = new Set(cluster.map(p => `${p.platform}:${p.author}`));
        const isMultiSource = distinctAuthors.size >= 2;

        let res = null;
        if (geminiKey) {
          try {
            res = await generateAirGappedBriefing(cluster, geminiKey);
          } catch {
            // fallback
          }
        }
        if (!res) {
          try {
            res = await generateBriefingWithGoogleTranslation(cluster);
          } catch {
            // fallback
          }
        }
        if (!res) {
          res = generateLocalBriefingFallback(cluster);
        }

        const platforms = Array.from(new Set(cluster.map(p => p.platform)));
        const latestPostDate = cluster.reduce((latest, p) => {
          const pTime = new Date(p.publishedAt).getTime();
          return pTime > latest ? pTime : latest;
        }, 0);

        const wordCount = res.briefing.split(/\s+/).filter(Boolean).length;

        return {
          clusterIndex,
          modelUsed: res.modelUsed,
          briefingItem: {
            id: `briefing-${clusterIndex}-${Date.now().toString(36)}`,
            briefing: res.briefing,
            wordCount,
            createdAt: latestPostDate > 0 ? new Date(latestPostDate).toISOString() : new Date().toISOString(),
            freshness: formatTimeAgo(latestPostDate),
            sources: cluster.map(p => ({
              id: p.id,
              platform: p.platform,
              author: p.author,
              authorName: p.authorName,
              url: p.url,
              publishedAt: p.publishedAt,
              freshness: formatTimeAgo(new Date(p.publishedAt).getTime()),
              rawText: p.rawText,
              cleanedText: p.cleanedText,
              translatedText: p.translatedText || null,
              isTranslated: !!p.isTranslated,
            })),
            platforms,
            corroborationScore: distinctAuthors.size,
            isMultiSource,
          },
        };
      })
    );

    for (const r of chunkResults) {
      if (r.status === 'fulfilled' && r.value) {
        if (r.value.modelUsed && r.value.modelUsed !== 'local-corroborator') {
          modelUsedOverall = r.value.modelUsed;
        }
        briefings.push(r.value.briefingItem);
      }
    }
  }

  return {
    briefings,
    totalPostsScraped: rawPosts.length,
    totalSubstantivePosts: cleanedPosts.length,
    generatedAt: new Date().toISOString(),
    cachedUntil: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    cacheExpiresInSeconds: CACHE_TTL_SECONDS,
    modelUsed: geminiKey ? `${modelUsedOverall} + text-embedding-004` : modelUsedOverall,
    sourcesMonitored: {
      bluesky: BLUESKY_ACCOUNTS,
      telegram: TELEGRAM_CHANNELS,
    },
  };
}

function formatTimeAgo(timestamp) {
  if (!timestamp || isNaN(timestamp)) return 'Recently';
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ============================================================================
// Edge Handler
// ============================================================================
export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, POST, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Dedicated API hook for Google pre-trained translation
  if (url.searchParams.get('action') === 'translate') {
    let text = url.searchParams.get('text') || url.searchParams.get('q') || '';
    let target = url.searchParams.get('target') || url.searchParams.get('tl') || 'en';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.text) text = body.text;
        if (body.q) text = body.q;
        if (body.target) target = body.target;
      } catch {
        // Fall back to query params
      }
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Missing text parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      const translatedText = await translateTextWithGoogle(text, target);
      return new Response(
        JSON.stringify({
          originalText: text,
          translatedText,
          targetLanguage: target,
          provider: 'google-pretrained-translation-api',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            ...corsHeaders,
          },
        },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Translation failed', details: err.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const bypassCache = url.searchParams.get('fresh') === '1' || url.searchParams.get('fresh') === 'true';

  // 1. Check in-memory cache (3 hours)
  if (!bypassCache && memoryCache.data && memoryCache.expiresAt > Date.now()) {
    return new Response(JSON.stringify(memoryCache.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=1800`,
        'X-Cache-Status': 'HIT-MEMORY',
        ...corsHeaders,
      },
    });
  }

  // 2. Check Upstash Redis cache (3 hours)
  const redisKey = 'worldmonitor:social-intel:briefings:v1';
  if (!bypassCache) {
    const redisCached = await getRedisCache(redisKey);
    if (redisCached && redisCached.briefings) {
      memoryCache = {
        data: redisCached,
        expiresAt: Date.now() + Math.min(CACHE_TTL_MS, 300000), // Pop into local memory
      };
      return new Response(JSON.stringify(redisCached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=1800`,
          'X-Cache-Status': 'HIT-REDIS',
          ...corsHeaders,
        },
      });
    }
  }

  // 3. Deduplicate in-flight upstream generation to prevent stampedes & parallel CPU runs
  if (inFlightPromise) {
    try {
      const sharedData = await inFlightPromise;
      if (sharedData && sharedData.briefings) {
        return new Response(JSON.stringify(sharedData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=1800`,
            'X-Cache-Status': 'HIT-INFLIGHT',
            ...corsHeaders,
          },
        });
      }
    } catch {
      // Fall through to execute new fetch
    }
  }

  // 4. Generate fresh briefings with singleflight deduplication & execution safety deadline
  const BUILD_TIMEOUT_MS = 9500;
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error('SocialIntel build deadline exceeded')), BUILD_TIMEOUT_MS);
    if (timerId && timerId.unref) timerId.unref();
  });

  try {
    if (!inFlightPromise) {
      inFlightPromise = buildSocialIntelBriefings();
    }
    const freshData = await Promise.race([inFlightPromise, timeoutPromise]);
    clearTimeout(timerId);

    // Store in memory cache
    memoryCache = {
      data: freshData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    lastKnownGoodData = freshData;

    // Store in Upstash Redis cache (asynchronous, non-blocking)
    setRedisCache(redisKey, freshData, CACHE_TTL_SECONDS).catch(() => {});

    return new Response(JSON.stringify(freshData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=1800`,
        'X-Cache-Status': 'MISS',
        ...corsHeaders,
      },
    });
  } catch (err) {
    clearTimeout(timerId);
    console.warn('[SocialIntel] Fresh build timeout or error, evaluating fallbacks:', err?.message || err);

    // Stale fallback from in-memory cache
    if (lastKnownGoodData && Array.isArray(lastKnownGoodData.briefings) && lastKnownGoodData.briefings.length > 0) {
      return new Response(JSON.stringify(lastKnownGoodData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
          'X-Cache-Status': 'STALE-FALLBACK',
          ...corsHeaders,
        },
      });
    }

    // Stale fallback from Redis cache
    try {
      const staleRedis = await getRedisCache(redisKey);
      if (staleRedis && Array.isArray(staleRedis.briefings) && staleRedis.briefings.length > 0) {
        lastKnownGoodData = staleRedis;
        return new Response(JSON.stringify(staleRedis), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
            'X-Cache-Status': 'STALE-REDIS-FALLBACK',
            ...corsHeaders,
          },
        });
      }
    } catch {
      // Continue to degraded fallback
    }

    // Graceful degradation response instead of 504 Gateway Timeout
    return new Response(JSON.stringify({
      briefings: [],
      totalPostsScraped: 0,
      totalSubstantivePosts: 0,
      generatedAt: new Date().toISOString(),
      cachedUntil: new Date().toISOString(),
      cacheExpiresInSeconds: 0,
      modelUsed: 'unavailable',
      sourcesMonitored: {
        bluesky: BLUESKY_ACCOUNTS,
        telegram: TELEGRAM_CHANNELS,
      },
      warning: 'Live ingestion timed out; retrying in background',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=30',
        'X-Cache-Status': 'DEGRADED-FALLBACK',
        ...corsHeaders,
      },
    });
  } finally {
    if (inFlightPromise) {
      inFlightPromise.then((data) => {
        if (data && Array.isArray(data.briefings) && data.briefings.length > 0) {
          lastKnownGoodData = data;
          memoryCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
          setRedisCache(redisKey, data, CACHE_TTL_SECONDS).catch(() => {});
        }
      }).catch(() => {}).finally(() => {
        inFlightPromise = null;
      });
    }
  }
}
