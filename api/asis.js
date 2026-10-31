import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// Module-level in-memory tile cache: 2,000 tiles (~12MB of RAM)
const MAX_CACHED_TILES = 2000;
const TILE_CACHE = new Map();
const IN_FLIGHT_FETCHES = new Map();

// 1x1 transparent PNG fallback buffer for invalid/off-bound or failed tiles
const TRANSPARENT_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00,
  0x00, 0x05, 0x00, 0x01, 0xe9, 0xfa, 0xdc, 0xd8, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function normalizeBbox(rawBbox) {
  const parts = String(rawBbox || '').split(',').map(p => Number(p));
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    return null;
  }
  return parts.map(n => n.toFixed(4)).join(',');
}

function computeEtag(service, normBbox) {
  let hash = 0;
  const str = `${service}:${normBbox}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

function putInTileCache(key, entry) {
  if (TILE_CACHE.size >= MAX_CACHED_TILES) {
    const oldest = TILE_CACHE.keys().next().value;
    if (oldest) TILE_CACHE.delete(oldest);
  }
  TILE_CACHE.set(key, entry);
}

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
  const rawBbox = url.searchParams.get('bbox');

  if (!service || !rawBbox) {
    return new Response('Missing service or bbox', { status: 400, headers: corsHeaders });
  }

  // Restrict proxy to valid FAO ASIS services to prevent abuse
  if (!['ASI_A', 'DI_A', 'VCI_M'].includes(service)) {
    return new Response('Invalid service', { status: 400, headers: corsHeaders });
  }

  const normBbox = normalizeBbox(rawBbox);
  if (!normBbox) {
    return new Response('Invalid bbox parameters', { status: 400, headers: corsHeaders });
  }

  const cacheKey = `${service}:${normBbox}`;
  const etag = computeEtag(service, normBbox);

  // 1. Conditional request check (HTTP 304 Not Modified)
  const clientEtag = req.headers.get('if-none-match');
  if (clientEtag && clientEtag === etag && TILE_CACHE.has(cacheKey)) {
    return new Response(null, {
      status: 304,
      headers: {
        ...corsHeaders,
        ETag: etag,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
        'X-Tile-Cache': 'HIT-NOT-MODIFIED',
      },
    });
  }

  // 2. In-memory tile cache hit
  const cached = TILE_CACHE.get(cacheKey);
  if (cached) {
    return new Response(cached.buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': cached.contentType || 'image/png',
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
        ETag: etag,
        'X-Tile-Cache': 'HIT',
      },
    });
  }

  // 3. Deduplicate in-flight fetch
  if (IN_FLIGHT_FETCHES.has(cacheKey)) {
    try {
      const result = await IN_FLIGHT_FETCHES.get(cacheKey);
      return new Response(result.buffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': result.contentType || 'image/png',
          'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
          ETag: etag,
          'X-Tile-Cache': 'HIT-DEDUP',
        },
      });
    } catch {
      // Fall through to independent retry
    }
  }

  // 4. Fetch from FAO ASIS ImageServer
  const targetUrl = `https://asis-esri.fao.org/image/rest/services/${service}/ImageServer/exportImage?bbox=${normBbox}&bboxSR=4326&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`;

  const fetchPromise = (async () => {
    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'WorldMonitor/EdgeTileProxy (+https://worldmonitor.app)',
          Accept: 'image/png,image/*;q=0.8',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`Upstream HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      const arrayBuf = await response.arrayBuffer();
      const buffer = new Uint8Array(arrayBuf);

      const entry = { buffer, contentType, timestamp: Date.now() };
      putInTileCache(cacheKey, entry);
      return entry;
    } catch (err) {
      // On upstream failure or timeout, return transparent fallback tile so DeckGL doesn't hang
      const fallbackEntry = { buffer: TRANSPARENT_PNG, contentType: 'image/png', timestamp: Date.now() };
      return fallbackEntry;
    } finally {
      IN_FLIGHT_FETCHES.delete(cacheKey);
    }
  })();

  IN_FLIGHT_FETCHES.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return new Response(result.buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': result.contentType || 'image/png',
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
        ETag: etag,
        'X-Tile-Cache': 'MISS',
      },
    });
  } catch {
    return new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
        'X-Tile-Cache': 'FALLBACK',
      },
    });
  }
}
