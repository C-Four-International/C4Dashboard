import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// In-memory cache for warm edge isolates (60 seconds TTL)
let cachedJammedJson = null;
let cachedTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

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

  const now = Date.now();
  if (cachedJammedJson && (now - cachedTimestamp < CACHE_TTL_MS)) {
    return new Response(cachedJammedJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
        'X-Cache': 'HIT',
        ...corsHeaders,
      },
    });
  }

  try {
    const endpoints = [
      'https://api.adsb.lol/v2/lat/33.0/lon/35.0/dist/250',
      'https://api.adsb.lol/v2/lat/47.0/lon/32.0/dist/250',
      'https://api.adsb.lol/v2/lat/55.0/lon/21.0/dist/250',
      'https://api.adsb.lol/v2/lat/38.0/lon/127.0/dist/250'
    ];

    // Fetch all 4 regions in parallel with Promise.allSettled instead of serial for-await loop
    const results = await Promise.allSettled(
      endpoints.map(url =>
        fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WorldMonitor/GPSJammingEdge',
          },
          signal: AbortSignal.timeout(6000),
        }).then(async res => {
          if (!res.ok) return null;
          return res.json();
        })
      )
    );

    const jammedPoints = [];
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value?.ac) {
        for (const plane of res.value.ac) {
          if (plane.lat && plane.lon && (plane.nic < 8 || plane.nac_p < 9)) {
            const weight = ((8 - (plane.nic || 0)) + (9 - (plane.nac_p || 0))) / 17;
            jammedPoints.push([plane.lon, plane.lat, Math.max(0.1, weight)]);
          }
        }
      }
    }

    const jsonString = JSON.stringify(jammedPoints);
    cachedJammedJson = jsonString;
    cachedTimestamp = Date.now();

    return new Response(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
        'X-Cache': 'MISS',
        ...corsHeaders,
      },
    });
  } catch (error) {
    if (cachedJammedJson) {
      return new Response(cachedJammedJson, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
          'X-Cache': 'STALE-ERROR',
          ...corsHeaders,
        },
      });
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return new Response(JSON.stringify({
      error: isTimeout ? 'ADSB.lol upstream timeout' : 'ADSB.lol fetch failed',
      details: error?.message || String(error),
    }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
