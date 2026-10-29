import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

function getRelayBaseUrl() {
  let raw = process.env.WS_RELAY_URL || process.env.VITE_WS_RELAY_URL || '';
  if (typeof raw !== 'string') return null;
  raw = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;

  if (raw.startsWith('wss://')) {
    raw = 'https://' + raw.slice(6);
  } else if (raw.startsWith('ws://')) {
    raw = 'http://' + raw.slice(5);
  } else if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch (err) {
    console.warn('[Polymarket Proxy] Invalid WS_RELAY_URL configured:', raw, err?.message || err);
    return null;
  }
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
    const relayUrl = new URL(`/polymarket${requestUrl.search || ''}`, relayBaseUrl).toString();
    const response = await fetchWithTimeout(relayUrl, {
      headers: getRelayHeaders({ Accept: 'application/json' }),
    }, 15000);

    const body = await response.text();
    const headers = {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      ...corsHeaders,
    };

    return new Response(body, {
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
