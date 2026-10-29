import {
  MaritimeServiceClient,
  type AisDensityZone as ProtoDensityZone,
  type AisDisruption as ProtoDisruption,
  type GetVesselSnapshotResponse,
} from '@/generated/client/worldmonitor/maritime/v1/service_client';
import { createCircuitBreaker } from '@/utils';
import type { AisDisruptionEvent, AisDensityZone, AisDisruptionType } from '@/types';
import { dataFreshness } from '../data-freshness';
import { isFeatureAvailable } from '../runtime-config';
import {
  getAisStreamApiKey,
  connectAisStream,
  disconnectAisStreamSocket,
  registerAisStreamListener,
  isAisStreamConnected,
} from '../aisstream';

// ---- Proto fallback (desktop safety when relay URL is unavailable) ----

const client = new MaritimeServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const snapshotBreaker = createCircuitBreaker<GetVesselSnapshotResponse>({ name: 'Maritime Snapshot', cacheTtlMs: 5 * 60 * 1000, persistCache: true });
const emptySnapshotFallback: GetVesselSnapshotResponse = { snapshot: undefined };

const DISRUPTION_TYPE_REVERSE: Record<string, AisDisruptionType> = {
  AIS_DISRUPTION_TYPE_GAP_SPIKE: 'gap_spike',
  AIS_DISRUPTION_TYPE_CHOKEPOINT_CONGESTION: 'chokepoint_congestion',
};

const SEVERITY_REVERSE: Record<string, 'low' | 'elevated' | 'high'> = {
  AIS_DISRUPTION_SEVERITY_LOW: 'low',
  AIS_DISRUPTION_SEVERITY_ELEVATED: 'elevated',
  AIS_DISRUPTION_SEVERITY_HIGH: 'high',
};

function toDisruptionEvent(proto: ProtoDisruption): AisDisruptionEvent {
  return {
    id: proto.id,
    name: proto.name,
    type: DISRUPTION_TYPE_REVERSE[proto.type] || 'gap_spike',
    lat: proto.location?.latitude ?? 0,
    lon: proto.location?.longitude ?? 0,
    severity: SEVERITY_REVERSE[proto.severity] || 'low',
    changePct: proto.changePct,
    windowHours: proto.windowHours,
    vesselCount: proto.vesselCount,
    region: proto.region,
    description: proto.description,
  };
}

function toDensityZone(proto: ProtoDensityZone): AisDensityZone {
  return {
    id: proto.id,
    name: proto.name,
    lat: proto.location?.latitude ?? 0,
    lon: proto.location?.longitude ?? 0,
    intensity: proto.intensity,
    deltaPct: proto.deltaPct,
    shipsPerDay: proto.shipsPerDay,
    note: proto.note,
  };
}

// ---- Feature Gating ----

const isClientRuntime = typeof window !== 'undefined';
const aisConfigured = isClientRuntime && import.meta.env.VITE_ENABLE_AIS !== 'false';

export function isAisConfigured(): boolean {
  return aisConfigured && (isFeatureAvailable('aisRelay') || Boolean(getAisStreamApiKey()));
}

// ---- AisPositionData (exported for military-vessels.ts) ----

export interface AisPositionData {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  shipType?: number;
  heading?: number;
  speed?: number;
  course?: number;
}

// ---- Internal Interfaces ----

interface SnapshotStatus {
  connected: boolean;
  isStarved: boolean;
  vessels: number;
  messages: number;
}

interface SnapshotCandidateReport extends AisPositionData {
  timestamp: number;
}

interface AisSnapshotResponse {
  sequence?: number;
  timestamp?: string;
  status?: {
    connected?: boolean;
    isStarved?: boolean;
    vessels?: number;
    messages?: number;
  };
  disruptions?: AisDisruptionEvent[];
  density?: AisDensityZone[];
  candidateReports?: SnapshotCandidateReport[];
}

// ---- Callback System ----

type AisCallback = (data: AisPositionData) => void;
const positionCallbacks = new Set<AisCallback>();
const lastCallbackTimestampByMmsi = new Map<string, number>();

// ---- Polling State ----

let pollInterval: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let isPolling = false;
let lastPollAt = 0;
let lastSequence = 0;

let latestDisruptions: AisDisruptionEvent[] = [];
let latestDensity: AisDensityZone[] = [];
let latestStatus: SnapshotStatus = {
  connected: false,
  isStarved: false,
  vessels: 0,
  messages: 0,
};

