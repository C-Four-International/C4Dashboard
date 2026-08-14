import { getCorsHeaders } from './_cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const service = url.searchParams.get('service');
  const bbox = url.searchParams.get('bbox');
  
  if (!service || !bbox) {
    return new Response('Missing service or bbox', { status: 400, headers: getCorsHeaders(req) });
  }

  // Restrict proxy to the valid FAO ASIS services to prevent abuse
  if (!['ASI_A', 'DI_A', 'VCI_M'].includes(service)) {
    return new Response('Invalid service', { status: 400, headers: getCorsHeaders(req) });
  }

  const targetUrl = `https://asis-esri.fao.org/image/rest/services/${service}/ImageServer/exportImage?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;
  
  try {
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return new Response('Error fetching from FAO ASIS', { status: response.status, headers: getCorsHeaders(req) });
    }

    const headers = new Headers(response.headers);
    
    // Merge local CORS headers so the browser allows the canvas to read the image pixels
    const corsHeaders = getCorsHeaders(req);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
    
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch (err) {
    return new Response('Proxy fetch error', { status: 500, headers: getCorsHeaders(req) });
  }
}
