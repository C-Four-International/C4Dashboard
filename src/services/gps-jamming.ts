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
      console.log('[GPS Jamming] Fetching data from api.adsb.lol...');
      const response = await fetch('https://api.adsb.lol/v2/all');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const jammedPoints: GpsJammingPoint[] = [];
      if (data && data.ac) {
        for (const plane of data.ac) {
          if (plane.lat && plane.lon && (plane.nic < 8 || plane.nac_p < 9)) {
            const weight = ((8 - (plane.nic || 0)) + (9 - (plane.nac_p || 0))) / 17;
            jammedPoints.push([plane.lon, plane.lat, Math.max(0.1, weight)]);
          }
        }
        console.log(`[GPS Jamming] Fetched ${data.ac.length} total aircraft, found ${jammedPoints.length} degraded GPS signals.`);
      } else {
        console.warn('[GPS Jamming] No "ac" array in response.', data);
      }
      return jammedPoints;
    } catch (e) {
      console.error('[GPS Jamming] Fetch failed:', e);
      throw e;
    }
  }, []);
}

export function getGpsJammingStatus(): string {
  return breaker.getStatus();
}
