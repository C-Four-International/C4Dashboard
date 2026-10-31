/**
 * UN FAO ASIS Satellite Imagery Tile Service & High-Performance Client Cache
 *
 * Provides optimized tile fetching and multi-tier caching for:
 *   - Drought Intensity (DI_A)
 *   - Vegetation Condition Index (VCI_M)
 *   - Agricultural Stress Index (ASI_A)
 *
 * Multi-tier caching architecture:
 *   1. Hot in-memory LRU ImageBitmap cache (~0ms instant render on pan/revisit)
 *   2. In-flight request deduplication (prevents redundant tile requests)
 *   3. Browser CacheStorage API (persists tiles across layer toggles and page reloads)
 */

const MEMORY_TILE_CACHE = new Map<string, ImageBitmap>();
const MAX_MEMORY_TILES = 1000;
const IN_FLIGHT_FETCHES = new Map<string, Promise<ImageBitmap | null>>();

const CACHE_NAME = 'worldmonitor-agri-tiles-v1';

export function getAsisTileCacheKey(
  service: string,
  bbox: { west: number; south: number; east: number; north: number },
): string {
  const w = bbox.west.toFixed(4);
  const s = bbox.south.toFixed(4);
  const e = bbox.east.toFixed(4);
  const n = bbox.north.toFixed(4);
  return `${service}:${w},${s},${e},${n}`;
}

async function getFromBrowserCache(url: string): Promise<Response | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return match || null;
  } catch {
    return null;
  }
}

async function saveToBrowserCache(url: string, response: Response): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, response);
  } catch {
    // Ignore cache storage errors (e.g. quota limits or non-secure contexts)
  }
}

function putInMemoryCache(key: string, bitmap: ImageBitmap): void {
  if (MEMORY_TILE_CACHE.size >= MAX_MEMORY_TILES) {
    const oldestKey = MEMORY_TILE_CACHE.keys().next().value;
    if (oldestKey) {
      const oldBitmap = MEMORY_TILE_CACHE.get(oldestKey);
      oldBitmap?.close?.();
      MEMORY_TILE_CACHE.delete(oldestKey);
    }
  }
  MEMORY_TILE_CACHE.set(key, bitmap);
}

export async function fetchAsisTile(
  service: string,
  bbox: { west: number; south: number; east: number; north: number },
  signal?: AbortSignal,
): Promise<ImageBitmap | null> {
  const cacheKey = getAsisTileCacheKey(service, bbox);

  // 1. In-memory hot cache hit
  const memHit = MEMORY_TILE_CACHE.get(cacheKey);
  if (memHit) return memHit;

  // 2. In-flight request deduplication
  const inFlight = IN_FLIGHT_FETCHES.get(cacheKey);
  if (inFlight) return inFlight;

  const fetchPromise = (async () => {
    const bboxStr = `${bbox.west.toFixed(4)},${bbox.south.toFixed(4)},${bbox.east.toFixed(4)},${bbox.north.toFixed(4)}`;
    const url = `/api/asis?service=${service}&bbox=${bboxStr}`;

    try {
      // 3. Try Browser CacheStorage
      const cachedResp = await getFromBrowserCache(url);
      if (cachedResp && cachedResp.ok) {
        const blob = await cachedResp.blob();
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(blob);
          putInMemoryCache(cacheKey, bitmap);
          return bitmap;
        }
      }

      // 4. Network fetch with proxy
      const resp = await fetch(url, { signal });
      if (!resp.ok) return null;

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('image')) return null;

      // Save cloned response in CacheStorage before reading body
      try {
        const clone = resp.clone();
        saveToBrowserCache(url, clone).catch(() => {});
      } catch {}

      const blob = await resp.blob();
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        putInMemoryCache(cacheKey, bitmap);
        return bitmap;
      }
      return null;
    } catch {
      return null;
    } finally {
      IN_FLIGHT_FETCHES.delete(cacheKey);
    }
  })();

  IN_FLIGHT_FETCHES.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export function clearAsisTileCache(): void {
  for (const bitmap of MEMORY_TILE_CACHE.values()) {
    bitmap?.close?.();
  }
  MEMORY_TILE_CACHE.clear();
  IN_FLIGHT_FETCHES.clear();
  if (typeof caches !== 'undefined') {
    caches.delete(CACHE_NAME).catch(() => {});
  }
}