// ---- Constants ----

const SNAPSHOT_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SNAPSHOT_STALE_MS = 11 * 60 * 1000; // 11 minutes
const CALLBACK_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CALLBACK_TRACKED_VESSELS = 20000;


// ---- Internal Helpers ----

function shouldIncludeCandidates(): boolean {
  return positionCallbacks.size > 0;
}

function parseSnapshot(data: unknown): {
  sequence: number;
  status: SnapshotStatus;
  disruptions: AisDisruptionEvent[];
  density: AisDensityZone[];
  candidateReports: SnapshotCandidateReport[];
} | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as AisSnapshotResponse;

  if (!Array.isArray(raw.disruptions) || !Array.isArray(raw.density)) return null;

  const status = raw.status || {};
  return {
    sequence: Number.isFinite(raw.sequence as number) ? Number(raw.sequence) : 0,
    status: {
      connected: Boolean(status.connected),
      isStarved: Boolean(status.isStarved),
      vessels: Number.isFinite(status.vessels as number) ? Number(status.vessels) : 0,
      messages: Number.isFinite(status.messages as number) ? Number(status.messages) : 0,
    },
    disruptions: raw.disruptions,
    density: raw.density,
    candidateReports: Array.isArray(raw.candidateReports) ? raw.candidateReports : [],
  };
}

// ---- Eagle Intelligence Chokepoint Types & Mapping ----

export interface EagleChokepointItem {
  chokepoint: string;
  name: string;
  status: string;
  signalsLast24h: number;
  highAlertsLast24h: number;
  signalsLast7d: number;
  latestHighHeadline: string | null;
  lastUpdated: string;
  pageUrl: string;
  crisisDay?: number;
  situationUrl?: string;
}

export interface EagleChokepointResponse {
  source?: string;
  url?: string;
  docs?: string;
  count?: number;
  chokepoints?: EagleChokepointItem[];
}

export interface EagleHormuzResponse {
  situation?: string;
  name?: string;
  status?: string;
  statusNote?: string;
  crisisDay?: number;
  signalsLast24h?: number;
  highAlertsLast24h?: number;
  signalsLast7d?: number;
  latestHighHeadline?: string | null;
  lastUpdated?: string;
  situationUrl?: string;
  attribution?: string;
  embedBadge?: string;
}

const EAGLE_CHOKEPOINT_COORDS: Record<string, { lat: number; lon: number; region: string }> = {
  'strait-of-hormuz': { lat: 26.5, lon: 56.5, region: 'Middle East (Strait of Hormuz)' },
  'suez-canal': { lat: 30.5, lon: 32.3, region: 'Middle East / Red Sea (Suez Canal)' },
  'bab-el-mandeb': { lat: 12.5, lon: 43.3, region: 'Red Sea / Gulf of Aden (Bab el-Mandeb)' },
  'panama-canal': { lat: 9.1, lon: -79.7, region: 'Americas (Panama Canal)' },
  'strait-of-malacca': { lat: 2.5, lon: 101.5, region: 'Southeast Asia (Strait of Malacca)' },
  'bosphorus': { lat: 41.1, lon: 29.0, region: 'Black Sea / Turkish Straits (Bosphorus)' },
};

function parseEagleSeverity(status: string): 'low' | 'elevated' | 'high' {
  const s = (status || '').toUpperCase();
  if (s === 'SEVERE' || s === 'HIGH' || s === 'CRITICAL') return 'high';
  if (s === 'ELEVATED' || s === 'WARNING') return 'elevated';
  return 'low';
}

function formatEagleDescription(cp: EagleChokepointItem, hormuzNote?: string): string {
  const parts: string[] = [`Status: ${cp.status}`];
  if (cp.crisisDay) {
    parts.push(`Crisis Day ${cp.crisisDay}`);
  }
  if (hormuzNote) {
    parts.push(hormuzNote);
  }
  if (cp.latestHighHeadline) {
    parts.push(`Alert: "${cp.latestHighHeadline}"`);
  }
  parts.push(`Activity: ${cp.signalsLast24h} signals in 24h (${cp.signalsLast7d} in 7d, ${cp.highAlertsLast24h} HIGH alerts)`);
  parts.push('Source: Eagle Intelligence (eagleintelmari.com)');
  return parts.join(' | ');
}

