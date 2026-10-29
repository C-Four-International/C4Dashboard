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

// 6-hour circuit breaker cache TTL (6 * 60 * 60 * 1000 ms)
export const NOTAMS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const notamsCircuitBreaker = createCircuitBreaker<FaaNotam[]>({
  name: 'FAA NOTAMs (NASA DIP)',
  cacheTtlMs: NOTAMS_CACHE_TTL_MS,
  persistCache: true,
});

/**
 * Fetches FAA NOTAMs using NASA's DIP catalog via the /api/notams endpoint with 6-hour caching.
 */
export async function fetchFaaNotams(forceRefresh = false): Promise<FaaNotam[]> {
  if (forceRefresh) {
    notamsCircuitBreaker.clearCache();
  }

  const fetcher = async (): Promise<FaaNotam[]> => {
    const url = toRuntimeUrl(`/api/notams${forceRefresh ? '?fresh=1' : ''}`);
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch FAA NOTAMs from NASA DIP catalog (${response.status})`);
    }

    const data = await response.json();
    return Array.isArray(data) ? (data as FaaNotam[]) : [];
  };

  return notamsCircuitBreaker.execute(fetcher, []);
}
