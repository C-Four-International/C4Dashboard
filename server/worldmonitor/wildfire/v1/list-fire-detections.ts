// @ts-nocheck
/**
 * ListFireDetections RPC -- proxies the NASA FIRMS CSV API.
 *
 * Fetches active fire detections from a global 24h CSV, parses it,
 * and transforms the rows into proto-shaped FireDetection objects.
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

const REDIS_CACHE_KEY = 'wildfire:fires:v5';
const REDIS_CACHE_TTL = 3600; // 1h — NASA FIRMS VIIRS NRT updates every ~3 hours

const FIRMS_SOURCE = 'VIIRS_SNPP_NRT';

/** Bounding boxes as west,south,east,north */
const MONITORED_REGIONS: Record<string, string> = {
  // Strategic Conflict Zones & High Priority Regions
  'Ukraine': '22,44,40,53',
  'Russia & Siberia': '20,45,180,82',
  'Middle East': '32,12,65,42',
  'Taiwan': '119,21,123,26',
  'Korean Peninsula': '124,33,131,43',

  // North America
  'USA': '-170,18,-65,72',
  'Canada': '-141,41,-52,83',
  'Mexico & Central America': '-118,7,-77,33',

  // South America
  'South America': '-90,-56,-34,15',

  // Europe
  'Western & Central Europe': '-12,35,25,60',

  // Africa
  'Northern Africa': '-18,15,52,38',
  'Central & Western Africa': '-18,-15,32,15',
  'Southern & Eastern Africa': '10,-35,52,5',

  // Asia
  'South Asia': '60,5,98,37',
  'Southeast Asia': '92,-11,141,28',
  'East Asia': '98,18,146,54',
  'Central Asia': '46,35,88,55',

  // Oceania
  'Australia & Oceania': '110,-48,180,-10',
};

/** Map VIIRS confidence strings to proto enum values. */
function mapConfidence(c: string): FireConfidence {
  const lower = (c || '').toLowerCase().trim();
  if (lower === 'h' || lower === 'high') {
    return 'FIRE_CONFIDENCE_HIGH';
  }
  if (lower === 'n' || lower === 'nominal') {
    return 'FIRE_CONFIDENCE_NOMINAL';
  }
  if (lower === 'l' || lower === 'low') {
    return 'FIRE_CONFIDENCE_LOW';
  }
  return 'FIRE_CONFIDENCE_UNSPECIFIED';
}

/** Determine region name for coordinates, falling back to continental bounds */
function getRegionName(lat: number, lon: number, regions: Record<string, number[]>): string {
  for (const [rName, bbox] of Object.entries(regions)) {
    if (lat >= bbox[1]! && lat <= bbox[3]! && lon >= bbox[0]! && lon <= bbox[2]!) {
      return rName;
    }
  }

  // Geographic continent fallbacks so no global fire detection is discarded
  if (lat >= -60 && lat <= 15 && lon >= -90 && lon <= -30) return 'South America';
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 55) return 'Africa';
  if (lat >= -50 && lat <= -10 && lon >= 110 && lon <= 180) return 'Australia & Oceania';
  if (lat >= 7 && lat <= 75 && lon >= -170 && lon <= -50) return 'North America';
  if (lat >= 35 && lat <= 72 && lon >= -15 && lon <= 45) return 'Europe';
  if (lat >= -10 && lat <= 80 && lon >= 45 && lon <= 180) return 'Asia';

  return 'Global';
}

function parseAndFilterCSV(csv: string, regions: Record<string, number[]>): { row: Record<string, string>, regionName: string }[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0]!.split(',').map((h) => h.trim());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  
  if (latIdx === -1 || lonIdx === -1) return [];

  const results: { row: Record<string, string>, regionName: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    
    const vals = line.split(',');
    const latStr = vals[latIdx];
    const lonStr = vals[lonIdx];
    if (!latStr || !lonStr) continue;
    
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const matchedRegion = getRegionName(lat, lon, regions);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ? vals[idx].trim() : '';
    });
    results.push({ row, regionName: matchedRegion });
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
      const parsedRegions: Record<string, number[]> = {};
      for (const [name, bbox] of Object.entries(MONITORED_REGIONS)) {
        parsedRegions[name] = bbox.split(',').map(Number);
      }

      const fireDetections: ListFireDetectionsResponse['fireDetections'] = [];
      const globalUrl = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';
      
      console.log('[FIRMS] Fetching global 24h CSV from:', globalUrl);
      
      try {
        const res = await fetch(globalUrl, {
          headers: { Accept: 'text/csv', 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(15_000),
        });
        
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`FIRMS API returned ${res.status}: ${errText}`);
        }
        
        const csv = await res.text();
        const matches = parseAndFilterCSV(csv, parsedRegions);
        
        console.log(`[FIRMS] Successfully parsed global CSV. Found ${matches.length} fires in monitored regions.`);
        
        for (const match of matches) {
          const { row, regionName } = match;
          const detectedAt = parseDetectedAt(row.acq_date || '', row.acq_time || '');
          fireDetections.push({
            id: `fire-${row.latitude}-${row.longitude}-${detectedAt}`,
            location: {
              latitude: parseFloat(row.latitude || '0'),
              longitude: parseFloat(row.longitude || '0'),
            },
            brightness: parseFloat(row.bright_ti4 || '0'),
            frp: parseFloat(row.frp || '0'),
            confidence: mapConfidence(row.confidence || ''),
            satellite: row.satellite || '',
            detectedAt: Number.isFinite(detectedAt) ? detectedAt : 0,
            region: regionName,
            dayNight: row.daynight || 'D',
          });
        }
      } catch (err: any) {
        console.error(`[FIRMS] Failed to fetch or parse global fire data: ${err.message}`);
      }

      console.log(`[FIRMS] Returning ${fireDetections.length} total fires.`);
      return fireDetections.length > 0 ? { fireDetections, pagination: undefined } : null;
    },
  );

  return result || { fireDetections: [], pagination: undefined };
};
