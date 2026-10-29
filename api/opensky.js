import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// In-memory token cache for warm edge/serverless instances
let cachedToken = null;
let tokenExpiresAt = 0;

// In-memory raw text cache for states response to prevent duplicate upstream calls and eliminate JSON parse/stringify
let cachedStatesText = null;
let cachedStatesTimestamp = 0;
const STATES_CACHE_TTL_MS = 60 * 1000; // 60 seconds

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
        'User-Agent': 'WorldMonitor/EdgeProxy',
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

  const reqUrl = req.url || '';
  const isDebug = reqUrl.includes('debug=true');

  try {
    const url = new URL(reqUrl, `http://${req.headers?.host || (req.headers?.get && req.headers.get('host')) || 'localhost'}`);
    const query = url.search;

    // Check warm cache for default/empty queries to save active CPU
    const now = Date.now();
    if (!isDebug && (!query || query === '?') && cachedStatesText && (now - cachedStatesTimestamp < STATES_CACHE_TTL_MS)) {
      return sendText(200, cachedStatesText, {
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
        'X-Cache': 'HIT',
      });
    }

    const upstreamUrl = `https://opensky-network.org/api/states/all${query}`;
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/EdgeProxy',
    };

    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      const token = await getOpenSkyToken();

      // Debug route
      if (isDebug) {
        return sendJson(200, {
          debug: true,
          token_success: !!token,
          token_prefix: token ? token.substring(0, 15) : null,
        });
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(upstreamUrl, {
      headers,
      // Give OpenSky 25 seconds to respond before giving up to avoid 504s on large payloads
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      if (cachedStatesText) {
        return sendText(200, cachedStatesText, {
          'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
          'X-Cache': 'STALE',
        });
      }
      return sendJson(response.status, { error: `OpenSky upstream returned ${response.status}` });
    }

    // Stream/read text directly to eliminate multi-megabyte JSON.parse & JSON.stringify Active CPU
    const text = await response.text();
    if (!query || query === '?') {
      cachedStatesText = text;
      cachedStatesTimestamp = Date.now();
    }

    return sendText(200, text, {
      'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      'X-Cache': 'MISS',
    });
  } catch (error) {
    if (cachedStatesText) {
      return sendText(200, cachedStatesText, {
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
        'X-Cache': 'STALE-ERROR',
      });
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return sendJson(isTimeout ? 504 : 502, {
      error: isTimeout ? 'OpenSky upstream timeout' : 'OpenSky fetch failed',
      details: error?.message || String(error),
    };
    if (res?.status) return res.status(status).json(errorBody);
    return new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

