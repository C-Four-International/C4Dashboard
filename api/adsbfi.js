import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';



export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  // Set CORS headers early if res is provided
  if (res?.setHeader) {
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }
  }

  if (isDisallowedOrigin(req)) {
    if (res?.status) return res.status(403).json({ error: 'Origin not allowed' });
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    if (res?.status) return res.status(204).end();
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    if (res?.status) return res.status(405).json({ error: 'Method not allowed' });
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const upstreamUrl = 'https://api.adsb.lol/v2/mil';

    const response = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/EdgeProxy',
      },
      signal: AbortSignal.timeout(10000) 
    });

    const data = await response.json();
    if (res?.status) {
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=300');
      return res.json(data);
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const status = isTimeout ? 504 : 502;
    const errorBody = {
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    };
    if (res?.status) return res.status(status).json(errorBody);
    return new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

