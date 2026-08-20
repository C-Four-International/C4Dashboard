import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

function getRelayBaseUrl() {
  let relayUrl = process.env.WS_RELAY_URL || process.env.VITE_WS_RELAY_URL;
  if (!relayUrl) return null;
  // Auto-prepend https:// if the user forgot the protocol in their environment variables
  if (!relayUrl.startsWith('http') && !relayUrl.startsWith('ws')) {
    relayUrl = `https://${relayUrl}`;
  }
  return relayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
}

function getRelayHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const relaySecret = process.env.RELAY_SHARED_SECRET || '';
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

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

  const relayBaseUrl = getRelayBaseUrl();
  if (!relayBaseUrl) {
    return new Response(JSON.stringify({ error: 'WS_RELAY_URL is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const requestUrl = new URL(req.url);
    const targetUrl = relayBaseUrl.endsWith('/ais/snapshot') 
      ? relayBaseUrl 
      : `${relayBaseUrl}/ais/snapshot`;
    const relayUrl = `${targetUrl}${requestUrl.search || ''}`;
    const response = await fetchWithTimeout(relayUrl, {
      headers: getRelayHeaders({
        Accept: 'application/json',
        Origin: req.headers.get('origin') || '',
        'User-Agent': req.headers.get('user-agent') || 'WorldMonitor/EdgeProxy',
      }),
    }, 12000);

    const headers = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      ...corsHeaders,
    };
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'Relay timeout' : 'Relay request failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
