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
      // Fetch targeted hotspots instead of downloading 20MB of global data.
      // 1. Eastern Med / Levant
      // 2. Black Sea / Ukraine
      // 3. Baltics / Kaliningrad
      // 4. Korean Peninsula
      const endpoints = [
        'https://api.adsb.lol/v2/lat/33.0/lon/35.0/dist/250',
        'https://api.adsb.lol/v2/lat/47.0/lon/32.0/dist/250',
        'https://api.adsb.lol/v2/lat/55.0/lon/21.0/dist/250',
        'https://api.adsb.lol/v2/lat/38.0/lon/127.0/dist/250'
      ];

      console.log('[GPS Jamming] Fetching targeted hotspot data from api.adsb.lol...');
      
      const responses = await Promise.all(
        endpoints.map(url => fetch(url).catch(() => null)) // Ignore individual failures
      );

      const jammedPoints: GpsJammingPoint[] = [];
      let totalAircraft = 0;

      for (const response of responses) {
        if (!response || !response.ok) continue;
        const data = await response.json();
        if (data && data.ac) {
          totalAircraft += data.ac.length;
          for (const plane of data.ac) {
            if (plane.lat && plane.lon && (plane.nic < 8 || plane.nac_p < 9)) {
              const weight = ((8 - (plane.nic || 0)) + (9 - (plane.nac_p || 0))) / 17;
              jammedPoints.push([plane.lon, plane.lat, Math.max(0.1, weight)]);
            }
          }
        }
      }

      console.log(`[GPS Jamming] Fetched ${totalAircraft} total aircraft from hotspots, found ${jammedPoints.length} degraded signals.`);
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
