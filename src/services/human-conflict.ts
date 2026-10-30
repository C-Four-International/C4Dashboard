import type { HumanConflictCategory, HumanConflictEvent, UcdpGeoEvent } from '@/types';
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
  name: 'Human Conflict',
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24-hour lengthy client cache for UCDP conflict events
  persistCache: true,
});

export interface FetchHumanConflictOptions {
  category?: string;
  days?: number;
  limit?: number;
  country?: string;
}

function convertUcdpToHumanConflictEvents(
  events: UcdpGeoEvent[],
  options: FetchHumanConflictOptions,
): HumanConflictEvent[] {
  let mapped: HumanConflictEvent[] = events.map((e, idx) => {
    const isOneSided = e.type_of_violence === 'one-sided';
    const category: HumanConflictCategory = isOneSided ? 'riots' : 'battles';
    const sideA = e.side_a || 'Armed forces';
    const sideB = e.side_b || 'Opposing forces';
    const country = e.country || '';
    const title = `${sideA} vs ${sideB}${country ? ` (${country})` : ''}`;
    const dateStr: string = (e.date_start ? e.date_start.split('T')[0] : '') || new Date().toISOString().slice(0, 10);
    const fatalities = Math.max(0, e.deaths_best || 0);

    return {
      id: `ucdp-${e.id || idx}`,
      title,
      category,
      subcategory: e.type_of_violence,
      subcategoryLabel: (e.type_of_violence || '').replace(/-/g, ' ').toUpperCase(),
      date: dateStr,
      lat: e.latitude,
      lon: e.longitude,
      country,
      location: country,
      fatalities,
      actors: [sideA, sideB].filter(Boolean),
      significance: Math.min(10, Math.max(1, Math.ceil((fatalities || 1) / 5))),
      source: 'ucdp',
    };
  }).filter(e => e.lat !== 0 || e.lon !== 0);

  if (options.category) {
    const allowed = options.category.toLowerCase().split(',').map(s => s.trim());
    mapped = mapped.filter(e => allowed.includes(e.category.toLowerCase()));
  }
  if (options.country) {
    const countryLower = options.country.toLowerCase();
    mapped = mapped.filter(e => (e.country || '').toLowerCase() === countryLower);
  }
  if (options.limit) {
    mapped = mapped.slice(0, Math.min(300, Math.max(1, options.limit)));
  }
  return mapped;
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

    // Strategy 3: Direct UCDP RPC client fallback
    try {
      const { fetchUcdpEvents } = await import('@/services/conflict');
      const ucdpResp = await fetchUcdpEvents();
      if (ucdpResp.data && ucdpResp.data.length > 0) {
        return convertUcdpToHumanConflictEvents(ucdpResp.data, options);
      }
    } catch (ucdpErr) {
      console.warn('[HumanConflictService] Direct UCDP fallback failed:', ucdpErr);
    }

    return [];
  }, []);
}
