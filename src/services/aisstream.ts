import { getSecretValue } from './runtime-config';
import type { AisPositionData } from './maritime';

export interface AisStreamStatus {
  connected: boolean;
  connecting: boolean;
  messagesReceived: number;
  lastMessageTime: number;
  vesselsTracked: number;
  error?: string;
}

export type AisStreamCallback = (data: AisPositionData) => void;

interface VesselStaticMeta {
  shipName?: string;
  shipType?: number;
  lastUpdated: number;
}

// In-memory static metadata cache for MMSI -> vessel name and ship type
const vesselMetaCache = new Map<string, VesselStaticMeta>();
const MAX_META_CACHE_SIZE = 15000;

// Registered position listeners
const streamCallbacks = new Set<AisStreamCallback>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let isIntentionallyClosed = false;
let messageCount = 0;
let lastMessageTimestamp = 0;
let lastError: string | undefined;

/**
 * Retrieve AISStream API key from runtime configuration or environment
 */
export function getAisStreamApiKey(): string | null {
  const key = getSecretValue('AISSTREAM_API_KEY');
  if (key && key.trim()) return key.trim();
  return null;
}

/**
 * Determine the WebSocket endpoint for AISStream.
 * In Vite development, routes through /ws/aisstream proxy to eliminate browser Origin rejection.
 */
