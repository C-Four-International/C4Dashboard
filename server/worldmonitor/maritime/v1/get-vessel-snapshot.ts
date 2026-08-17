declare const process: { env: Record<string, string | undefined> };

import type {
  ServerContext,
  GetVesselSnapshotRequest,
  GetVesselSnapshotResponse,
  VesselSnapshot,
  AisDensityZone,
  AisDisruption,
  AisDisruptionType,
  AisDisruptionSeverity,
} from '../../../../src/generated/server/worldmonitor/maritime/v1/service_server';

import { CHROME_UA } from '../../../_shared/constants';

// ========================================================================
// Helpers
// ========================================================================

function getRelayBaseUrl(): string | null {
  const relayUrl = process.env.WS_RELAY_URL;
  if (!relayUrl) return null;
  return relayUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://')
    .replace(/\/$/, '');
}

function getRelayRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': CHROME_UA,
  };
  const relaySecret = process.env.RELAY_SHARED_SECRET;
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

const DISRUPTION_TYPE_MAP: Record<string, AisDisruptionType> = {
  gap_spike: 'AIS_DISRUPTION_TYPE_GAP_SPIKE',
  chokepoint_congestion: 'AIS_DISRUPTION_TYPE_CHOKEPOINT_CONGESTION',
};

const SEVERITY_MAP: Record<string, AisDisruptionSeverity> = {
  low: 'AIS_DISRUPTION_SEVERITY_LOW',
  elevated: 'AIS_DISRUPTION_SEVERITY_ELEVATED',
  high: 'AIS_DISRUPTION_SEVERITY_HIGH',
};

// In-memory cache (matches old /api/ais-snapshot behavior)
const SNAPSHOT_CACHE_TTL_MS = 10_000; // 10 seconds -- matches client poll interval
let cachedSnapshot: VesselSnapshot | undefined;
let cacheTimestamp = 0;
let inFlightRequest: Promise<VesselSnapshot | undefined> | null = null;

interface VesselPosition {
  id?: string;
  lat?: number;
  lon?: number;
}

function calculateDensityZones(vessels: VesselPosition[]): AisDensityZone[] {
  const gridSize = 5; // 5 degree cells
  const grid = new Map<string, { lat: number, lon: number, count: number }>();

  for (const v of vessels) {
    if (v.lat == null || v.lon == null || Number.isNaN(v.lat) || Number.isNaN(v.lon)) continue;
    const latCell = Math.floor(v.lat / gridSize) * gridSize + (gridSize / 2);
    const lonCell = Math.floor(v.lon / gridSize) * gridSize + (gridSize / 2);
    const key = `${latCell},${lonCell}`;

    if (!grid.has(key)) {
      grid.set(key, { lat: latCell, lon: lonCell, count: 0 });
    }
    grid.get(key)!.count += 1;
  }

  let maxCount = 0;
  for (const cell of grid.values()) {
    if (cell.count > maxCount) maxCount = cell.count;
  }

  const zones: AisDensityZone[] = [];
  for (const [key, cell] of grid.entries()) {
    zones.push({
      id: `zone-${key}`,
      name: `Region ${cell.lat}°, ${cell.lon}°`,
      location: {
        latitude: cell.lat,
        longitude: cell.lon,
      },
      intensity: maxCount > 0 ? cell.count / maxCount : 0,
      deltaPct: 0,
      shipsPerDay: cell.count,
      note: 'Generated from vessel positions',
    });
  }

  return zones.sort((a, b) => b.shipsPerDay - a.shipsPerDay).slice(0, 100);
}

