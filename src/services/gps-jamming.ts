import { createCircuitBreaker } from '@/utils/circuit-breaker';

export type GpsJammingPoint = [number, number, number]; // [lon, lat, weight]

const breaker = createCircuitBreaker<GpsJammingPoint[]>({
  name: 'GPS Jamming',
  cacheTtlMs: 2 * 60 * 1000, // 2 minutes
  persistCache: true,
});

export async function fetchGpsJammingData(): Promise<GpsJammingPoint[]> {
  return breaker.execute(async () => {
    const response = await fetch('/api/gps-jamming');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: GpsJammingPoint[] = await response.json();
    return data;
  }, []);
}

export function getGpsJammingStatus(): string {
  return breaker.getStatus();
}