function getAisStreamEndpoint(): string {
  if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}/ws/aisstream/v0/stream`;
  }
  return 'wss://stream.aisstream.io/v0/stream';
}

/**
 * Prune static vessel metadata cache when exceeding limit
 */
function pruneMetaCache(): void {
  if (vesselMetaCache.size <= MAX_META_CACHE_SIZE) return;
  const cutoff = Date.now() - 4 * 60 * 60 * 1000; // 4 hours
  for (const [mmsi, meta] of vesselMetaCache) {
    if (meta.lastUpdated < cutoff) {
      vesselMetaCache.delete(mmsi);
    }
  }
}

/**
 * Process raw JSON message envelope from AISStream
 */
function handleIncomingMessage(rawText: string): void {
  try {
    const data = JSON.parse(rawText);
    if (!data || typeof data !== 'object') return;

    messageCount++;
    lastMessageTimestamp = Date.now();

    const msgType = data.MessageType;
    const meta = data.MetaData;

    // 1. Handle ShipStaticData (Type 5 / Type 24) to capture ship names and ship types
    if (msgType === 'ShipStaticData') {
      const staticData = data.Message?.ShipStaticData;
      const mmsi = String(staticData?.UserID || meta?.MMSI || meta?.MMSI_String || '');
      if (mmsi) {
        const rawType = Number(staticData?.Type ?? staticData?.ShipType ?? meta?.ShipType);
        const shipType = Number.isFinite(rawType) && rawType > 0 ? rawType : undefined;
        const shipName = (staticData?.Name || meta?.ShipName || '').trim();

        if (shipType !== undefined || shipName) {
          const existing = vesselMetaCache.get(mmsi);
          vesselMetaCache.set(mmsi, {
            shipName: shipName || existing?.shipName,
            shipType: shipType ?? existing?.shipType,
            lastUpdated: Date.now(),
          });
          pruneMetaCache();
        }
      }
      return;
    }

    // 2. Handle PositionReport (Type 1, 2, 3, 18, 19)
    if (
      msgType === 'PositionReport' ||
      msgType === 'StandardClassBPositionReport' ||
      msgType === 'ExtendedClassBPositionReport'
    ) {
      const pos =
        data.Message?.PositionReport ||
        data.Message?.StandardClassBPositionReport ||
        data.Message?.ExtendedClassBPositionReport;

      if (!pos && !meta) return;

      const mmsi = String(pos?.UserID || meta?.MMSI || meta?.MMSI_String || '');
      if (!mmsi) return;

      const lat = Number.isFinite(pos?.Latitude) ? pos.Latitude : Number(meta?.latitude);
      const lon = Number.isFinite(pos?.Longitude) ? pos.Longitude : Number(meta?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const cached = vesselMetaCache.get(mmsi);
      const effectiveShipType = Number.isFinite(Number(meta?.ShipType))
        ? Number(meta.ShipType)
        : cached?.shipType;
      const effectiveShipName = (meta?.ShipName || cached?.shipName || '').trim();

      const positionData: AisPositionData = {
        mmsi,
        name: effectiveShipName,
        lat,
        lon,
        shipType: effectiveShipType,
        heading: Number.isFinite(pos?.TrueHeading) ? pos.TrueHeading : undefined,
        speed: Number.isFinite(pos?.Sog) ? pos.Sog : undefined,
        course: Number.isFinite(pos?.Cog) ? pos.Cog : undefined,
      };

      for (const cb of streamCallbacks) {
        try {
          cb(positionData);
        } catch {
          // Guard against subscriber errors
        }
      }
    }
  } catch {
    // Ignore malformed upstream JSON frames
  }
}

/**
 * Connect to AISStream WebSocket API
 */
export function connectAisStream(customApiKey?: string): boolean {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return false;
  }

  const apiKey = customApiKey || getAisStreamApiKey();
  if (!apiKey) {
    return false;
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return true;
  }

  isIntentionallyClosed = false;
  const endpoint = getAisStreamEndpoint();

  try {
    socket = new WebSocket(endpoint);
  } catch (err: any) {
    lastError = err?.message || 'WebSocket creation failed';
    console.warn('[AISStream] Failed to initialize WebSocket connection:', err);
    scheduleReconnect();
    return false;
  }

  socket.onopen = () => {
    reconnectAttempts = 0;
    lastError = undefined;

    // Send AISStream subscription message
    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: [
        'PositionReport',
        'ShipStaticData',
        'StandardClassBPositionReport',
        'ExtendedClassBPositionReport',
      ],
    };

    try {
      socket?.send(JSON.stringify(subscription));
    } catch (sendErr) {
      console.warn('[AISStream] Subscription send error:', sendErr);
    }
  };

  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      handleIncomingMessage(event.data);
    }
  };

  socket.onerror = (event: Event) => {
    lastError = 'AISStream connection error';
    console.warn('[AISStream] WebSocket error:', event);
  };

  socket.onclose = (event: CloseEvent) => {
    socket = null;
    if (isIntentionallyClosed) return;

    if (event.code === 4001 || event.reason?.includes('429')) {
      lastError = 'AISStream rate limit or invalid API key';
      console.warn('[AISStream] Disconnected (rate limited or invalid key):', event.reason || event.code);
    }

    scheduleReconnect();
  };

  return true;
}

/**
 * Disconnect from AISStream WebSocket
 */
export function disconnectAisStreamSocket(): void {
  isIntentionallyClosed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.close();
    } catch {
      // Ignore close errors
    }
    socket = null;
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(): void {
  if (isIntentionallyClosed || reconnectTimer) return;

  reconnectAttempts++;
  const baseDelay = Math.min(60000, 5000 * Math.pow(1.5, Math.min(reconnectAttempts, 6)));
  const jitter = Math.floor(baseDelay * 0.2 * Math.random());
  const delay = baseDelay + jitter;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!isIntentionallyClosed && getAisStreamApiKey()) {
      connectAisStream();
    }
  }, delay);
}

/**
 * Register callback for live AISStream positions
 */
export function registerAisStreamListener(callback: AisStreamCallback): () => void {
  streamCallbacks.add(callback);

  // Auto-connect if an API key is available and not yet connected
  if (getAisStreamApiKey() && (!socket || socket.readyState === WebSocket.CLOSED)) {
    connectAisStream();
  }

  return () => {
    streamCallbacks.delete(callback);
    if (streamCallbacks.size === 0) {
      disconnectAisStreamSocket();
    }
  };
}

/**
 * Check if AISStream WebSocket is currently active and open
 */
export function isAisStreamConnected(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN;
}

/**
 * Get current AISStream status telemetry
 */
export function getAisStreamStatus(): AisStreamStatus {
  return {
    connected: isAisStreamConnected(),
    connecting: socket !== null && socket.readyState === WebSocket.CONNECTING,
    messagesReceived: messageCount,
    lastMessageTime: lastMessageTimestamp,
    vesselsTracked: vesselMetaCache.size,
    error: lastError,
  };
}
