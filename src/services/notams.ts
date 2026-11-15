import { createCircuitBreaker } from '@/utils';
import { toRuntimeUrl } from './runtime';

export type NotamType = 'tfr' | 'restricted' | 'danger' | 'prohibited' | 'moa' | 'closure';

export interface FaaNotam {
  id: string;
  notamNumber: string;
  type: NotamType;
  typeLabel: string;
  name: string;
  lat: number;
  lon: number;
  radiusNm: number;
  lowerAlt: string;
  upperAlt: string;
  effectiveStart: string;
  effectiveEnd: string;
  locationName: string;
  reason: string;
  source: string;
}

export interface NotamColorConfig {
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
  hex: string;
}

const NOTAM_COLOR_MAP: Record<NotamType, NotamColorConfig> = {
  // Temporary Flight Restrictions (VIP, airshows, disasters, launches) -> Red
  tfr: {
    fill: [239, 68, 68, 90],
    stroke: [239, 68, 68, 230],
    hex: '#ef4444',
  },
  // Prohibited Airspace (White House, Camp David) -> Crimson
  prohibited: {
    fill: [220, 38, 38, 90],
    stroke: [220, 38, 38, 230],
    hex: '#dc2626',
  },
  // Restricted Areas (Live-fire ranges, test centers) -> Orange
  restricted: {
    fill: [249, 115, 22, 90],
    stroke: [249, 115, 22, 230],
    hex: '#f97316',
  },
  // Danger Areas (Offshore missile/tactical zones) -> Yellow / Gold
  danger: {
    fill: [234, 179, 8, 90],
    stroke: [234, 179, 8, 230],
    hex: '#eab308',
  },
  // Military Operating Areas (Air combat corridors) -> Blue / Indigo
  moa: {
    fill: [59, 130, 246, 90],
    stroke: [59, 130, 246, 230],
    hex: '#3b82f6',
  },
  // Airspace Reservations & Closures (ALTRV, Space re-entry corridors) -> Purple
  closure: {
    fill: [168, 85, 247, 90],
    stroke: [168, 85, 247, 230],
    hex: '#a855f7',
  },
};

/**
 * Returns RGBA color arrays (semi-transparent fill and opaque stroke) and HEX code for NOTAM types.
 */
export function getNotamColor(type: NotamType): NotamColorConfig {
  return NOTAM_COLOR_MAP[type] || NOTAM_COLOR_MAP.tfr;
}

// 18-hour circuit breaker cache TTL (18 * 60 * 60 * 1000 ms = 64,800,000 ms)
// Guarantees <= 41 requests per 31-day month, strictly staying under the 50 requests/month limit
export const NOTAMS_CACHE_TTL_MS = 18 * 60 * 60 * 1000;

export interface FetchNotamsOptions {
  forceRefresh?: boolean;
  locations?: string[];
  lat?: number;
  lon?: number;
  radiusNm?: number;
}

const notamsCircuitBreaker = createCircuitBreaker<FaaNotam[]>({
  name: 'Aviation NOTAMs (Notamify)',
  cacheTtlMs: NOTAMS_CACHE_TTL_MS,
  persistCache: true,
});

/**
 * Fetches FAA / international NOTAMs using Notamify API via the /api/notams endpoint with 6-hour caching.
 * Supports querying by ICAO location codes (up to 5) or coordinates proximity.
 */
export async function fetchFaaNotams(
  optionsOrForceRefresh: boolean | FetchNotamsOptions = false
): Promise<FaaNotam[]> {
  const options: FetchNotamsOptions =
    typeof optionsOrForceRefresh === 'boolean'
      ? { forceRefresh: optionsOrForceRefresh }
      : optionsOrForceRefresh;

  console.log('[NOTAMs] fetchFaaNotams called with options:', options);

  if (options.forceRefresh) {
    console.log('[NOTAMs] Force refresh requested - clearing circuit breaker cache');
    notamsCircuitBreaker.clearCache();
  }

  const cached = notamsCircuitBreaker.getCached();
  if (cached && !options.forceRefresh) {
    console.log(`[NOTAMs] Serving ${cached.length} NOTAMs directly from circuit breaker cache (TTL: 18h)`);
  }

  const fetcher = async (): Promise<FaaNotam[]> => {
    const params = new URLSearchParams();
    if (options.forceRefresh) params.set('fresh', '1');
    if (options.locations && options.locations.length > 0) {
      params.set('locations', options.locations.join(','));
    }
    if (typeof options.lat === 'number' && typeof options.lon === 'number') {
      params.set('lat', String(options.lat));
      params.set('lon', String(options.lon));
      if (options.radiusNm) params.set('radius', String(options.radiusNm));
    }

    const qs = params.toString();
    const url = toRuntimeUrl(`/api/notams${qs ? `?${qs}` : ''}`);
    console.log(`[NOTAMs] Requesting NOTAMs from endpoint: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log(`[NOTAMs] API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`[NOTAMs] Failed to fetch NOTAMs from Notamify API: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch NOTAMs from Notamify API (${response.status})`);
    }

    const data = await response.json();
    const count = Array.isArray(data) ? data.length : 0;
    console.log(`[NOTAMs] Successfully parsed ${count} NOTAM airspace restriction features`);
    return Array.isArray(data) ? (data as FaaNotam[]) : [];
  };

  const notams = await notamsCircuitBreaker.execute(fetcher, []);
  console.log(`[NOTAMs] Returning ${notams.length} NOTAMs (circuit breaker status: ${notamsCircuitBreaker.getStatus()})`);
  return notams;
}
