import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';



// In-memory cache for warm edge/serverless instances (15 minutes TTL)
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  // Set CORS headers early
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (isDisallowedOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const now = Date.now();
  if (cachedData && (now - cacheTimestamp < CACHE_TTL_MS)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'HIT');
    return res.json(cachedData);
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
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
        res.setHeader('X-Cache', 'STALE');
        return res.json(cachedData);
      }
      return res.status(response.status).json({ error: `ADSB.lol returned ${response.status}` });
    }

    const data = await response.json();
    cachedData = data;
    cacheTimestamp = Date.now();

    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900, stale-while-revalidate=300');
    res.setHeader('X-Cache', 'MISS');

    // Pipe response body
    return res.json(data);
  } catch (error) {
    if (cachedData) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      res.setHeader('X-Cache', 'STALE-ERROR');
      return res.json(cachedData);
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    });
  }
}
