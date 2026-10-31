import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// In-memory raw text cache for warm edge/serverless instances (5 minutes TTL)
// Storing pre-serialized string eliminates megabytes of JSON.parse & JSON.stringify Active CPU
let cachedText = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  const sendText = (status, text, extraHeaders = {}) => {
    const allHeaders = {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...extraHeaders,
    };
    if (res && typeof res.setHeader === 'function') {
      res.statusCode = status;
      for (const [k, v] of Object.entries(allHeaders)) {
        res.setHeader(k, v);
      }
      return res.end(text != null ? text : '');
    }
    return new Response(text != null ? text : null, {
      status,
      headers: allHeaders,
    });
  };

  const sendJson = (status, obj, extraHeaders = {}) => {
    return sendText(status, obj !== undefined && obj !== null ? JSON.stringify(obj) : '', extraHeaders);
  };

  if (isDisallowedOrigin(req)) {
    return sendJson(403, { error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return sendText(204, null);
  }
  if (req.method !== 'GET') {
    return sendJson(405, { error: 'Method not allowed' });
  }

  const now = Date.now();
  if (cachedText && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return sendText(200, cachedText, {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      'X-Cache': 'HIT',
    });
  }

  try {
    const upstreams = [
      'https://opendata.adsb.fi/api/v2/mil',
      'https://api.adsb.lol/v2/mil',
    ];

    // Fetch from all upstreams in parallel to maximize global coverage
    const results = await Promise.allSettled(
      upstreams.map(async (url) => {
        const resp = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WorldMonitor/EdgeProxy',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return null;
        return resp.json();
      })
    );

    const mergedAc = [];
    const seenHex = new Set();
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.ac)) {
        for (const plane of res.value.ac) {
          if (plane && plane.hex && !seenHex.has(plane.hex)) {
            seenHex.add(plane.hex);
            mergedAc.push(plane);
          }
        }
      }
    }

    if (mergedAc.length === 0) {
      if (cachedText) {
        return sendText(200, cachedText, {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
          'X-Cache': 'STALE',
        });
      }
      return sendJson(502, { error: 'All ADSB military upstreams failed' });
    }

    const payload = JSON.stringify({
      ac: mergedAc,
      total: mergedAc.length,
      ctime: Math.floor(Date.now() / 1000),
    });

    cachedText = payload;
    cacheTimestamp = Date.now();

    return sendText(200, payload, {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      'X-Cache': 'MISS',
    });
  } catch (error) {
    if (cachedText) {
      return sendText(200, cachedText, {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        'X-Cache': 'STALE-ERROR',
      });
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return sendJson(isTimeout ? 504 : 502, {
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    });
  }
}