export async function fetchEagleChokepointStatus(): Promise<AisDisruptionEvent[]> {
  const chokepointDisruptions: AisDisruptionEvent[] = [];
  try {
    const [chokepointRes, hormuzRes] = await Promise.allSettled([
      globalThis.fetch('https://eagleintelmari.com/api/chokepoint-status', { signal: AbortSignal.timeout(8000) }),
      globalThis.fetch('https://eagleintelmari.com/api/hormuz-status', { signal: AbortSignal.timeout(8000) }),
    ]);

    let hormuzNote: string | undefined;
    let hormuzData: EagleHormuzResponse | null = null;
    if (hormuzRes.status === 'fulfilled' && hormuzRes.value.ok) {
      try {
        hormuzData = await hormuzRes.value.json() as EagleHormuzResponse;
        if (hormuzData?.statusNote) {
          hormuzNote = hormuzData.statusNote;
        }
      } catch { /* ignore */ }
    }

    if (chokepointRes.status === 'fulfilled' && chokepointRes.value.ok) {
      const data = await chokepointRes.value.json() as EagleChokepointResponse;
      if (data && Array.isArray(data.chokepoints)) {
        for (const cp of data.chokepoints) {
          const note = (cp.chokepoint === 'strait-of-hormuz') ? hormuzNote : undefined;
          const meta = EAGLE_CHOKEPOINT_COORDS[cp.chokepoint] || { lat: 0, lon: 0, region: 'Global' };
          chokepointDisruptions.push({
            id: `eagle-${cp.chokepoint}`,
            name: cp.name,
            type: 'chokepoint_congestion',
            lat: meta.lat,
            lon: meta.lon,
            severity: parseEagleSeverity(cp.status),
            changePct: cp.status === 'SEVERE' ? 50 : (cp.highAlertsLast24h > 0 ? cp.highAlertsLast24h * 15 : 0),
            windowHours: 24,
            vesselCount: cp.signalsLast24h,
            region: meta.region,
            description: formatEagleDescription(cp, note),
            source: 'EAGLE Intelligence',
            sourceUrl: 'https://eagleintelmari.com',
            pageUrl: cp.situationUrl || cp.pageUrl || 'https://eagleintelmari.com',
            attribution: 'Data provided by EAGLE Intelligence (eagleintelmari.com) under CC BY 4.0',
            license: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          });
        }
      }
    } else if (hormuzData) {
      const meta = EAGLE_CHOKEPOINT_COORDS['strait-of-hormuz'] ?? { lat: 26.5, lon: 56.5, region: 'Middle East (Strait of Hormuz)' };
      chokepointDisruptions.push({
        id: 'eagle-strait-of-hormuz',
        name: hormuzData.name || 'Strait of Hormuz',
        type: 'chokepoint_congestion',
        lat: meta.lat,
        lon: meta.lon,
        severity: parseEagleSeverity(hormuzData.status || 'SEVERE'),
        changePct: 50,
        windowHours: 24,
        vesselCount: hormuzData.signalsLast24h ?? 0,
        region: meta.region,
        description: `Status: ${hormuzData.status || 'SEVERE'} | ${hormuzData.statusNote || ''} | Latest Alert: "${hormuzData.latestHighHeadline || ''}" | Source: Eagle Intelligence (eagleintelmari.com)`,
        source: 'EAGLE Intelligence',
        sourceUrl: 'https://eagleintelmari.com',
        pageUrl: hormuzData.situationUrl || 'https://eagleintelmari.com/situation/strait-of-hormuz',
        attribution: hormuzData.attribution || 'Data provided by EAGLE Intelligence (eagleintelmari.com) under CC BY 4.0',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      });
    }
  } catch (e) {
    console.warn('[AIS Frontend] Failed to fetch eagleintelmari chokepoint APIs', e);
  }
  return chokepointDisruptions;
}

// ---- Hybrid Fetch Strategy ----

