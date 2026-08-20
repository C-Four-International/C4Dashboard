import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';



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

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=300');

    // Pipe response body
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    });
  }
}
