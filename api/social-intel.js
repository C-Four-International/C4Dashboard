import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// Prominent OSINT and News accounts on Bluesky (AT Protocol)
const BLUESKY_ACCOUNTS = [
  'bellingcat.com',
  'osinttechnical.bsky.social',
  'kyivindependent.com',
  'reuters.com',
  'apnews.com',
  'geoconfirmed.bsky.social',
  'warmonitor3.bsky.social',
  'defense-one.bsky.social',
  'dw.com',
  'bbcnews.bsky.social',
];

// Prominent OSINT and News channels on Telegram
const TELEGRAM_CHANNELS = [
  'liveukraine_media',
  'clashreport',
  'osinttechnical',
  'inaborodina',
  'MiddleEastSpectator',
  'militarnyi_eng',
  'warmonitor',
  'bellingcat',
];

// 3-hour cache TTL (10,800 seconds = 10,800,000 ms)
const CACHE_TTL_SECONDS = 3 * 60 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

// In-memory cache for edge runtime instance
let memoryCache = {
  data: null,
  expiresAt: 0,
};

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
    await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Ignore Redis set errors
  }
}

// ============================================================================
// Noise Filtering & Prompt Cleaning (Local & Non-Agentic)
// ============================================================================
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
  const boilerplatePatterns = [
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
  for (const pat of boilerplatePatterns) {
    cleaned = cleaned.replace(pat, ' ');
  }

  // 4. Remove emojis & pictorial characters
  cleaned = cleaned.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}]/gu, '');

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

