import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';



// In-memory cache for warm edge/serverless instances (15 minutes TTL)
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  const send = (status, data, extraHeaders = {}) => {
    const allHeaders = { ...corsHeaders, ...extraHeaders };
    if (res && typeof res.setHeader === 'function') {
      res.statusCode = status;
      for (const [k, v] of Object.entries(allHeaders)) {
        res.setHeader(k, v);
      }
      if (typeof res.json === 'function') {
        return res.json(data);
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(data !== undefined && data !== null ? JSON.stringify(data) : '');
    }
    return new Response(data !== undefined && data !== null ? JSON.stringify(data) : null, {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...allHeaders,
      },
    });
  };

  if (isDisallowedOrigin(req)) {
    return send(403, { error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return send(204, null);
  }
  if (req.method !== 'GET') {
    return send(405, { error: 'Method not allowed' });
  }

  const now = Date.now();
  if (cachedData && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return send(200, cachedData, {
      'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=300',
      'X-Cache': 'HIT',
    });
  }

  try {
    const upstreamUrl = 'https://api.adsb.lol/v2/mil';

    const response = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/EdgeProxy',
      },
      // Give ADSB 10 seconds to respond before giving up
      signal: AbortSignal.timeout(10000) 
    });

    if (!response.ok) {
      if (cachedData) {
        return send(200, cachedData, {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'X-Cache': 'STALE',
        });
      }
      return send(response.status, { error: `ADSB.lol returned ${response.status}` });
    }

    const data = await response.json();
    cachedData = data;
    cacheTimestamp = Date.now();

    return send(200, data, {
      'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=300',
      'X-Cache': 'MISS',
    });
  } catch (error) {
    if (cachedData) {
      return send(200, cachedData, {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Cache': 'STALE-ERROR',
      });
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return send(isTimeout ? 504 : 502, {
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    });
  }
}
