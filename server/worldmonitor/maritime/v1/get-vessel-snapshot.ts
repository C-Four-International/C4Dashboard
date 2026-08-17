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



async function fetchChokepointsFromIMF(): Promise<VesselSnapshot | undefined> {
  const chokepointsUrl = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=1=1&outFields=*&f=json';
  const dailyDataUrl = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query?where=1=1&orderByFields=date DESC&outFields=*&f=json&resultRecordCount=100';
  const disruptionsUrl = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/portwatch_disruptions_database/FeatureServer/0/query?where=1=1&orderByFields=todate DESC&outFields=*&f=json&returnGeometry=false&resultRecordCount=50';

  try {
    const [cpRes, dailyRes, distRes] = await Promise.all([
      fetch(chokepointsUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(dailyDataUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(disruptionsUrl, { signal: AbortSignal.timeout(10000) }).catch(() => null)
    ]);

    if (!cpRes.ok || !dailyRes.ok) return undefined;

    const cpData = await cpRes.json();
    const dailyData = await dailyRes.json();

    if (!cpData.features || !dailyData.features) return undefined;

    const capacityMap = new Map<string, number>();
    const countMap = new Map<string, number>();
    
    // Ordered by DESC date, so the first time we see a portid, it's the latest data.
    for (const feature of dailyData.features) {
      const id = feature.attributes.portid;
      if (!capacityMap.has(id)) {
        capacityMap.set(id, feature.attributes.capacity || 0);
        countMap.set(id, feature.attributes.n_total || 0);
      }
    }

    let maxDensity = 0;
    for (const feature of cpData.features) {
      const cap = capacityMap.get(feature.attributes.portid) || 0;
      if (cap > maxDensity) {
        maxDensity = cap;
      }
    }

    const densityZones: AisDensityZone[] = cpData.features.map((feature: any) => {
      const attr = feature.attributes;
      const capacity = capacityMap.get(attr.portid) || 0;
      const dailyCount = countMap.get(attr.portid) || 0;

      return {
        id: attr.portid,
        name: attr.portname,
        location: {
          latitude: attr.lat,
          longitude: attr.lon,
        },
        intensity: maxDensity > 0 ? capacity / maxDensity : 0,
        deltaPct: 0,
        shipsPerDay: dailyCount,
        note: 'Generated from IMF PortWatch (Density by Trade Capacity)',
      };
    });

    let disruptions: AisDisruption[] = [];
    if (distRes && distRes.ok) {
      const distData = await distRes.json();
      if (distData.features) {
        disruptions = distData.features.map((feature: any) => {
          const attr = feature.attributes;
          return {
            id: String(attr.eventid),
            name: attr.eventname || attr.htmlname || 'Unknown Disruption',
            type: 'AIS_DISRUPTION_TYPE_UNSPECIFIED',
            location: {
              latitude: attr.lat,
              longitude: attr.long,
            },
            severity: attr.alertlevel === 'RED' ? 'AIS_DISRUPTION_SEVERITY_HIGH' :
                      attr.alertlevel === 'ORANGE' ? 'AIS_DISRUPTION_SEVERITY_ELEVATED' : 'AIS_DISRUPTION_SEVERITY_LOW',
            changePct: 0,
            windowHours: 24,
            vesselCount: attr.n_affectedports || 0,
            region: attr.country || 'Global',
            description: attr.htmldescription || attr.severitytext || '',
          };
        });
      }
    }

    return {
      snapshotAt: Date.now(),
      densityZones: densityZones.sort((a, b) => b.shipsPerDay - a.shipsPerDay),
      disruptions,
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

  inFlightRequest = fetchChokepointsFromIMF();
  
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