// Simple text Jaccard similarity fallback if embedding API is unreachable
function jaccardSimilarity(textA, textB) {
  const wordsA = new Set(textA.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const wordsB = new Set(textB.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
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
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(7000) });
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
async function fetchTelegramChannelPosts(channel, apiKey) {
  // 1. If MTProto relay is configured, query it first
  if (process.env.WS_RELAY_URL) {
    let relay = process.env.WS_RELAY_URL;
    if (relay.startsWith('wss://')) relay = relay.replace('wss://', 'https://');
    if (relay.startsWith('ws://')) relay = relay.replace('ws://', 'http://');
    try {
      const relayUrl = `${relay}/telegram/feed?channel=${encodeURIComponent(channel)}&limit=15`;
      const headers = {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor-Intel/1.0 (+https://worldmonitor.app)',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['X-Telegram-Key'] = apiKey;
      }

      const res = await fetch(relayUrl, { headers, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.messages || data.items || [];
        if (items.length > 0) {
          return items.map(m => ({
            id: `tg-${channel}-${m.id || Math.random().toString(36).slice(2)}`,
            platform: 'telegram',
            author: `@${channel}`,
            authorName: channel,
            url: m.url || `https://t.me/${channel}/${m.id || ''}`,
            publishedAt: m.date ? new Date(typeof m.date === 'number' ? m.date * 1000 : m.date).toISOString() : new Date().toISOString(),
            rawText: m.text || m.caption || m.message || '',
          }));
        }
      }
    } catch {
      // Fall through to public preview scraping
    }
  }

  // 2. Official Telegram Web Widget preview (https://t.me/s/<channel>)
  const previewUrl = `https://t.me/s/${channel}`;
  try {
    const res = await fetch(previewUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const posts = [];
    // Telegram widget message items are demarcated by class="tgme_widget_message"
    const messageBlocks = html.split(/<div[^>]*class="[^"]*tgme_widget_message\b/i);

    for (let i = 1; i < messageBlocks.length; i++) {
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

// Ingest all candidate accounts across Bluesky and Telegram
async function ingestAllPosts() {
  const bskyKey = process.env.BLUESKY_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;

  const authHeader = await getBlueskyAuthHeader(bskyKey);
  const bskyPromises = BLUESKY_ACCOUNTS.map(account => fetchBlueskyAuthorPosts(account, authHeader));
  const tgPromises = TELEGRAM_CHANNELS.map(channel => fetchTelegramChannelPosts(channel, tgKey));
  const botPromise = tgKey ? fetchTelegramBotUpdates(tgKey) : Promise.resolve([]);

  const results = await Promise.allSettled([...bskyPromises, ...tgPromises, botPromise]);

  const allPosts = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allPosts.push(...r.value);
    }
  }

  return allPosts;
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
      signal: AbortSignal.timeout(12000),
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
1. Grounding: You must ONLY state concrete, corroborated facts directly reported in the provided source texts. Do NOT extrapolate, speculate, or introduce any outside facts.
2. Brevity: The briefing MUST be UNDER 25 WORDS.
3. Tone: Telegraphic, objective wire-service intelligence style (e.g. 'Ukrainian air defenses intercepted 14 drones over Kharkiv; power infrastructure sustained minor damage.').
4. No preambles, titles, courtesy phrases, or formatting like markdown asterisks. Just the raw factual briefing under 25 words.`;

  // Use Google AI Studio's lowest cost models: gemini-1.5-flash-8b ($0.0375/1M tokens) with fallbacks
  const models = ['gemini-1.5-flash-8b', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: `CORROBORATED SOURCE REPORTS:\n${combinedContext}\n\nGenerate the <=25 word factual briefing:` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 60,
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const json = await res.json();
        const rawBrief = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (rawBrief) {
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

// Local deterministic fallback synthesizer if AI Studio is offline or has no key
function generateLocalBriefingFallback(clusterPosts) {
  // Pick the most representative post with shortest, clearest headline sentence
  const bestPost = clusterPosts.reduce((best, cur) => {
    return cur.cleanedText.length < best.cleanedText.length ? cur : best;
  }, clusterPosts[0]);

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
    // Jaccard similarity fallback if embeddings unavailable
    const visited = new Set();
    for (let i = 0; i < cleanedPosts.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [cleanedPosts[i]];
      visited.add(i);

      for (let j = i + 1; j < cleanedPosts.length; j++) {
        if (visited.has(j)) continue;
        const sim = jaccardSimilarity(cleanedPosts[i].cleanedText, cleanedPosts[j].cleanedText);
        if (sim >= 0.28) {
          cluster.push(cleanedPosts[j]);
          visited.add(j);
        }
      }
      clusters.push(cluster);
    }
  }

  // 4. Cross-Referencing: Require >= 2 distinct sources/accounts
  const corroboratedClusters = clusters.filter(cluster => {
    const distinctAuthors = new Set(cluster.map(p => `${p.platform}:${p.author}`));
    return distinctAuthors.size >= 2;
  });

  // Sort clusters by number of corroborated sources descending
  corroboratedClusters.sort((a, b) => b.length - a.length);

  // If no multi-source clusters were found (e.g. quiet news cycle), retain top 3 freshest substantive items
  // clearly marked as single-source monitor items
  const finalClusters = corroboratedClusters.length > 0 ? corroboratedClusters.slice(0, 15) : clusters.slice(0, 5);

  // 5. Briefing Generation (< 25 words)
  const briefings = [];
  let modelUsedOverall = 'local-corroborator';

  for (let i = 0; i < finalClusters.length; i++) {
    const cluster = finalClusters[i];
    const distinctAuthors = new Set(cluster.map(p => `${p.platform}:${p.author}`));
    const isMultiSource = distinctAuthors.size >= 2;

    let res = null;
    if (geminiKey) {
      res = await generateAirGappedBriefing(cluster, geminiKey);
    }
    if (!res) {
      res = generateLocalBriefingFallback(cluster);
    }
    modelUsedOverall = res.modelUsed;

    const platforms = Array.from(new Set(cluster.map(p => p.platform)));
    const latestPostDate = cluster.reduce((latest, p) => {
      const pTime = new Date(p.publishedAt).getTime();
      return pTime > latest ? pTime : latest;
    }, 0);

    const wordCount = res.briefing.split(/\s+/).filter(Boolean).length;

    briefings.push({
      id: `briefing-${i}-${Date.now().toString(36)}`,
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
      })),
      platforms,
      corroborationScore: distinctAuthors.size,
      isMultiSource,
    });
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
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const url = new URL(req.url);
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

  // 3. Generate fresh briefings
  try {
    const freshData = await buildSocialIntelBriefings();

    // Store in memory cache
    memoryCache = {
      data: freshData,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    // Store in Upstash Redis cache
    await setRedisCache(redisKey, freshData, CACHE_TTL_SECONDS);

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
    console.error('[SocialIntel] Fatal handler error:', err);
    return new Response(JSON.stringify({
      error: 'Failed to generate social media intelligence briefings',
      details: err.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
