import { createCircuitBreaker } from '@/utils/circuit-breaker';

export type OutbreakSeverity = 'critical' | 'high' | 'moderate' | 'monitoring';
export type OutbreakSource = 'WHO' | 'CDC';

export interface DiseaseOutbreak {
  id: string;
  source: OutbreakSource;
  title: string;
  disease: string;
  location: string;
  country: string;
  lat: number;
  lon: number;
  date: string;
  cases?: number;
  max52wCases?: number;
  ytdCases?: number;
  severity: OutbreakSeverity;
  summary?: string;
  url?: string;
}

export interface OutbreaksApiResponse {
  updatedAt: string;
  totalCount: number;
  whoCount: number;
  cdcCount: number;
  outbreaks: DiseaseOutbreak[];
  fallback?: boolean;
}

export const BASELINE_OUTBREAKS: DiseaseOutbreak[] = [
  {
    id: 'who-baseline-mers-qatar',
    source: 'WHO',
    title: 'Middle East respiratory syndrome (MERS) – Qatar',
    disease: 'Middle East respiratory syndrome (MERS)',
    location: 'Qatar',
    country: 'Qatar',
    lat: 25.3548,
    lon: 51.1839,
    date: '2026-11-13T19:00:00Z',
    severity: 'critical',
    summary: 'The National International Health Regulations (IHR) Focal Point of the State of Qatar notified WHO of confirmed MERS-CoV infection with camel contact history.',
    url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON626',
  },
  {
    id: 'who-baseline-ebola-drc',
    source: 'WHO',
    title: 'Ebola disease caused by Bundibugyo virus – Democratic Republic of the Congo, Kenya and Nigeria',
    disease: 'Ebola disease (Bundibugyo virus)',
    location: 'Democratic Republic of the Congo',
    country: 'Democratic Republic of the Congo',
    lat: -4.0383,
    lon: 21.7587,
    date: '2026-11-06T20:42:12Z',
    severity: 'critical',
    summary: 'Bundibugyo virus disease (BVD) outbreak response ongoing across central and eastern provinces with multi-country active case contact tracing.',
    url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON625',
  },
  {
    id: 'who-baseline-yellowfever-africa',
    source: 'WHO',
    title: 'Yellow fever - WHO African Region',
    disease: 'Yellow fever',
    location: 'WHO African Region',
    country: 'WHO African Region',
    lat: 1.6508,
    lon: 20.0,
    date: '2026-11-06T19:00:00Z',
    severity: 'critical',
    summary: 'Yellow fever transmission continues in the WHO African Region, with recent outbreak activity concentrated in parts of West and Central Africa.',
    url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON624',
  },
  {
    id: 'who-baseline-shamonda-france',
    source: 'WHO',
    title: 'Shamonda virus in human - France',
    disease: 'Shamonda virus',
    location: 'France',
    country: 'France',
    lat: 46.2276,
    lon: 2.2137,
    date: '2026-11-02T19:00:00Z',
    severity: 'high',
    summary: 'The National IHR Focal Point of France notified WHO regarding the first documented human infection with Shamonda virus in Europe.',
    url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON623',
  },
  {
    id: 'who-baseline-nipah-india',
    source: 'WHO',
    title: 'Nipah virus disease - India',
    disease: 'Nipah virus disease',
    location: 'India',
    country: 'India',
    lat: 20.5937,
    lon: 78.9629,
    date: '2026-06-25T18:00:00Z',
    severity: 'critical',
    summary: 'Confirmed human cases of Nipah virus disease investigated with high case-fatality monitoring in Kerala state.',
    url: 'https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON609',
  },
  {
    id: 'cdc-baseline-salmonella-fl',
    source: 'CDC',
    title: 'Salmonellosis – Florida',
    disease: 'Salmonellosis',
    location: 'Florida, USA',
    country: 'United States',
    lat: 27.6648,
    lon: -81.5158,
    date: '2026-11-10T00:00:00Z',
    cases: 230,
    max52wCases: 297,
    ytdCases: 7787,
    severity: 'moderate',
    summary: 'CDC NNDSS surveillance report for Florida. Registered 230 new confirmed weekly cases.',
    url: 'https://data.cdc.gov/resource/x9gk-5huc',
  },
  {
    id: 'cdc-baseline-coccidio-az',
    source: 'CDC',
    title: 'Coccidioidomycosis (Valley Fever) – Arizona',
    disease: 'Coccidioidomycosis',
    location: 'Arizona, USA',
    country: 'United States',
    lat: 34.0489,
    lon: -111.0937,
    date: '2026-11-10T00:00:00Z',
    cases: 148,
    max52wCases: 304,
    ytdCases: 10096,
    severity: 'moderate',
    summary: 'CDC NNDSS surveillance report for Arizona. Valley fever respiratory cases elevated across central desert basins.',
    url: 'https://data.cdc.gov/resource/x9gk-5huc',
  },
  {
    id: 'cdc-baseline-measles-wi',
    source: 'CDC',
    title: 'Measles, Indigenous – Wisconsin',
    disease: 'Measles',
    location: 'Wisconsin, USA',
    country: 'United States',
    lat: 43.7844,
    lon: -88.7879,
    date: '2026-11-10T00:00:00Z',
    cases: 58,
    max52wCases: 60,
    ytdCases: 395,
    severity: 'high',
    summary: 'CDC NNDSS surveillance report for Wisconsin. Acute indigenous measles cluster reported across school districts.',
    url: 'https://data.cdc.gov/resource/x9gk-5huc',
  },
  {
    id: 'cdc-baseline-cpo-tn',
    source: 'CDC',
    title: 'Carbapenemase-Producing Organisms (CPO) – Tennessee',
    disease: 'Carbapenemase-Producing Organisms',
    location: 'Tennessee, USA',
    country: 'United States',
    lat: 35.5175,
    lon: -86.5804,
    date: '2026-11-10T00:00:00Z',
    cases: 114,
    max52wCases: 19,
    ytdCases: 168,
    severity: 'high',
    summary: 'CDC NNDSS surveillance report for Tennessee. Healthcare cluster spike exceeding previous 52-week max.',
    url: 'https://data.cdc.gov/resource/x9gk-5huc',
  },
];

