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
  // Specific strategic / high-priority regions
  'Ukraine': '22,44,40,53',
  'Russia': '20,50,180,82',
  'Iran': '44,25,63,40',
  'Israel/Gaza': '34,29,36,34',
  'Syria': '35,32,42,37',
  'Taiwan': '119,21,123,26',
  'North Korea': '124,37,131,43',
  'Saudi Arabia': '34,16,56,32',
  'Turkey': '26,36,45,42',

  // North America
  'USA': '-125,24,-66,49',
  'Canada': '-141,41,-52,83',
  'Mexico & Central America': '-118,7,-77,33',
  'Caribbean': '-85,10,-59,27',

  // South America
  'South America (Amazon)': '-75,-16,-44,6',
  'South America (Cerrado/Brazil)': '-58,-25,-35,-5',
  'South America (Southern Cone)': '-76,-56,-53,-22',
  'South America (Andes/North)': '-82,-5,-60,13',

  // Europe
  'Western Europe': '-12,35,22,60',
  'Eastern Europe': '20,44,40,70',
  'Northern Europe': '4,55,32,72',
  'Southern Europe': '-10,36,28,45',

  // Africa
  'North Africa': '-18,15,36,37',
  'West Africa': '-18,4,15,20',
  'Central Africa': '8,-5,32,15',
  'East Africa': '28,-12,52,18',
  'Southern Africa': '11,-35,41,-10',

  // Asia
  'Middle East': '34,12,60,42',
  'Central Asia': '46,35,88,55',
  'South Asia': '60,5,98,38',
  'East Asia': '73,18,145,54',
  'Southeast Asia': '92,-11,141,24',
  'Siberia': '60,50,180,75',

  // Australia & Oceania
  'Australia': '112,-44,154,-10',
  'New Zealand': '166,-48,179,-34',
  'Oceania & Pacific': '130,-25,-130,25',

  // Antarctica
  'Antarctica': '-180,-90,180,-60',
};

/**
 * Fallback continent classifier for any coordinates outside defined regional bounding boxes.
 */
function classifyContinent(lat: number, lon: number): string {
  if (lat < -60) return 'Antarctica';
  if (lat >= -56 && lat <= 13 && lon >= -95 && lon <= -30) return 'South America';
  if (lat >= 7 && lat <= 85 && lon >= -170 && lon <= -30) return 'North America';
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 55) return 'Africa';
  if (lat >= 35 && lat <= 75 && lon >= -25 && lon <= 45) return 'Europe';
  if (lat >= -50 && lat <= 0 && lon >= 110 && lon <= 180) return 'Australia & Oceania';
  if (lat >= -10 && lat <= 80 && lon >= 45 && lon <= 180) return 'Asia';
  return 'Global';
}

/** Map VIIRS and MODIS confidence values to proto enum values. */
function mapConfidence(c: string): FireConfidence {
  const s = (c || '').trim().toLowerCase();
  if (s === 'h' || s === 'high' || s.startsWith('high')) {
    return 'FIRE_CONFIDENCE_HIGH';
  }
  if (s === 'n' || s === 'nominal' || s.startsWith('nom')) {
    return 'FIRE_CONFIDENCE_NOMINAL';
  }
  if (s === 'l' || s === 'low' || s.startsWith('low')) {
    return 'FIRE_CONFIDENCE_LOW';
  }

  // Handle numeric percentages (e.g. from MODIS 0-100%)
  const num = parseFloat(s);
  if (!Number.isNaN(num)) {
    if (num >= 80) return 'FIRE_CONFIDENCE_HIGH';
    if (num >= 40) return 'FIRE_CONFIDENCE_NOMINAL';
    if (num > 0) return 'FIRE_CONFIDENCE_LOW';
  }

  return 'FIRE_CONFIDENCE_UNSPECIFIED';
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
    
    let matchedRegion = '';
    for (const [rName, bbox] of Object.entries(regions)) {
      if (lat >= bbox[1]! && lat <= bbox[3]! && lon >= bbox[0]! && lon <= bbox[2]!) {
        matchedRegion = rName;
        break;
      }
    }
    
    const regionName = matchedRegion || classifyContinent(lat, lon);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ? vals[idx].trim() : '';
    });
    results.push({ row, regionName });
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
