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
    const endpoints = [
      'https://api.adsb.lol/v2/lat/33.0/lon/35.0/dist/250',
      'https://api.adsb.lol/v2/lat/47.0/lon/32.0/dist/250',
      'https://api.adsb.lol/v2/lat/55.0/lon/21.0/dist/250',
      'https://api.adsb.lol/v2/lat/38.0/lon/127.0/dist/250'
    ];

    const jammedPoints = [];
    
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'C4Dashboard/EdgeProxy',
          },
          signal: AbortSignal.timeout(5000) 
        });

        if (!response.ok) {
          console.warn(`[GPS Jamming] Upstream ${url} returned ${response.status}`);
          continue; // Skip this region on failure
        }

        const data = await response.json();
        
        if (data && data.ac) {
          for (const plane of data.ac) {
            if (plane.lat && plane.lon && (plane.nic < 8 || plane.nac_p < 9)) {
              const weight = ((8 - (plane.nic || 0)) + (9 - (plane.nac_p || 0))) / 17;
              jammedPoints.push([plane.lon, plane.lat, Math.max(0.1, weight)]);
            }
          }
        }
      } catch (err) {
        console.warn(`[GPS Jamming] Failed to fetch ${url}:`, err.message);
      }
    }

    return new Response(JSON.stringify(jammedPoints), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
        ...corsHeaders,
      },
    });
  } catch (error) {
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
