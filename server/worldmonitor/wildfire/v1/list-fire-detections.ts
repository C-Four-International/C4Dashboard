/**
 * ListFireDetections RPC -- proxies the NASA FIRMS CSV API.
 *
 * Fetches active fire detections from all 9 monitored regions in parallel
 * and transforms the FIRMS CSV rows into proto-shaped FireDetection objects.
 *
 * Gracefully degrades to empty results when NASA_FIRMS_API_KEY is not set.
 */

declare const process: { env: Record<string, string | undefined> };

import type {
  WildfireServiceHandler,
  ServerContext,
  ListFireDetectionsRequest,
  ListFireDetectionsResponse,
  FireConfidence,
} from '../../../../src/generated/server/worldmonitor/wildfire/v1/service_server';

import { CHROME_UA } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'wildfire:fires:v2';
const REDIS_CACHE_TTL = 3600; // 1h — NASA FIRMS VIIRS NRT updates every ~3 hours

const FIRMS_SOURCE = 'VIIRS_SNPP_NRT';

/** Bounding boxes as west,south,east,north */
const MONITORED_REGIONS: Record<string, string> = {
  'Ukraine': '22,44,40,53',
  'Russia': '20,50,180,82',
  'Iran': '44,25,63,40',
  'Israel/Gaza': '34,29,36,34',
  'Syria': '35,32,42,37',
  'Taiwan': '119,21,123,26',
  'North Korea': '124,37,131,43',
  'Saudi Arabia': '34,16,56,32',
  'Turkey': '26,36,45,42',
  'USA': '-125,24,-66,49',
  'Canada': '-141,41,-52,83',
};

/** Map VIIRS confidence letters to proto enum values. */
function mapConfidence(c: string): FireConfidence {
  switch (c.toLowerCase()) {
    case 'h':
      return 'FIRE_CONFIDENCE_HIGH';
    case 'n':
      return 'FIRE_CONFIDENCE_NOMINAL';
    case 'l':
      return 'FIRE_CONFIDENCE_LOW';
    default:
      return 'FIRE_CONFIDENCE_UNSPECIFIED';
  }
}

/** Parse a FIRMS CSV response into an array of row objects keyed by header name. */
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0]!.split(',').map((h) => h.trim());
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i]!.split(',').map((v) => v.trim());
    if (vals.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx]!;
    });
    results.push(row);
  }

  return results;
}

/**
 * Parse FIRMS acq_date (YYYY-MM-DD) + acq_time (HHMM) into Unix epoch
 * milliseconds.
 */
function parseDetectedAt(acqDate: string, acqTime: string): number {
  const padded = acqTime.padStart(4, '0');
  const hours = padded.slice(0, 2);
  const minutes = padded.slice(2);
  return new Date(`${acqDate}T${hours}:${minutes}:00Z`).getTime();
}

export const listFireDetections: WildfireServiceHandler['listFireDetections'] = async (
  _ctx: ServerContext,
  _req: ListFireDetectionsRequest,
): Promise<ListFireDetectionsResponse> => {
  const apiKey =
    process.env.NASA_FIRMS_API_KEY || process.env.FIRMS_API_KEY || '';

  if (!apiKey) {
    console.warn('[FIRMS] No NASA_FIRMS_API_KEY configured. Returning empty results.');
    return { fireDetections: [], pagination: undefined };
  }

  console.log('[FIRMS] listFireDetections called. Checking cache for key:', REDIS_CACHE_KEY);

  const result = await cachedFetchJson<ListFireDetectionsResponse>(
    REDIS_CACHE_KEY,
    REDIS_CACHE_TTL,
    async () => {
      const entries = Object.entries(MONITORED_REGIONS);
      const fireDetections: ListFireDetectionsResponse['fireDetections'] = [];
      const fetchPromises: Promise<void>[] = [];

      // We use a simple concurrency limit (e.g. 5 concurrent requests)
      const CONCURRENCY_LIMIT = 5;
      let activeRequests = 0;
      const queue: (() => Promise<void>)[] = [];

      const processQueue = async () => {
        if (queue.length === 0) return;
        const task = queue.shift()!;
        activeRequests++;
        try {
          await task();
        } finally {
          activeRequests--;
          if (queue.length > 0) {
            await processQueue();
          }
        }
      };

      const enqueue = (task: () => Promise<void>) => {
        queue.push(task);
        if (activeRequests < CONCURRENCY_LIMIT) {
          processQueue();
        }
      };

      // FIRMS API limits area to 10x10 degrees. We must split large bboxes.
      for (const [regionName, bbox] of entries) {
        const [w, s, e, n] = bbox.split(',').map(Number);
        
        for (let lat = s; lat < n; lat += 10) {
          for (let lon = w; lon < e; lon += 10) {
            const chunkW = lon;
            const chunkS = lat;
            const chunkE = Math.min(lon + 10, e);
            const chunkN = Math.min(lat + 10, n);
            const chunkBbox = `${chunkW},${chunkS},${chunkE},${chunkN}`;
            
            const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${FIRMS_SOURCE}/${chunkBbox}/1`;
            
            const fetchTask = async () => {
              try {
                const res = await fetch(url, {
                  headers: { Accept: 'text/csv', 'User-Agent': CHROME_UA },
                  signal: AbortSignal.timeout(15_000),
                });
                if (!res.ok) {
                  const errText = await res.text().catch(() => '');
                  throw new Error(`FIRMS ${res.status} for ${regionName} (${chunkBbox}): ${errText}`);
                }
                const csv = await res.text();
                const rows = parseCSV(csv);
                // Log success to help debug
                console.log(`[FIRMS] Fetched ${rows.length} rows for ${regionName} (${chunkBbox})`);
                for (const row of rows) {
                  const detectedAt = parseDetectedAt(row.acq_date || '', row.acq_time || '');
                  fireDetections.push({
                    id: `${row.latitude ?? ''}-${row.longitude ?? ''}-${row.acq_date ?? ''}-${row.acq_time ?? ''}`,
                    location: {
                      latitude: parseFloat(row.latitude ?? '0') || 0,
                      longitude: parseFloat(row.longitude ?? '0') || 0,
                    },
                    brightness: parseFloat(row.bright_ti4 ?? '0') || 0,
                    frp: parseFloat(row.frp ?? '0') || 0,
                    confidence: mapConfidence(row.confidence || ''),
                    satellite: row.satellite || '',
                    detectedAt,
                    region: regionName,
                    dayNight: row.daynight || '',
                  });
                }
              } catch (err: any) {
                console.warn(`[FIRMS] Failed to fetch chunk for ${regionName}: ${err.message}`);
              }
            };
            
            const promise = new Promise<void>((resolve) => {
              enqueue(async () => {
                await fetchTask();
                resolve();
              });
            });
            fetchPromises.push(promise);
          }
        }
      }

      await Promise.allSettled(fetchPromises);
      console.log(`[FIRMS] Completed fetching all chunks. Total fires found: ${fireDetections.length}`);
      return fireDetections.length > 0 ? { fireDetections, pagination: undefined } : null;
    },
  );
  return result || { fireDetections: [], pagination: undefined };
};