async function fetchVesselSnapshotFromVesselApi(): Promise<VesselSnapshot | undefined> {
  const apiKey = process.env.VESSELAPI_KEY;
  if (!apiKey) {
    console.warn('[VesselAPI Fallback] VESSELAPI_KEY is missing from environment.');
    return undefined;
  }

  try {
    const response = await fetch('https://api.vesselapi.com/v1/search/vessels?pagination.limit=1000&filter.vesselType=Cargo', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[VesselAPI Fallback] API responded with status ${response.status}:`, errText);
      return undefined;
    }

    const data = await response.json();
    const vesselsArray = Array.isArray(data) ? data : (data.vessels || data.data || []);
    
    if (vesselsArray.length === 0) {
      console.warn('[VesselAPI Fallback] API returned successfully but no vessels were found in the response.');
    }

    const vessels: VesselPosition[] = vesselsArray.map((v: any) => ({
      id: String(v.id || v.mmsi || v.imo || ''),
      lat: Number(v.latitude ?? v.lat),
      lon: Number(v.longitude ?? v.lon),
    }));

    const densityZones = calculateDensityZones(vessels);

    return {
      snapshotAt: Date.now(),
      densityZones,
      disruptions: [], 
    };
  } catch (error) {
    console.error('[VesselAPI Fallback] Request failed:', error);
    return undefined;
  }
}

async function fetchVesselSnapshot(): Promise<VesselSnapshot | undefined> {
  // Return cached if fresh
  const now = Date.now();
  if (cachedSnapshot && (now - cacheTimestamp) < SNAPSHOT_CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  // In-flight dedup: if a request is already running, await it
  if (inFlightRequest) {
    return inFlightRequest;
  }

  inFlightRequest = (async () => {
    let result = await fetchVesselSnapshotFromRelay();
    if (!result || (result.densityZones.length === 0 && result.disruptions.length === 0)) {
      const fallbackResult = await fetchVesselSnapshotFromVesselApi();
      if (fallbackResult) {
        result = fallbackResult;
      }
    }
    return result;
  })();
  try {
    const result = await inFlightRequest;
    if (result) {
      cachedSnapshot = result;
      cacheTimestamp = Date.now();
    }
    return result ?? cachedSnapshot; // serve stale on relay failure
  } finally {
    inFlightRequest = null;
  }
}

async function fetchVesselSnapshotFromRelay(): Promise<VesselSnapshot | undefined> {
  try {
    const relayBaseUrl = getRelayBaseUrl();
    if (!relayBaseUrl) return undefined;

    const response = await fetch(
      `${relayBaseUrl}/ais/snapshot?candidates=false`,
      {
        headers: getRelayRequestHeaders(),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) return undefined;

    const data = await response.json();
    if (!data || !Array.isArray(data.disruptions) || !Array.isArray(data.density)) {
      return undefined;
    }

    const densityZones: AisDensityZone[] = data.density.map((z: any): AisDensityZone => ({
      id: String(z.id || ''),
      name: String(z.name || ''),
      location: {
        latitude: Number(z.lat) || 0,
        longitude: Number(z.lon) || 0,
      },
      intensity: Number(z.intensity) || 0,
      deltaPct: Number(z.deltaPct) || 0,
      shipsPerDay: Number(z.shipsPerDay) || 0,
      note: String(z.note || ''),
    }));

    const disruptions: AisDisruption[] = data.disruptions.map((d: any): AisDisruption => ({
      id: String(d.id || ''),
      name: String(d.name || ''),
      type: DISRUPTION_TYPE_MAP[d.type] || 'AIS_DISRUPTION_TYPE_UNSPECIFIED',
      location: {
        latitude: Number(d.lat) || 0,
        longitude: Number(d.lon) || 0,
      },
      severity: SEVERITY_MAP[d.severity] || 'AIS_DISRUPTION_SEVERITY_UNSPECIFIED',
      changePct: Number(d.changePct) || 0,
      windowHours: Number(d.windowHours) || 0,
      darkShips: Number(d.darkShips) || 0,
      vesselCount: Number(d.vesselCount) || 0,
      region: String(d.region || ''),
      description: String(d.description || ''),
    }));

    return {
      snapshotAt: Date.now(),
      densityZones,
      disruptions,
    };
  } catch {
    return undefined;
  }
}

// ========================================================================
// RPC handler
// ========================================================================

export async function getVesselSnapshot(
  _ctx: ServerContext,
  _req: GetVesselSnapshotRequest,
): Promise<GetVesselSnapshotResponse> {
  try {
    const snapshot = await fetchVesselSnapshot();
    return { snapshot };
  } catch {
    return { snapshot: undefined };
  }
}
