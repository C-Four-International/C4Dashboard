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
    const regions = [
      { lat: 33.0, lon: 35.0, dist: 250 },
      { lat: 47.0, lon: 32.0, dist: 250 },
      { lat: 55.0, lon: 21.0, dist: 250 },
      { lat: 38.0, lon: 127.0, dist: 250 }
    ];

    const fetchRegion = async (r) => {
      const upstreams = [
        `https://opendata.adsb.fi/api/v2/lat/${r.lat}/lon/${r.lon}/dist/${r.dist}`,
        `https://api.adsb.lol/v2/lat/${r.lat}/lon/${r.lon}/dist/${r.dist}`
      ];
      for (const url of upstreams) {
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'WorldMonitor/GPSJammingEdge',
            },
            signal: AbortSignal.timeout(6000),
          });
          if (res.ok) {
            const data = await res.json();
            const planes = data.aircraft || data.ac || [];
            if (planes.length > 0) return planes;
          }
        } catch {
          // Try next upstream
        }
      }
      return [];
    };

    const results = await Promise.allSettled(regions.map(fetchRegion));

    const jammedPoints = [];
    for (const res of results) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (const plane of res.value) {
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
