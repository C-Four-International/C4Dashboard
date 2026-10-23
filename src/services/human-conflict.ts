import type { HumanConflictEvent } from '@/types';
import { createCircuitBreaker } from '@/utils';

const PROXY_URL = '/api/human-conflict';
function getDirectRailwayUrl(): string {
  let raw = (import.meta.env.VITE_WS_RELAY_URL || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return '';
  if (raw.startsWith('wss://')) raw = 'https://' + raw.slice(6);
  else if (raw.startsWith('ws://')) raw = 'http://' + raw.slice(5);
  else if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = `https://${raw}`;
  try {
    return new URL('/human-conflict', raw).toString();
  } catch {
    return '';
  }
}
const DIRECT_RAILWAY_URL = getDirectRailwayUrl();

const breaker = createCircuitBreaker<HumanConflictEvent[]>({
  name: 'Human Conflict (GDELT)',
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24-hour lengthy client cache to stay within GDELT Cloud free plan limits
  persistCache: true,
});

export interface FetchHumanConflictOptions {
  category?: string;
  days?: number;
  limit?: number;
  country?: string;
}

async function fetchFromEndpoint(baseUrl: string, params: URLSearchParams, timeoutMs = 15000): Promise<HumanConflictEvent[]> {
  const url = `${baseUrl}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${baseUrl}`);
    }

    const payload = await res.json();
    let events: HumanConflictEvent[] = [];

    if (Array.isArray(payload)) {
      events = payload;
    } else if (payload && Array.isArray(payload.data)) {
      events = payload.data;
    } else if (payload && Array.isArray(payload.events)) {
      events = payload.events;
    }

    return events;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHumanConflictEvents(options: FetchHumanConflictOptions = {}): Promise<HumanConflictEvent[]> {
  const params = new URLSearchParams();
  if (options.category) params.set('category', options.category);
  if (options.days) params.set('days', String(options.days));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.country) params.set('country', options.country);

  return breaker.execute(async () => {
    // Strategy 1: Vercel / serverless proxy route
    try {
      const data = await fetchFromEndpoint(PROXY_URL, params, 15000);
      if (data && data.length > 0) return data;
    } catch (proxyErr) {
      console.warn('[HumanConflictService] Proxy fetch failed:', proxyErr);
    }

    // Strategy 2: Direct Railway Relay URL fallback
    if (DIRECT_RAILWAY_URL) {
      try {
        const data = await fetchFromEndpoint(DIRECT_RAILWAY_URL, params, 15000);
        if (data && data.length > 0) return data;
      } catch (directErr) {
        console.warn('[HumanConflictService] Direct Railway fetch failed:', directErr);
      }
    }

    return [];
  }, []);
}
