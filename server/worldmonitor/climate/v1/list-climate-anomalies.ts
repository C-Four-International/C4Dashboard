// @ts-nocheck
/**
 * ListClimateAnomalies RPC -- fetches monitored global zones from the Open-Meteo
 * Archive API, computes 30-day baseline comparisons (last 7 days vs preceding
 * baseline), classifies severity and type, and returns proto-shaped
 * ClimateAnomaly objects.
 *
 * Zones with fewer than 14 valid data points are skipped.
 */

import type {
  ClimateServiceHandler,
  ServerContext,
  ListClimateAnomaliesRequest,
  ListClimateAnomaliesResponse,
  AnomalySeverity,
  AnomalyType,
  ClimateAnomaly,
} from '../../../../src/generated/server/worldmonitor/climate/v1/service_server';

import { CHROME_UA } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'climate:anomalies:v2';
const REDIS_CACHE_TTL = 10800; // 3h — Open-Meteo Archive uses ERA5 reanalysis with 2-7 day lag

/** The monitored global climate zones across all major continents and climate regions. */
const ZONES: { name: string; lat: number; lon: number }[] = [
  // North America
  { name: 'US Pacific NW', lat: 47.6, lon: -122.3 },
  { name: 'California', lat: 36.8, lon: -119.4 },
  { name: 'US Southwest', lat: 33.4, lon: -112.0 },
  { name: 'US Great Plains', lat: 39.0, lon: -98.0 },
  { name: 'US Midwest', lat: 41.8, lon: -87.6 },
  { name: 'US Northeast', lat: 42.3, lon: -71.1 },
  { name: 'US Southeast', lat: 30.5, lon: -84.3 },
  { name: 'Canadian Prairies', lat: 51.0, lon: -114.0 },
  { name: 'Eastern Canada', lat: 45.5, lon: -73.6 },
  { name: 'Northern Canada', lat: 62.4, lon: -114.4 },
  { name: 'Alaska', lat: 64.2, lon: -149.5 },
  { name: 'Northern Mexico', lat: 28.6, lon: -106.1 },
  { name: 'Central Mexico', lat: 19.4, lon: -99.1 },

  // Central America & Caribbean
  { name: 'Central America', lat: 14.6, lon: -90.5 },
  { name: 'Caribbean', lat: 19.0, lon: -72.0 },
  { name: 'Panama & Darien', lat: 8.5, lon: -80.0 },

  // South America
  { name: 'Amazon', lat: -3.4, lon: -60.0 },
  { name: 'Brazilian Cerrado', lat: -15.8, lon: -47.9 },
  { name: 'Gran Chaco', lat: -22.5, lon: -60.5 },
  { name: 'Pampas', lat: -34.6, lon: -58.4 },
  { name: 'Northern Andes', lat: 4.7, lon: -74.1 },
  { name: 'Central Andes', lat: -12.0, lon: -77.0 },
  { name: 'Patagonia', lat: -45.0, lon: -69.0 },
  { name: 'Chile Central Valley', lat: -33.4, lon: -70.7 },
  { name: 'Northeast Brazil', lat: -8.0, lon: -37.0 },

  // Europe
  { name: 'British Isles', lat: 53.5, lon: -2.2 },
  { name: 'Western Europe', lat: 48.8, lon: 2.3 },
  { name: 'Central Europe', lat: 50.1, lon: 8.7 },
  { name: 'Iberian Peninsula', lat: 40.4, lon: -3.7 },
  { name: 'Mediterranean', lat: 38.0, lon: 20.0 },
  { name: 'Scandinavia', lat: 60.0, lon: 15.0 },
  { name: 'Fennoscandia / Arctic', lat: 67.0, lon: 20.0 },
  { name: 'Eastern Europe', lat: 52.2, lon: 21.0 },
  { name: 'Ukraine', lat: 48.4, lon: 31.2 },
  { name: 'Balkans', lat: 43.8, lon: 18.4 },

  // Middle East & North Africa
  { name: 'Maghreb', lat: 34.0, lon: 3.0 },
  { name: 'Sahara', lat: 23.0, lon: 12.0 },
  { name: 'Egypt & Nile', lat: 27.0, lon: 31.0 },
  { name: 'Levant', lat: 32.0, lon: 35.5 },
  { name: 'Arabian Peninsula', lat: 24.7, lon: 46.7 },
  { name: 'Middle East', lat: 33.0, lon: 44.0 },
  { name: 'Iranian Plateau', lat: 32.6, lon: 51.6 },
  { name: 'Caucasus', lat: 41.7, lon: 44.8 },

  // Sub-Saharan Africa
  { name: 'Sahel', lat: 14.0, lon: 0.0 },
  { name: 'West African Coast', lat: 6.5, lon: 3.3 },
  { name: 'Central Africa', lat: 4.0, lon: 22.0 },
  { name: 'Horn of Africa', lat: 8.0, lon: 42.0 },
  { name: 'East African Rift', lat: -1.3, lon: 36.8 },
  { name: 'Southern Africa', lat: -25.0, lon: 28.0 },
  { name: 'Kalahari', lat: -22.0, lon: 21.0 },
  { name: 'Madagascar', lat: -18.9, lon: 47.5 },

  // Central & North Asia
  { name: 'Central Asia', lat: 42.0, lon: 65.0 },
  { name: 'Kazakh Steppe', lat: 48.0, lon: 68.0 },
  { name: 'Siberian Plains', lat: 56.5, lon: 85.0 },
  { name: 'Eastern Siberia', lat: 62.0, lon: 129.7 },
  { name: 'Russian Far East', lat: 50.0, lon: 136.0 },
  { name: 'Mongolian Plateau', lat: 47.9, lon: 106.9 },

  // South Asia
  { name: 'Indus Basin', lat: 30.0, lon: 70.0 },
  { name: 'North India', lat: 28.6, lon: 77.2 },
  { name: 'South Asia', lat: 25.0, lon: 78.0 },
  { name: 'South India', lat: 13.0, lon: 80.2 },
  { name: 'Bengal Basin', lat: 23.8, lon: 90.4 },
  { name: 'Tibetan Plateau', lat: 31.0, lon: 88.0 },

  // East & Southeast Asia
  { name: 'North China Plain', lat: 36.0, lon: 116.0 },
  { name: 'Yangtze Basin', lat: 30.5, lon: 114.3 },
  { name: 'South China', lat: 23.1, lon: 113.2 },
  { name: 'Taiwan Strait', lat: 24.0, lon: 120.0 },
  { name: 'Korean Peninsula', lat: 37.5, lon: 127.0 },
  { name: 'Japanese Archipelago', lat: 35.7, lon: 139.7 },
  { name: 'Indochina', lat: 15.0, lon: 101.0 },
  { name: 'Myanmar', lat: 19.8, lon: 96.7 },
  { name: 'Maritime SE Asia', lat: -2.0, lon: 115.0 },
  { name: 'Philippines', lat: 14.6, lon: 121.0 },

  // Oceania
  { name: 'Northern Australia', lat: -15.0, lon: 132.0 },
  { name: 'Australia', lat: -25.0, lon: 134.0 },
  { name: 'Southeast Australia', lat: -35.0, lon: 145.0 },
  { name: 'Western Australia', lat: -31.9, lon: 115.9 },
  { name: 'New Zealand', lat: -41.0, lon: 174.0 },

  // Polar / Subpolar
  { name: 'Greenland', lat: 64.2, lon: -51.7 },
  { name: 'Svalbard', lat: 78.2, lon: 15.6 },
];

