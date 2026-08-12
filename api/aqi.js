import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

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

  try {
    const requestUrl = new URL(req.url);
    const bounds = requestUrl.searchParams.get('bounds');
    const token = process.env.AQICN_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({ error: 'AQICN_TOKEN is not configured on the server.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (!bounds) {
      return new Response(JSON.stringify({ error: 'Missing bounds parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const upstreamUrl = `https://api.waqi.info/v2/map/bounds?latlng=${bounds}&networks=all&token=${token}`;

    const response = await fetchWithTimeout(upstreamUrl, {
      headers: { 'Accept': 'application/json' },
    }, 15000);

    const body = await response.text();
    const finalHeaders = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30', // Cache for 1 min
      ...corsHeaders,
    };

    return new Response(body, {
      status: response.status,
      headers: finalHeaders,
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'AQICN upstream timeout' : 'AQICN fetch failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