async function fetchSnapshotPayload(includeCandidates: boolean): Promise<unknown> {
  let candidateReports: SnapshotCandidateReport[] = [];
  let relayDensity: AisDensityZone[] | null = null;
  let relayDisruptions: AisDisruptionEvent[] | null = null;
  let status: SnapshotStatus = { connected: true, isStarved: false, vessels: 0, messages: 0 };
  let sequence = 0;
  let relaySuccess = false;

  const chokepointDisruptions: AisDisruptionEvent[] = await fetchEagleChokepointStatus();

  if (includeCandidates) {
    try {
      const relayRes = await globalThis.fetch('/api/ais-snapshot?candidates=true');
      if (relayRes.ok) {
        const relayData = await relayRes.json() as AisSnapshotResponse;
        if (relayData.candidateReports) candidateReports = relayData.candidateReports;
        if (relayData.density) relayDensity = relayData.density;
        if (relayData.disruptions) relayDisruptions = relayData.disruptions;
        if (relayData.status) {
          status = {
            connected: Boolean(relayData.status.connected),
            isStarved: Boolean(relayData.status.isStarved),
            vessels: Number(relayData.status.vessels) || 0,
            messages: Number(relayData.status.messages) || 0,
          };
        }
        if (relayData.sequence) sequence = Number(relayData.sequence);
        relaySuccess = true;
      }
    } catch (e) {
      console.warn('[AIS Frontend] Failed to fetch relay snapshot for candidates', e);
    }
  }

  // If relay provided density and disruptions, we don't need the fallback
  if (relaySuccess && relayDensity && relayDisruptions) {
    return {
      sequence,
      status,
      disruptions: [...relayDisruptions, ...chokepointDisruptions],
      density: relayDensity,
      candidateReports,
    };
  }

  // Fallback to VesselAPI
  const response = await snapshotBreaker.execute(async () => {
    return client.getVesselSnapshot({});
  }, emptySnapshotFallback);

  if (response.snapshot) {
    return {
      sequence,
      status,
      disruptions: [...(relayDisruptions || response.snapshot.disruptions.map(toDisruptionEvent)), ...chokepointDisruptions],
      density: relayDensity || response.snapshot.densityZones.map(toDensityZone),
      candidateReports,
    };
  }

  // If VesselAPI failed but we have partial relay data, return what we have
  if (relaySuccess) {
    return {
      sequence,
      status,
      disruptions: [...(relayDisruptions || []), ...chokepointDisruptions],
      density: relayDensity || [],
      candidateReports,
    };
  }

  // Even if everything else failed, if we have chokepoint data, return that
  if (chokepointDisruptions.length > 0) {
    return {
      sequence,
      status,
      disruptions: chokepointDisruptions,
      density: [],
      candidateReports,
    };
  }

  throw new Error('No snapshot data returned from VesselAPI or relay');
}

// ---- Callback Emission ----

function pruneCallbackTimestampIndex(now: number): void {
  if (lastCallbackTimestampByMmsi.size <= MAX_CALLBACK_TRACKED_VESSELS) {
    return;
  }

  const threshold = now - CALLBACK_RETENTION_MS;
  for (const [mmsi, ts] of lastCallbackTimestampByMmsi) {
    if (ts < threshold) {
      lastCallbackTimestampByMmsi.delete(mmsi);
    }
  }

  if (lastCallbackTimestampByMmsi.size <= MAX_CALLBACK_TRACKED_VESSELS) {
    return;
  }

  const oldest = Array.from(lastCallbackTimestampByMmsi.entries())
    .sort((a, b) => a[1] - b[1]);
  const toDelete = lastCallbackTimestampByMmsi.size - MAX_CALLBACK_TRACKED_VESSELS;
  for (let i = 0; i < toDelete; i++) {
    const entry = oldest[i];
    if (!entry) break;
    lastCallbackTimestampByMmsi.delete(entry[0]);
  }
}

function emitCandidateReports(reports: SnapshotCandidateReport[]): void {
  if (positionCallbacks.size === 0 || reports.length === 0) return;
  const now = Date.now();

  for (const report of reports) {
    if (!report?.mmsi || !Number.isFinite(report.lat) || !Number.isFinite(report.lon)) continue;

    const reportTs = Number.isFinite(report.timestamp) ? Number(report.timestamp) : now;
    const lastTs = lastCallbackTimestampByMmsi.get(report.mmsi) || 0;
    if (reportTs <= lastTs) continue;

    lastCallbackTimestampByMmsi.set(report.mmsi, reportTs);
    const callbackData: AisPositionData = {
      mmsi: report.mmsi,
      name: report.name || '',
      lat: report.lat,
      lon: report.lon,
      shipType: report.shipType,
      heading: report.heading,
      speed: report.speed,
      course: report.course,
    };

    for (const callback of positionCallbacks) {
      try {
        callback(callbackData);
      } catch {
        // Ignore callback errors
      }
    }
  }

  pruneCallbackTimestampIndex(now);
}

// ---- Polling ----

