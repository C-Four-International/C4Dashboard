import type { BgpAnomaly } from '@/types';
import { createCircuitBreaker } from '@/utils/circuit-breaker';
import { getCountryBbox } from '@/services/country-geometry';

// Centroids for major countries in [longitude, latitude] format (DeckGL standard)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [-98.5795, 39.8283],
  CA: [-106.3468, 56.1304],
  MX: [-102.5528, 23.6345],
  BR: [-51.9253, -14.2350],
  AR: [-63.6167, -38.4161],
  CL: [-71.5430, -35.6751],
  CO: [-74.2973, 4.5709],
  PE: [-75.0152, -9.1899],
  VE: [-66.5897, 6.4238],
  GB: [-1.5486, 54.5500],
  UK: [-1.5486, 54.5500],
  DE: [10.4515, 51.1657],
  FR: [2.2137, 46.2276],
  IT: [12.5674, 41.8719],
  ES: [-3.7492, 40.4637],
  NL: [5.2913, 52.1326],
  BE: [4.4699, 50.5039],
  CH: [8.2275, 46.8182],
  AT: [14.5501, 47.5162],
  SE: [18.6435, 60.1282],
  NO: [8.4689, 60.4720],
  FI: [25.7482, 61.9241],
  DK: [9.5018, 56.2639],
  PL: [19.1451, 51.9194],
  CZ: [15.4730, 49.8175],
  RO: [24.9668, 45.9432],
  HU: [19.5033, 47.1625],
  UA: [31.1656, 48.3794],
  RU: [105.3188, 61.5240],
  TR: [35.2433, 38.9637],
  IL: [34.8516, 31.0461],
  IR: [53.6880, 32.4279],
  SA: [45.0792, 23.8859],
  AE: [53.8478, 23.4241],
  QA: [51.1839, 25.3548],
  KW: [47.4818, 29.3117],
  EG: [30.8025, 26.8206],
  ZA: [22.9375, -30.5595],
  NG: [8.6753, 9.0820],
  KE: [37.9062, -0.0236],
  CN: [104.1954, 35.8617],
  JP: [138.2529, 36.2048],
  KR: [127.7669, 35.9078],
  TW: [120.9605, 23.6978],
  HK: [114.1694, 22.3193],
  IN: [78.9629, 20.5937],
  PK: [69.3451, 30.3753],
  BD: [90.3563, 23.6850],
  SG: [103.8198, 1.3521],
  MY: [101.9758, 4.2105],
  ID: [113.9213, -0.7893],
  TH: [100.9925, 15.8700],
  VN: [108.2772, 14.0583],
  PH: [121.7740, 12.8797],
  AU: [133.7751, -25.2744],
  NZ: [174.8860, -40.9006],
  IE: [-8.2439, 53.4129],
  PT: [-8.2245, 39.3999],
  GR: [21.8243, 39.0742],
};

function getCoordinatesForCountry(countryCode?: string, id: string = ''): [number, number] {
  if (!countryCode) {
    return [0, 20];
  }

  const code = countryCode.toUpperCase();
  let baseCoords = COUNTRY_CENTROIDS[code];

  if (!baseCoords) {
    // Try resolving from country geometry bounding box
    const bbox = getCountryBbox(code);
    if (bbox) {
      baseCoords = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    } else {
      baseCoords = [0, 20];
    }
  }

  // Deterministic jitter based on anomaly ID so multiple events within the same country don't overlap completely
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const angle = Math.abs(hash % 360) * (Math.PI / 180);
  const radius = ((Math.abs(hash % 10) + 1) * 0.12); // ~0.12° to 1.2° offset

  const lon = Math.max(-180, Math.min(180, baseCoords[0] + radius * Math.cos(angle)));
  const lat = Math.max(-75, Math.min(75, baseCoords[1] + radius * Math.sin(angle)));
  return [lon, lat];
}

let anomaliesConfigured: boolean | null = null;

export function isBgpAnomaliesConfigured(): boolean | null {
  return anomaliesConfigured;
}

const breaker = createCircuitBreaker<BgpAnomaly[]>({
  name: 'BGP Anomalies (Cloudflare Radar)',
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes cache
  persistCache: true,
});

export async function fetchBgpAnomalies(dateRange: string = '7d'): Promise<BgpAnomaly[]> {
  return breaker.execute(async () => {
    try {
      const response = await fetch(`/api/bgp-anomalies?dateRange=${encodeURIComponent(dateRange)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.configured === false) {
        anomaliesConfigured = false;
        return [];
      }

      anomaliesConfigured = true;
      const rawAnomalies = Array.isArray(data.anomalies) ? data.anomalies : [];

      // Resolve coordinates and geographical attributes
      return rawAnomalies.map((anomaly: BgpAnomaly): BgpAnomaly => {
        const [lon, lat] = getCoordinatesForCountry(anomaly.countryCode || anomaly.originCountry, anomaly.id);
        
        let targetLat: number | undefined;
        let targetLon: number | undefined;

        if (anomaly.targetCountries && anomaly.targetCountries.length > 0) {
          const targetCountry = anomaly.targetCountries[0];
          const [tLon, tLat] = getCoordinatesForCountry(targetCountry, `${anomaly.id}-target`);
          targetLon = tLon;
          targetLat = tLat;
        }

        return {
          ...anomaly,
          lon,
          lat,
          targetLon,
          targetLat,
        };
      });
    } catch (err) {
      console.warn('[BGP Anomalies] Failed to fetch data:', err);
      throw err;
    }
  }, []);
}

export function getBgpAnomaliesStatus(): string {
  return breaker.getStatus();
}
