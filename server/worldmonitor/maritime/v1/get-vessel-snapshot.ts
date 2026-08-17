// @ts-nocheck
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

// In-memory cache
const SNAPSHOT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
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

  const CHOKEPOINTS = [
    // Chokepoints
    { name: 'Strait of Hormuz', lat: 26.5, lon: 56.5 },
    { name: 'Suez Canal', lat: 30.0, lon: 32.5 },
    { name: 'Strait of Malacca', lat: 2.5, lon: 101.5 },
    { name: 'Bab el-Mandeb', lat: 12.5, lon: 43.5 },
    { name: 'Panama Canal', lat: 9.0, lon: -79.5 },
    { name: 'Taiwan Strait', lat: 24.5, lon: 119.5 },
    
    // Major Ports
    { name: 'Port of Shanghai', lat: 31.3, lon: 121.5 },
    { name: 'Port of Singapore', lat: 1.25, lon: 103.8 },
    { name: 'Port of Rotterdam', lat: 51.9, lon: 4.0 },
    { name: 'Port of Los Angeles', lat: 33.7, lon: -118.2 },
    { name: 'Port of New York', lat: 40.6, lon: -74.0 },
    { name: 'Pearl River Delta', lat: 22.5, lon: 113.9 },
  ];

  let allVessels: VesselPosition[] = [];

  try {
    const fetchPromises = CHOKEPOINTS.map(async (cp) => {
      // Bounding box size: 2 lat x 2 lon (4 total span, exactly the VesselAPI limit)
      const url = `https://api.vesselapi.com/v1/location/vessels/bounding-box?filter.lonLeft=${cp.lon - 1}&filter.lonRight=${cp.lon + 1}&filter.latBottom=${cp.lat - 1}&filter.latTop=${cp.lat + 1}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[VesselAPI] Bounding box ${cp.name} failed: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      const vesselsArray = Array.isArray(data) ? data : (data.vessels || data.data || []);
      
      return vesselsArray.map((v: any) => ({
        id: String(v.id || v.mmsi || v.imo || ''),
        lat: Number(v.latitude ?? v.lat),
        lon: Number(v.longitude ?? v.lon),
      }));
    });

    const results = await Promise.allSettled(fetchPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allVessels = allVessels.concat(result.value);
      }
    }

    if (allVessels.length === 0) {
      console.warn('[VesselAPI Fallback] API returned successfully but no vessels were found in the targeted chokepoints.');
    }

    const densityZones = calculateDensityZones(allVessels);

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

async function fetchChokepointsFromIMF(): Promise<VesselSnapshot | undefined> {
  const url = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=1=1&outFields=*&f=json';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return undefined;
    const data = await response.json();
    if (!data.features || !Array.isArray(data.features)) return undefined;

    let maxCount = 0;
    for (const feature of data.features) {
      if (feature.attributes.vessel_count_total > maxCount) {
        maxCount = feature.attributes.vessel_count_total;
      }
    }

    const densityZones: AisDensityZone[] = data.features.map((feature: any) => {
      const attr = feature.attributes;
      return {
        id: attr.portid,
        name: attr.portname,
        location: {
          latitude: attr.lat,
          longitude: attr.lon,
        },
        intensity: maxCount > 0 ? attr.vessel_count_total / maxCount : 0,
        deltaPct: 0,
        shipsPerDay: Math.round(attr.vessel_count_total / 365),
        note: 'Generated from IMF PortWatch',
      };
    });

    return {
      snapshotAt: Date.now(),
      densityZones: densityZones.sort((a, b) => b.shipsPerDay - a.shipsPerDay),
      disruptions: [],
    };
  } catch (error) {
    console.error('[IMF PortWatch] Request failed:', error);
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
    let result = await fetchChokepointsFromIMF();
    if (!result || result.densityZones.length === 0) {
      console.log('[Fallback] Using VesselAPI for vessel snapshot');
      result = await fetchVesselSnapshotFromVesselApi();
    }
    return result;
  })();
  
  try {
    const result = await inFlightRequest;
    if (result) {
      cachedSnapshot = result;
      cacheTimestamp = Date.now();
    }
    return result ?? cachedSnapshot; 
  } finally {
    inFlightRequest = null;
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