async function pollSnapshot(force = false): Promise<void> {
  if (!isAisConfigured()) return;
  // Skip polling when tab is hidden to avoid wasting relay bandwidth.
  // The interval keeps running so polling resumes instantly on focus.
  if (!force && isClientRuntime && document.hidden) return;
  if (inFlight && !force) return;

  inFlight = true;
  try {
    const includeCandidates = shouldIncludeCandidates();
    const payload = await fetchSnapshotPayload(includeCandidates);
    const snapshot = parseSnapshot(payload);
    if (!snapshot) throw new Error('Invalid snapshot payload');

    latestDisruptions = snapshot.disruptions;
    latestDensity = snapshot.density;
    latestStatus = snapshot.status;
    lastPollAt = Date.now();

    if (includeCandidates) {
      if (snapshot.sequence > lastSequence) {
        emitCandidateReports(snapshot.candidateReports);
        lastSequence = snapshot.sequence;
      } else if (lastSequence === 0) {
        emitCandidateReports(snapshot.candidateReports);
        lastSequence = snapshot.sequence;
      }
    } else {
      lastSequence = snapshot.sequence;
    }

    const itemCount = latestDisruptions.length + latestDensity.length;
    if (itemCount > 0 || latestStatus.vessels > 0) {
      dataFreshness.recordUpdate('ais', itemCount > 0 ? itemCount : latestStatus.vessels);
    }
  } catch (err) {
    console.error('[AIS Frontend] Failed to fetch or parse snapshot payload:', err);
    latestStatus.connected = false;
  } finally {
    inFlight = false;
  }
}

function startPolling(): void {
  if (isPolling || !isAisConfigured()) return;
  isPolling = true;
  void pollSnapshot(true);
  pollInterval = setInterval(() => {
    void pollSnapshot(false);
  }, SNAPSHOT_POLL_INTERVAL_MS);
}

function pausePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function resumePolling(): void {
  if (!isPolling || pollInterval) return;
  // Avoid overlapping relay requests if a poll is already in flight.
  if (!inFlight) {
    void pollSnapshot(false);
  }
  pollInterval = setInterval(() => {
    void pollSnapshot(false);
  }, SNAPSHOT_POLL_INTERVAL_MS);
}

// Pause AIS polling when the browser tab is hidden to avoid wasting
// Railway relay bandwidth on backgrounded tabs.
if (isClientRuntime) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pausePolling();
    } else {
      resumePolling();
    }
  });
}

// ---- Exported Functions ----

// Pipe live WebSocket AISStream reports into position callbacks
registerAisStreamListener((data: AisPositionData) => {
  for (const callback of positionCallbacks) {
    try {
      callback(data);
    } catch {
      // Ignore subscriber errors
    }
  }
});

export function registerAisCallback(callback: AisCallback): void {
  positionCallbacks.add(callback);
  startPolling();
  if (getAisStreamApiKey()) {
    connectAisStream();
  }
}

export function unregisterAisCallback(callback: AisCallback): void {
  positionCallbacks.delete(callback);
  if (positionCallbacks.size === 0) {
    lastCallbackTimestampByMmsi.clear();
  }
}

export function initAisStream(): void {
  startPolling();
  if (getAisStreamApiKey()) {
    connectAisStream();
  }
}

export function disconnectAisStream(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isPolling = false;
  inFlight = false;
  latestStatus.connected = false;
  disconnectAisStreamSocket();
}

export function getAisStatus(): { connected: boolean; isStarved: boolean; vessels: number; messages: number } {
  const isFresh = Date.now() - lastPollAt <= SNAPSHOT_STALE_MS;
  const wsConnected = isAisStreamConnected();
  return {
    connected: (latestStatus.connected && isFresh) || wsConnected,
    isStarved: latestStatus.isStarved && !wsConnected,
    vessels: latestStatus.vessels,
    messages: latestStatus.messages,
  };
}

export async function ensureAisSnapshot(): Promise<void> {
  const isFresh = Date.now() - lastPollAt <= SNAPSHOT_STALE_MS;
  if (!isFresh || latestStatus.vessels === 0) {
    await pollSnapshot(true);
  }
}

export async function fetchAisSignals(): Promise<{ disruptions: AisDisruptionEvent[]; density: AisDensityZone[] }> {
  if (!aisConfigured) {
    return { disruptions: [], density: [] };
  }

  startPolling();
  const shouldRefresh = Date.now() - lastPollAt > SNAPSHOT_STALE_MS;
  if (shouldRefresh) {
    await pollSnapshot(true);
  }

  return {
    disruptions: latestDisruptions,
    density: latestDensity,
  };
}
