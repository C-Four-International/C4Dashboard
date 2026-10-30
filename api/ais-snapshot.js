import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// IP Sliding-Window Rate Limiting (10 requests per 60 seconds)
const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
  if (!ip || ip === 'unknown') return false;
  const now = Date.now();
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.windowStart > RATE_WINDOW_MS) {
        rateLimitMap.delete(k);
      }
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

// In-memory cache & single-flight deduplication across concurrent edge requests
const edgeCache = new Map();
const inFlightFetches = new Map();
const EDGE_CACHE_TTL_MS = 60 * 1000;

function getRelayBaseUrl() {
  let relayUrl = process.env.WS_RELAY_URL || process.env.VITE_WS_RELAY_URL;
  if (!relayUrl) return null;
  // Auto-prepend https:// if the user forgot the protocol in their environment variables
  if (!relayUrl.startsWith('http') && !relayUrl.startsWith('ws')) {
    relayUrl = `https://${relayUrl}`;
  }
  return relayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
}

function getRelayHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const relaySecret = process.env.RELAY_SHARED_SECRET || '';
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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

  // Rate Limiting by client IP
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({
      error: 'Too many requests. Please wait a minute before requesting another AIS snapshot.',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  }

  const relayBaseUrl = getRelayBaseUrl();
  if (!relayBaseUrl) {
    return new Response(JSON.stringify({ error: 'WS_RELAY_URL is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const requestUrl = new URL(req.url);
  const targetUrl = relayBaseUrl.endsWith('/ais/snapshot') 
    ? relayBaseUrl 
    : `${relayBaseUrl}/ais/snapshot`;
  const relayUrl = `${targetUrl}${requestUrl.search || ''}`;
  const cacheKey = requestUrl.search || 'snapshot';

  // 1. Check in-memory edge cache
  const cached = edgeCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp < EDGE_CACHE_TTL_MS)) {
    return new Response(cached.body, {
      status: cached.status,
      headers: {
        'Content-Type': cached.contentType || 'application/json',
        'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        'X-Edge-Cache': 'HIT',
        ...corsHeaders,
      },
    });
  }

  // 2. In-flight single-flight fetch coalescing
  let inFlight = inFlightFetches.get(cacheKey);
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const response = await fetchWithTimeout(relayUrl, {
          headers: getRelayHeaders({
            Accept: 'application/json',
            Origin: req.headers.get('origin') || '',
            'User-Agent': req.headers.get('user-agent') || 'WorldMonitor/EdgeProxy',
          }),
        }, 12000);

        const body = await response.text();
        const contentType = response.headers.get('content-type') || 'application/json';
        const entry = {
          body,
          status: response.status,
          contentType,
          timestamp: Date.now(),
        };
        if (response.ok) {
          edgeCache.set(cacheKey, entry);
        }
        return { entry, isFresh: true };
      } finally {
        inFlightFetches.delete(cacheKey);
      }
    })();
    inFlightFetches.set(cacheKey, inFlight);
  }

  try {
    const { entry, isFresh } = await inFlight;
    return new Response(entry.body, {
      status: entry.status,
      headers: {
        'Content-Type': entry.contentType,
        'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        'X-Edge-Cache': isFresh ? 'MISS' : 'HIT-INFLIGHT',
        ...corsHeaders,
      },
    });
  } catch (error) {
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
          'X-Edge-Cache': 'STALE-FALLBACK',
          ...corsHeaders,
        },
      });
    }
    const isTimeout = error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'Relay timeout' : 'Relay request failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