const breaker = createCircuitBreaker<DiseaseOutbreak[]>({
  name: 'Outbreaks:v1',
  cacheTtlMs: 60 * 60 * 1000, // 1 hour
  persistCache: true,
});

export function getInstantOutbreaks(): DiseaseOutbreak[] {
  const cached = breaker.getCached();
  if (cached && cached.length > 0) return cached;
  return BASELINE_OUTBREAKS;
}

export async function fetchOutbreaksData(forceRefresh = false): Promise<DiseaseOutbreak[]> {
  if (forceRefresh) {
    breaker.clearCache();
  }
  return breaker.execute(async () => {
    try {
      const endpoint = forceRefresh ? '/api/outbreaks?refresh=true' : '/api/outbreaks';
      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          ...(forceRefresh ? { 'Cache-Control': 'no-cache' } : {}),
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        throw new Error(`Outbreaks API returned HTTP ${response.status}`);
      }

      const data: OutbreaksApiResponse = await response.json();
      if (!data || !Array.isArray(data.outbreaks) || data.outbreaks.length === 0) {
        return BASELINE_OUTBREAKS;
      }
      return data.outbreaks;
    } catch (e) {
      console.warn('[Outbreaks] Fetch failed, using baseline data:', e);
      return BASELINE_OUTBREAKS;
    }
  }, BASELINE_OUTBREAKS);
}

/** Clear outbreaks cache on client and trigger a fresh fetch */
export async function clearOutbreaksCache(): Promise<DiseaseOutbreak[]> {
  return fetchOutbreaksData(true);
}

if (typeof window !== 'undefined') {
  (window as unknown as { __clearOutbreaksCache?: typeof clearOutbreaksCache }).__clearOutbreaksCache = clearOutbreaksCache;
}

export function getOutbreaksStatus(): string {
  return breaker.getStatus();
}
