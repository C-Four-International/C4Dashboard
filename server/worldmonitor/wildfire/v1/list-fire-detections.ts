// @ts-nocheck
/**
 * ListFireDetections RPC -- proxies the NASA FIRMS CSV API.
 *
 * Fetches active fire detections from NASA FIRMS global 24h CSVs, parses them,
 * and maintains a rolling 10-day deduplicated cache to support time selection filtering.
 * Operational feeds include NOAA-20 (J1 VIIRS), NOAA-21 (J2 VIIRS), and MODIS.
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
import { getCachedJson, setCachedJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'wildfire:fires:10d:v6';
const REDIS_CACHE_TTL = 3600; // 1h — FIRMS NRT updates every ~3h
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const TEN_DAYS_SECONDS = 10 * 24 * 60 * 60; // 864,000s
const REFRESH_INTERVAL_MS = REDIS_CACHE_TTL * 1000; // Refresh upstream every 1 hour

/**
 * Operational NASA FIRMS global 24h active fire CSV feeds in order of preference.
 * Primary: NOAA-20 VIIRS C2 (J1)
 * Fallback 1: NOAA-21 VIIRS C2 (J2)
 * Fallback 2: MODIS C6.1
 * Fallback 3: Suomi-NPP VIIRS C2
 */
const FIRMS_SOURCES = [
  {
    name: 'NOAA-20 VIIRS C2 (J1)',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv',
  },
  {
    name: 'NOAA-21 VIIRS C2 (J2)',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv',
  },
  {
    name: 'MODIS C6.1',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
  },
  {
    name: 'Suomi-NPP VIIRS C2',
    url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv',
  },
];

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

/**
 * Parse FIRMS acq_date (YYYY-MM-DD) + acq_time (HHMM) into Unix epoch milliseconds.
 */
function parseDetectedAt(acqDate: string, acqTime: string): number {
  if (!acqDate) return Date.now();
  const padded = acqTime.padStart(4, '0');
  const hours = padded.slice(0, 2);
  const minutes = padded.slice(2);
  const ts = new Date(`${acqDate}T${hours}:${minutes}:00Z`).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
}

function parseAndFilterCSV(csv: string, regions: Record<string, number[]>): ListFireDetectionsResponse['fireDetections'] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0]!.split(',').map((h) => h.trim());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('bright_ti4') !== -1 ? headers.indexOf('bright_ti4') : headers.indexOf('brightness');
  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const satIdx = headers.indexOf('satellite');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const daynightIdx = headers.indexOf('daynight');

  if (latIdx === -1 || lonIdx === -1) return [];

  const regionEntries = Object.entries(regions).map(([name, bbox]) => ({
    name,
    minLon: bbox[0]!,
    minLat: bbox[1]!,
    maxLon: bbox[2]!,
    maxLat: bbox[3]!,
  }));

  const fireDetections: ListFireDetectionsResponse['fireDetections'] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const vals = line.split(',');
    const latStr = vals[latIdx];
    const lonStr = vals[lonIdx];
    if (!latStr || !lonStr) continue;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const frp = frpIdx !== -1 && vals[frpIdx] ? parseFloat(vals[frpIdx]) : 0;
    const brightness = brightIdx !== -1 && vals[brightIdx] ? parseFloat(vals[brightIdx]) : 0;

    let matchedRegion = '';
    for (let r = 0; r < regionEntries.length; r++) {
      const reg = regionEntries[r]!;
      if (lat >= reg.minLat && lat <= reg.maxLat && lon >= reg.minLon && lon <= reg.maxLon) {
        matchedRegion = reg.name;
        break;
      }
    }

    const regionName = matchedRegion || classifyContinent(lat, lon);
    const acqDate = dateIdx !== -1 && vals[dateIdx] ? vals[dateIdx].trim() : '';
    const acqTime = timeIdx !== -1 && vals[timeIdx] ? vals[timeIdx].trim() : '';
    const detectedAt = parseDetectedAt(acqDate, acqTime);

    fireDetections.push({
      id: `fire-${lat}-${lon}-${detectedAt}`,
      location: { latitude: lat, longitude: lon },
      brightness: Number.isFinite(brightness) ? brightness : 0,
      frp: Number.isFinite(frp) ? frp : 0,
      confidence: mapConfidence(confIdx !== -1 && vals[confIdx] ? vals[confIdx].trim() : ''),
      satellite: satIdx !== -1 && vals[satIdx] ? vals[satIdx].trim() : 'VIIRS',
      detectedAt,
      region: regionName,
      dayNight: daynightIdx !== -1 && vals[daynightIdx] ? vals[daynightIdx].trim() : 'D',
    });
  }

  return fireDetections;
}

interface FiresCacheState {
  fireDetections: ListFireDetectionsResponse['fireDetections'];
  lastFetchedAt: number;
}

let inMemoryCache: FiresCacheState | null = null;
let inflightFetch: Promise<ListFireDetectionsResponse['fireDetections']> | null = null;

