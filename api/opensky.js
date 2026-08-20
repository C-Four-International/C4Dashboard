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
    const url = new URL(req.url, `http://${req.headers.host}`);
    const query = url.search;
    const upstreamUrl = `https://opensky-network.org/api/states/all${query}`;
    const headers = { 'Accept': 'application/json' };

    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      const token = await getOpenSkyToken();
      
      // Debug route
      if (req.url.includes('debug=true')) {
        return res.status(200).json({ 
          debug: true, 
          token_success: !!token,
          token_prefix: token ? token.substring(0, 15) : null
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

    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=60, stale-while-revalidate=300');

    // Pipe response body
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'OpenSky upstream timeout' : 'OpenSky fetch failed',
      details: error?.message || String(error),
    });
  }
}