/**
 * Classify anomaly severity based on temperature and precipitation deltas.
 * Calibrated for 7-day mean departure from monthly baseline.
 */
function classifySeverity(
  tempDelta: number,
  precipDelta: number,
): AnomalySeverity {
  const absTemp = Math.abs(tempDelta);
  const absPrecip = Math.abs(precipDelta);
  if (absTemp >= 4.0 || absPrecip >= 50) return 'ANOMALY_SEVERITY_EXTREME';
  if (absTemp >= 1.5 || absPrecip >= 15) return 'ANOMALY_SEVERITY_MODERATE';
  return 'ANOMALY_SEVERITY_NORMAL';
}

/**
 * Classify anomaly type based on temperature and precipitation deltas.
 */
function classifyType(tempDelta: number, precipDelta: number): AnomalyType {
  const absTemp = Math.abs(tempDelta);
  const absPrecip = Math.abs(precipDelta);
  if (absTemp >= absPrecip / 20) {
    if (tempDelta > 0 && precipDelta < -15) return 'ANOMALY_TYPE_MIXED';
    if (tempDelta > 0) return 'ANOMALY_TYPE_WARM';
    if (tempDelta < 0) return 'ANOMALY_TYPE_COLD';
  }
  if (precipDelta > 20) return 'ANOMALY_TYPE_WET';
  if (precipDelta < -20) return 'ANOMALY_TYPE_DRY';
  if (tempDelta > 0) return 'ANOMALY_TYPE_WARM';
  return 'ANOMALY_TYPE_COLD';
}

/** Compute arithmetic mean of a number array. */
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/**
 * Parse an Open-Meteo daily response item for a single zone.
 */