async function fetchFromSources(parsedRegions: Record<string, number[]>): Promise<ListFireDetectionsResponse['fireDetections']> {
  for (const src of FIRMS_SOURCES) {
    try {
      console.log(`[FIRMS] Attempting fetch from ${src.name}: ${src.url}`);
      const res = await fetch(src.url, {
        headers: { Accept: 'text/csv', 'User-Agent': CHROME_UA },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.warn(`[FIRMS] ${src.name} returned status ${res.status}`);
        continue;
      }

      const csv = await res.text();
      const detections = parseAndFilterCSV(csv, parsedRegions);
      if (detections.length >= 10) {
        console.log(`[FIRMS] Successfully retrieved ${detections.length} detections from ${src.name}`);
        return detections;
      }
      console.warn(`[FIRMS] ${src.name} returned too few records (${detections.length}); trying fallback`);
    } catch (err: any) {
      console.warn(`[FIRMS] Failed to fetch from ${src.name}: ${err?.message || err}`);
    }
  }

  return [];
}

async function getOrUpdate10DayFires(): Promise<ListFireDetectionsResponse['fireDetections']> {
  const now = Date.now();

  // 1. Check in-memory freshness
  if (inMemoryCache && now - inMemoryCache.lastFetchedAt < REFRESH_INTERVAL_MS && inMemoryCache.fireDetections.length > 0) {
    return inMemoryCache.fireDetections;
  }

  // 2. Coalesce concurrent requests during fetch
  if (inflightFetch) {
    return inflightFetch;
  }

  inflightFetch = (async () => {
    try {
      const parsedRegions: Record<string, number[]> = {};
      for (const [name, bbox] of Object.entries(MONITORED_REGIONS)) {
        parsedRegions[name] = bbox.split(',').map(Number);
      }

      // Check Redis for previous 10-day dataset if memory is empty
      let existingDetections: ListFireDetectionsResponse['fireDetections'] = inMemoryCache?.fireDetections || [];
      if (existingDetections.length === 0) {
        const fromRedis = (await getCachedJson(REDIS_CACHE_KEY)) as FiresCacheState | null;
        if (fromRedis?.fireDetections && Array.isArray(fromRedis.fireDetections)) {
          existingDetections = fromRedis.fireDetections;
          if (now - (fromRedis.lastFetchedAt || 0) < REFRESH_INTERVAL_MS) {
            inMemoryCache = fromRedis;
            return fromRedis.fireDetections;
          }
        }
      }

      // Fetch fresh detections from upstream FIRMS
      const freshDetections = await fetchFromSources(parsedRegions);

      // Merge fresh detections with existing cached detections
      const cutoff = now - TEN_DAYS_MS;
      const fireMap = new Map<string, any>();

      // Keep valid cached detections within the 10-day window
      for (const f of existingDetections) {
        if (f.detectedAt >= cutoff) {
          fireMap.set(f.id, f);
        }
      }

      // Add newly fetched detections (overwrites duplicates if re-detected)
      for (const f of freshDetections) {
        if (f.detectedAt >= cutoff) {
          fireMap.set(f.id, f);
        }
      }

      let allDetections = Array.from(fireMap.values());

      // If fresh fetch failed and we have no cached data, fallback to freshDetections or empty
      if (allDetections.length === 0 && freshDetections.length > 0) {
        allDetections = freshDetections;
      }

      // Sort by detectedAt desc, then FRP desc
      allDetections.sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0) || (b.frp || 0) - (a.frp || 0));

      const updatedState: FiresCacheState = {
        fireDetections: allDetections,
        lastFetchedAt: freshDetections.length > 0 ? now : (inMemoryCache?.lastFetchedAt || now),
      };

      inMemoryCache = updatedState;

      // Persist to Redis with 10-day TTL (best-effort)
      await setCachedJson(REDIS_CACHE_KEY, updatedState, TEN_DAYS_SECONDS).catch(() => {});

      return allDetections;
    } finally {
      inflightFetch = null;
    }
  })();

  return inflightFetch;
}

export const listFireDetections: WildfireServiceHandler['listFireDetections'] = async (
  _ctx: ServerContext,
  req: ListFireDetectionsRequest,
): Promise<ListFireDetectionsResponse> => {
  try {
    let fireDetections = await getOrUpdate10DayFires();

    // Support optional timeRange filtering if specified in the RPC request
    if (req?.timeRange) {
      const { start, end } = req.timeRange;
      if (start) {
        fireDetections = fireDetections.filter((f) => f.detectedAt >= start);
      }
      if (end) {
        fireDetections = fireDetections.filter((f) => f.detectedAt <= end);
      }
    }

    // Support optional bounding box filtering
    if (req?.boundingBox?.southWest && req?.boundingBox?.northEast) {
      const sw = req.boundingBox.southWest;
      const ne = req.boundingBox.northEast;
      fireDetections = fireDetections.filter(
        (f) =>
          f.location &&
          f.location.latitude >= sw.latitude &&
          f.location.latitude <= ne.latitude &&
          f.location.longitude >= sw.longitude &&
          f.location.longitude <= ne.longitude,
      );
    }

    return { fireDetections, pagination: undefined };
  } catch (err: any) {
    console.error(`[FIRMS] Error in listFireDetections handler: ${err?.message || err}`);
    return {
      fireDetections: inMemoryCache?.fireDetections || [],
      pagination: undefined,
    };
  }
};
