import { Redis } from '@upstash/redis/cloudflare';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getOpenSkyToken() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  // Check Upstash Redis cache first
  try {
    const cachedToken = await redis.get('opensky_oauth_token');
    if (cachedToken) {
      return cachedToken;
    }
  } catch (err) {
    console.error('[OpenSky Edge] Redis GET error:', err.message);
  }

  // If not cached, fetch new token directly from OpenSky auth server
  const postData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  try {
    const response = await fetchWithTimeout('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'WorldMonitor/EdgeProxy',
      },
      body: postData,
    }, 15000);

    if (!response.ok) {
      console.error(`[OpenSky Edge] Auth failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.access_token) {
      // Cache the new token. OpenSky tokens expire in 1800s. Buffer by 100s.
      try {
        await redis.setex('opensky_oauth_token', 1700, data.access_token);
      } catch (err) {
        console.error('[OpenSky Edge] Redis SET error:', err.message);
      }
      return data.access_token;
    }
  } catch (err) {
    console.error('[OpenSky Edge] Auth fetch error:', err.message);
  }

  return null;
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
    const token = await getOpenSkyToken();
    
    // Construct direct OpenSky API URL
    const upstreamUrl = `https://opensky-network.org/api/states/all${requestUrl.search || ''}`;

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/EdgeProxy',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetchWithTimeout(upstreamUrl, { headers }, 15000);

    const body = await response.text();
    const finalHeaders = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      ...corsHeaders,
    };
    if (token) {
      finalHeaders['X-OpenSky-Auth'] = 'OAuth2';
    }

    return new Response(body, {
      status: response.status,
      headers: finalHeaders,
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'OpenSky upstream timeout' : 'OpenSky fetch failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
