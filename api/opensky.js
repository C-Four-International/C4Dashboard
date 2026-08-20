import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';



// In-memory token cache for warm edge functions
let cachedToken = null;
let tokenExpiresAt = 0;

async function getOpenSkyToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return null; // Missing credentials
  }

  const tokenUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[OpenSky Proxy] Token fetch failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.access_token) {
      cachedToken = data.access_token;
      // Refresh 30 seconds before expiration to avoid race conditions
      const expiresIn = (data.expires_in || 1800) * 1000;
      tokenExpiresAt = Date.now() + expiresIn - 30000;
      return cachedToken;
    }
  } catch (error) {
    console.error(`[OpenSky Proxy] Token fetch error:`, error);
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
    const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const upstreamUrl = `https://opensky-network.org/api/states/all${query}`;

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/EdgeProxy',
    };

    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      const token = await getOpenSkyToken();
      
      // Debug route
      if (req.url.includes('debug=true')) {
        return new Response(JSON.stringify({ 
          debug: true, 
          token_success: !!token,
          token_prefix: token ? token.substring(0, 15) : null
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
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