function parseZoneDailyData(
  zone: { name: string; lat: number; lon: number },
  dataItem: any,
  startDate: string,
  endDate: string,
): ClimateAnomaly | null {
  if (!dataItem) return null;

  // Filter nulls: only keep indices where both temp and precip are non-null
  const rawTemps: (number | null)[] = dataItem.daily?.temperature_2m_mean ?? [];
  const rawPrecips: (number | null)[] = dataItem.daily?.precipitation_sum ?? [];
  const temps: number[] = [];
  const precips: number[] = [];
  for (let i = 0; i < rawTemps.length; i++) {
    if (rawTemps[i] != null && rawPrecips[i] != null) {
      temps.push(rawTemps[i]!);
      precips.push(rawPrecips[i]!);
    }
  }

  // Minimum data check: need at least 14 valid paired data points
  if (temps.length < 14) return null;

  // Split into recent (last 7) and baseline (everything before)
  const recentTemps = temps.slice(-7);
  const baselineTemps = temps.slice(0, -7);
  const recentPrecips = precips.slice(-7);
  const baselinePrecips = precips.slice(0, -7);

  // Compute deltas rounded to 1 decimal place
  const tempDelta = Math.round((avg(recentTemps) - avg(baselineTemps)) * 10) / 10;
  const precipDelta =
    Math.round((avg(recentPrecips) - avg(baselinePrecips)) * 10) / 10;

  return {
    zone: zone.name,
    location: { latitude: zone.lat, longitude: zone.lon },
    tempDelta,
    precipDelta,
    severity: classifySeverity(tempDelta, precipDelta),
    type: classifyType(tempDelta, precipDelta),
    period: `${startDate} to ${endDate}`,
  };
}

/**
 * Fetch a batch of zones from Open-Meteo in a single multi-location query.
 * Falls back to individual fetches if the batch fails.
 */
async function fetchZoneChunk(
  chunk: { name: string; lat: number; lon: number }[],
  startDate: string,
  endDate: string,
): Promise<(ClimateAnomaly | null)[]> {
  if (chunk.length === 0) return [];
  const lats = chunk.map((z) => z.lat).join(',');
  const lons = chunk.map((z) => z.lon).join(',');
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo ${response.status}`);
    }

    const data: any = await response.json();
    const items = Array.isArray(data) ? data : [data];

    return items.map((item, idx) => {
      const zone = chunk[idx];
      if (!zone) return null;
      return parseZoneDailyData(zone, item, startDate, endDate);
    });
  } catch (err: any) {
    console.warn(`[CLIMATE] Batch fetch failed (${chunk.length} zones), falling back to individual:`, err?.message ?? err);
    // Fallback: individual queries
    const fallbackResults = await Promise.allSettled(
      chunk.map(async (zone) => {
        const singleUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${zone.lat}&longitude=${zone.lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean,precipitation_sum&timezone=UTC`;
        const res = await fetch(singleUrl, {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const singleData = await res.json();
        return parseZoneDailyData(zone, singleData, startDate, endDate);
      }),
    );
    return fallbackResults.map((r) => (r.status === 'fulfilled' ? r.value : null));
  }
}

export const listClimateAnomalies: ClimateServiceHandler['listClimateAnomalies'] = async (
  _ctx: ServerContext,
  req: ListClimateAnomaliesRequest,
): Promise<ListClimateAnomaliesResponse> => {
  const result = await cachedFetchJson<ListClimateAnomaliesResponse>(
    REDIS_CACHE_KEY,
    REDIS_CACHE_TTL,
    async () => {
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const BATCH_CHUNK_SIZE = 40;
      const chunks: { name: string; lat: number; lon: number }[][] = [];
      for (let i = 0; i < ZONES.length; i += BATCH_CHUNK_SIZE) {
        chunks.push(ZONES.slice(i, i + BATCH_CHUNK_SIZE));
      }

      const chunkResults = await Promise.allSettled(
        chunks.map((chunk) => fetchZoneChunk(chunk, startDate, endDate)),
      );

      const anomalies: ClimateAnomaly[] = [];
      for (const cr of chunkResults) {
        if (cr.status === 'fulfilled') {
          for (const item of cr.value) {
            if (item != null) anomalies.push(item);
          }
        } else {
          console.error('[CLIMATE] Chunk error:', cr.reason?.message ?? cr.reason);
        }
      }

      return anomalies.length > 0 ? { anomalies, pagination: undefined } : null;
    },
  );

  let anomalies = result?.anomalies ?? [];

  // Filter by minSeverity if requested
  const minSev = (req as any)?.minSeverity || req?.min_severity;
  if (minSev && minSev !== 'ANOMALY_SEVERITY_UNSPECIFIED') {
    if (minSev === 'ANOMALY_SEVERITY_EXTREME') {
      anomalies = anomalies.filter((a) => a.severity === 'ANOMALY_SEVERITY_EXTREME');
    } else if (minSev === 'ANOMALY_SEVERITY_MODERATE') {
      anomalies = anomalies.filter(
        (a) => a.severity === 'ANOMALY_SEVERITY_EXTREME' || a.severity === 'ANOMALY_SEVERITY_MODERATE',
      );
    }
  }

  return { anomalies, pagination: undefined };
};
