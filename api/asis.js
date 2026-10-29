import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (isDisallowedOrigin(req)) {
    return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const service = url.searchParams.get('service');
  const bbox = url.searchParams.get('bbox');
  
  if (!service || !bbox) {
    return new Response('Missing service or bbox', { status: 400, headers: corsHeaders });
  }

  // Restrict proxy to the valid FAO ASIS services to prevent abuse
  if (!['ASI_A', 'DI_A', 'VCI_M'].includes(service)) {
    return new Response('Invalid service', { status: 400, headers: corsHeaders });
  }

  const targetUrl = `https://asis-esri.fao.org/image/rest/services/${service}/ImageServer/exportImage?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'WorldMonitor/EdgeTileProxy',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return new Response('Error fetching from FAO ASIS', { status: response.status, headers: corsHeaders });
    }

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
    // ASIS satellite imagery updates once every 10–30 days. Cache tiles at CDN edge to consume 0 Active CPU on map pan/zoom.
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response('Proxy fetch error', { status: 502, headers: corsHeaders });
  }
}
