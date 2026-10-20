import {
  WildfireServiceClient,
  type FireDetection,
  type FireConfidence,
  type ListFireDetectionsResponse,
} from '@/generated/client/worldmonitor/wildfire/v1/service_client';
import { createCircuitBreaker } from '@/utils';

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
}

// -- Client --

const client = new WildfireServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const breaker = createCircuitBreaker<ListFireDetectionsResponse>({ name: 'Wildfires:v5', cacheTtlMs: 5 * 60 * 1000, persistCache: true });

const emptyFallback: ListFireDetectionsResponse = { fireDetections: [] };

import { BASELINE_FIRES } from './baseline';

// -- Public API --

export function getInstantFires(): FetchResult {
  const cached = breaker.getCached();
  const detections = (cached && cached.fireDetections && cached.fireDetections.length > 0)
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
  const response = await breaker.execute(async () => {
    return client.listFireDetections({});
  }, { fireDetections: BASELINE_FIRES });
  const detections = (response && response.fireDetections && response.fireDetections.length > 0)
    ? response.fireDetections
    : BASELINE_FIRES;

  const regions: Record<string, FireDetection[]> = {};
  for (const d of detections) {
    const r = d.region || 'Unknown';
    (regions[r] ??= []).push(d);
  }

  return { regions, totalCount: detections.length };
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
