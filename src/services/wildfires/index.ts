import {
  WildfireServiceClient,
  type FireDetection,
  type FireConfidence,
  type ListFireDetectionsResponse,
} from '@/generated/client/worldmonitor/wildfire/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';

export type { FireDetection };

// -- Types --

export interface FireRegionStats {
  region: string;
  fires: FireDetection[];
  fireCount: number;
  totalFrp: number;
  highIntensityCount: number;
}

export interface FetchResult {
  regions: Record<string, FireDetection[]>;
  totalCount: number;
  skipped?: boolean;
  reason?: string;
}

export interface MapFire {
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  confidence: number;
  region: string;
  acq_date: string;
  daynight: string;
  detectedAt?: number;
}

import { BASELINE_FIRES } from './baseline';

// -- Client & Cache Constants --

const PERSISTENT_CACHE_KEY = 'wildfires:10d:v1';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const client = new WildfireServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const breaker = createCircuitBreaker<ListFireDetectionsResponse>({ name: 'Wildfires:10d', cacheTtlMs: 15 * 60 * 1000, persistCache: true });

let memoryDetections: FireDetection[] | null = null;

// Pre-load from persistent cache when available in browser/desktop environment
if (typeof window !== 'undefined') {
  getPersistentCache<FireDetection[]>(PERSISTENT_CACHE_KEY).then((cached) => {
    if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
      if (!memoryDetections) {
        memoryDetections = cached.data;
      }
    }
  }).catch(() => {});
}

// -- Public API --

export function getInstantFires(): FetchResult {
  const cached = breaker.getCached();
  const detections = (memoryDetections && memoryDetections.length > 0)
    ? memoryDetections
    : (cached && cached.fireDetections && cached.fireDetections.length > 0)
      ? cached.fireDetections
      : BASELINE_FIRES;

  const regions: Record<string, FireDetection[]> = {};
  for (const d of detections) {
    const r = d.region || 'Unknown';
    (regions[r] ??= []).push(d);
  }

  return { regions, totalCount: detections.length };
}

export async function fetchAllFires(_days?: number): Promise<FetchResult> {
  // If memory cache is not loaded yet, attempt persistent cache read
  if (!memoryDetections) {
    try {
      const persisted = await getPersistentCache<FireDetection[]>(PERSISTENT_CACHE_KEY);
      if (persisted?.data && Array.isArray(persisted.data) && persisted.data.length > 0) {
        memoryDetections = persisted.data;
      }
    } catch { /* best effort */ }
  }

  const response = await breaker.execute(async () => {
    return client.listFireDetections({});
  }, { fireDetections: memoryDetections || BASELINE_FIRES });

  const freshDetections = response?.fireDetections || [];

  // Merge fresh detections with accumulated 10-day dataset
  const cutoff = Date.now() - TEN_DAYS_MS;
  const fireMap = new Map<string, FireDetection>();

  if (memoryDetections) {
    for (const f of memoryDetections) {
      if ((f.detectedAt || 0) >= cutoff) {
        fireMap.set(f.id, f);
      }
    }
  }

  for (const f of freshDetections) {
    if ((f.detectedAt || 0) >= cutoff) {
      fireMap.set(f.id, f);
    }
  }

  const merged = Array.from(fireMap.values());
  const finalDetections = merged.length > 0
    ? merged
    : (memoryDetections && memoryDetections.length > 0 ? memoryDetections : BASELINE_FIRES);

  memoryDetections = finalDetections;

  // Persist the 10-day accumulated dataset
  if (merged.length > 0) {
    setPersistentCache(PERSISTENT_CACHE_KEY, finalDetections).catch(() => {});
  }

  const regions: Record<string, FireDetection[]> = {};
  for (const d of finalDetections) {
    const r = d.region || 'Unknown';
    (regions[r] ??= []).push(d);
  }

  return { regions, totalCount: finalDetections.length };
}

export function isHighConfidence(c: FireConfidence | string | number | undefined): boolean {
  if (c === 'FIRE_CONFIDENCE_HIGH' || c === 3 || c === '3') return true;
  if (typeof c === 'string') {
    const s = c.toLowerCase().trim();
    if (s === 'high' || s === 'h') return true;
    const n = parseFloat(s);
    if (!Number.isNaN(n) && n >= 80) return true;
  }
  if (typeof c === 'number' && c >= 80) return true;
  return false;
}

export function computeRegionStats(regions: Record<string, FireDetection[]>): FireRegionStats[] {
  const stats: FireRegionStats[] = [];

  for (const [region, fires] of Object.entries(regions)) {
    const highIntensity = fires.filter(
      f => f.brightness > 360 && isHighConfidence(f.confidence),
    );
    stats.push({
      region,
      fires,
      fireCount: fires.length,
      totalFrp: fires.reduce((sum, f) => sum + (f.frp || 0), 0),
      highIntensityCount: highIntensity.length,
    });
  }

  return stats.sort((a, b) => b.fireCount - a.fireCount);
}

export function flattenFires(regions: Record<string, FireDetection[]>): FireDetection[] {
  const all: FireDetection[] = [];
  for (const fires of Object.values(regions)) {
    for (const f of fires) {
      all.push(f);
    }
  }
  return all;
}

export function toMapFires(fires: FireDetection[]): MapFire[] {
  return fires.map(f => ({
    lat: f.location?.latitude ?? 0,
    lon: f.location?.longitude ?? 0,
    brightness: f.brightness,
    frp: f.frp,
    confidence: confidenceToNumber(f.confidence),
    region: f.region,
    acq_date: new Date(f.detectedAt).toISOString().slice(0, 10),
    daynight: f.dayNight,
    detectedAt: f.detectedAt,
  }));
}

export function confidenceToNumber(c: FireConfidence | string | number | undefined): number {
  if (c == null) return 0;
  if (typeof c === 'number') {
    if (c === 3) return 95;
    if (c === 2) return 50;
    if (c === 1) return 20;
    if (c > 0 && c <= 100) return Math.round(c);
    return 0;
  }

  const s = String(c).trim();
  switch (s) {
    case 'FIRE_CONFIDENCE_HIGH':
    case '3':
      return 95;
    case 'FIRE_CONFIDENCE_NOMINAL':
    case '2':
      return 50;
    case 'FIRE_CONFIDENCE_LOW':
    case '1':
      return 20;
  }

  const lower = s.toLowerCase();
  if (lower === 'high' || lower === 'h' || lower.startsWith('high')) return 95;
  if (lower === 'nominal' || lower === 'n' || lower.startsWith('nom')) return 50;
  if (lower === 'low' || lower === 'l' || lower.startsWith('low')) return 20;

  const num = parseFloat(s);
  if (!Number.isNaN(num) && num > 0 && num <= 100) {
    return Math.round(num);
  }

  return 0;
}
