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
    // We hit ADSB.lol v2/all to get a global picture for jamming detection
    const upstreamUrl = 'https://api.adsb.lol/v2/all';

    const response = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/EdgeProxy',
      },
      signal: AbortSignal.timeout(15000) 
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const data = await response.json();
    
    // Filter the huge payload down to just what we need:
    // Aircraft with degraded GPS integrity (NIC < 7 or NACp < 8)
    const jammedPoints = [];
    if (data && data.ac) {
      for (const plane of data.ac) {
        // Loosen to NIC < 8 or NACp < 9 to capture more slightly degraded signals
        if (plane.lat && plane.lon && (plane.nic < 8 || plane.nac_p < 9)) {
          // Weight calculation: lower NIC/NACp means stronger jamming
          const weight = ((8 - (plane.nic || 0)) + (9 - (plane.nac_p || 0))) / 17;
          jammedPoints.push([plane.lon, plane.lat, Math.max(0.1, weight)]);
        }
      }
    }

    return new Response(JSON.stringify(jammedPoints), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
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
