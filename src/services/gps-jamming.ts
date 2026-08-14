import { createCircuitBreaker } from '@/utils/circuit-breaker';

export type GpsJammingPoint = [number, number, number]; // [lon, lat, weight]

const breaker = createCircuitBreaker<GpsJammingPoint[]>({
  name: 'GPS Jamming',
  cacheTtlMs: 2 * 60 * 1000, // 2 minutes
  persistCache: true,
});

export async function fetchGpsJammingData(): Promise<GpsJammingPoint[]> {
  return breaker.execute(async () => {
    try {
      console.log('[GPS Jamming] Fetching data from /api/gps-jamming...');
      const response = await fetch('/api/gps-jamming');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log(`[GPS Jamming] Fetched ${data.length} jammed points from proxy.`);
      return data;
    } catch (e) {
      console.error('[GPS Jamming] Fetch failed:', e);
      throw e;
    }
  }, []);
}

export function getGpsJammingStatus(): string {
  return breaker.getStatus();
}
