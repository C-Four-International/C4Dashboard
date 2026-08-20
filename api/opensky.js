import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

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

  try {
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const upstreamUrl = `https://opensky-network.org/api/states/all${query}`;

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/EdgeProxy',
    };

    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      const authStr = `${process.env.OPENSKY_CLIENT_ID}:${process.env.OPENSKY_CLIENT_SECRET}`;
      headers['Authorization'] = 'Basic ' + btoa(authStr);
    }

    const response = await fetch(upstreamUrl, {
      headers,
      // Give OpenSky 25 seconds to respond before giving up to avoid 504s on large payloads
      signal: AbortSignal.timeout(25000) 
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
        ...corsHeaders,
      },
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'OpenSky upstream timeout' : 'OpenSky fetch failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
