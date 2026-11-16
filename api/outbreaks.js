import { Redis } from '@upstash/redis/cloudflare';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let inFlightFetch = null;
let redisClient = null;

function getRedis() {
  if (redisClient === null && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    } catch {
      redisClient = false;
    }
  }
  return redisClient || null;
}

const REDIS_KEY = 'wm:outbreaks:v1';
const REDIS_TTL_SECONDS = 3600; // 1 hour

// Geocoding centroids for countries and WHO regions
const COUNTRY_COORDINATES = {
  // Middle East & North Africa
  'qatar': { lat: 25.3548, lon: 51.1839, country: 'Qatar' },
  'saudi arabia': { lat: 23.8859, lon: 45.0792, country: 'Saudi Arabia' },
  'kingdom of saudi arabia': { lat: 23.8859, lon: 45.0792, country: 'Saudi Arabia' },
  'egypt': { lat: 26.8206, lon: 30.8025, country: 'Egypt' },
  'morocco': { lat: 31.7917, lon: -7.0926, country: 'Morocco' },
  'israel': { lat: 31.0461, lon: 34.8516, country: 'Israel' },
  'iran': { lat: 32.4279, lon: 53.6880, country: 'Iran' },
  'iraq': { lat: 33.2232, lon: 43.6793, country: 'Iraq' },
  'jordan': { lat: 30.5852, lon: 36.2384, country: 'Jordan' },
  'oman': { lat: 21.5126, lon: 55.9233, country: 'Oman' },
  'united arab emirates': { lat: 23.4241, lon: 53.8478, country: 'United Arab Emirates' },

  // Sub-Saharan Africa
  'democratic republic of the congo': { lat: -4.0383, lon: 21.7587, country: 'Democratic Republic of the Congo' },
  'dr congo': { lat: -4.0383, lon: 21.7587, country: 'Democratic Republic of the Congo' },
  'congo': { lat: -0.2280, lon: 15.8277, country: 'Republic of the Congo' },
  'kenya': { lat: -0.0236, lon: 37.9062, country: 'Kenya' },
  'nigeria': { lat: 9.0820, lon: 8.6753, country: 'Nigeria' },
  'uganda': { lat: 1.3733, lon: 32.2903, country: 'Uganda' },
  'ethiopia': { lat: 9.1450, lon: 40.4897, country: 'Ethiopia' },
  'tanzania': { lat: -6.3690, lon: 34.8888, country: 'Tanzania' },
  'united republic of tanzania': { lat: -6.3690, lon: 34.8888, country: 'Tanzania' },
  'angola': { lat: -11.2027, lon: 17.8739, country: 'Angola' },
  'mauritania': { lat: 21.0079, lon: -10.9408, country: 'Mauritania' },
  'senegal': { lat: 14.4974, lon: -14.4524, country: 'Senegal' },
  'sudan': { lat: 12.8628, lon: 30.2176, country: 'Sudan' },
  'south sudan': { lat: 6.8770, lon: 31.3070, country: 'South Sudan' },
  'rwanda': { lat: -1.9403, lon: 29.8739, country: 'Rwanda' },
  'burundi': { lat: -3.3731, lon: 29.9189, country: 'Burundi' },
  'guinea': { lat: 9.9456, lon: -9.6966, country: 'Guinea' },
  'sierra leone': { lat: 8.4606, lon: -11.7799, country: 'Sierra Leone' },
  'liberia': { lat: 6.4281, lon: -9.4295, country: 'Liberia' },
  'ghana': { lat: 7.9465, lon: -1.0232, country: 'Ghana' },
  'cameroon': { lat: 7.3697, lon: 12.3547, country: 'Cameroon' },
  'chad': { lat: 15.4542, lon: 18.7322, country: 'Chad' },
  'central african republic': { lat: 6.6111, lon: 20.9394, country: 'Central African Republic' },
  'zambia': { lat: -13.1339, lon: 27.8493, country: 'Zambia' },
  'zimbabwe': { lat: -19.0154, lon: 29.1549, country: 'Zimbabwe' },
  'mozambique': { lat: -18.6657, lon: 35.5296, country: 'Mozambique' },
  'madagascar': { lat: -18.7669, lon: 46.8691, country: 'Madagascar' },
  'somalia': { lat: 5.1521, lon: 46.1996, country: 'Somalia' },
  'mali': { lat: 17.5707, lon: -3.9962, country: 'Mali' },
  'burkina faso': { lat: 12.2383, lon: -1.5616, country: 'Burkina Faso' },
  'niger': { lat: 17.6078, lon: 8.0817, country: 'Niger' },

  // Europe
  'france': { lat: 46.2276, lon: 2.2137, country: 'France' },
  'russian federation': { lat: 61.5240, lon: 105.3188, country: 'Russia' },
  'russia': { lat: 61.5240, lon: 105.3188, country: 'Russia' },
  'italy': { lat: 41.8719, lon: 12.5674, country: 'Italy' },
  'spain': { lat: 40.4637, lon: -3.7492, country: 'Spain' },
  'united kingdom': { lat: 55.3781, lon: -3.4360, country: 'United Kingdom' },
  'germany': { lat: 51.1657, lon: 10.4515, country: 'Germany' },
  'ukraine': { lat: 48.3794, lon: 31.1656, country: 'Ukraine' },
  'turkey': { lat: 38.9637, lon: 35.2433, country: 'Turkey' },
  'poland': { lat: 51.9194, lon: 19.1451, country: 'Poland' },
  'greece': { lat: 39.0742, lon: 21.8243, country: 'Greece' },

  // Asia & Pacific
  'india': { lat: 20.5937, lon: 78.9629, country: 'India' },
  'bangladesh': { lat: 23.6850, lon: 90.3563, country: 'Bangladesh' },
  'china': { lat: 35.8617, lon: 104.1954, country: 'China' },
  'pakistan': { lat: 30.3753, lon: 69.3451, country: 'Pakistan' },
  'indonesia': { lat: -0.7893, lon: 113.9213, country: 'Indonesia' },
  'philippines': { lat: 12.8797, lon: 121.7740, country: 'Philippines' },
  'vietnam': { lat: 14.0583, lon: 108.2772, country: 'Vietnam' },
  'thailand': { lat: 15.8700, lon: 100.9925, country: 'Thailand' },
  'cambodia': { lat: 12.5657, lon: 104.9910, country: 'Cambodia' },
  'japan': { lat: 36.2048, lon: 138.2529, country: 'Japan' },
  'papua new guinea': { lat: -6.3150, lon: 143.9555, country: 'Papua New Guinea' },
  'timor-leste': { lat: -8.8742, lon: 125.7275, country: 'Timor-Leste' },
  'australia': { lat: -25.2744, lon: 133.7751, country: 'Australia' },
  'malaysia': { lat: 4.2105, lon: 101.9758, country: 'Malaysia' },
  'myanmar': { lat: 21.9162, lon: 95.9560, country: 'Myanmar' },

  // Americas
  'united states of america': { lat: 37.0902, lon: -95.7129, country: 'United States' },
  'united states': { lat: 37.0902, lon: -95.7129, country: 'United States' },
  'usa': { lat: 37.0902, lon: -95.7129, country: 'United States' },
  'canada': { lat: 56.1304, lon: -106.3468, country: 'Canada' },
  'mexico': { lat: 23.6345, lon: -102.5528, country: 'Mexico' },
  'brazil': { lat: -14.2350, lon: -51.9253, country: 'Brazil' },
  'colombia': { lat: 4.5709, lon: -74.2973, country: 'Colombia' },
  'peru': { lat: -9.1900, lon: -75.0152, country: 'Peru' },
  'argentina': { lat: -38.4161, lon: -63.6167, country: 'Argentina' },
  'chile': { lat: -35.6751, lon: -71.5430, country: 'Chile' },
  'ecuador': { lat: -1.8312, lon: -78.1834, country: 'Ecuador' },
  'bolivia': { lat: -16.2902, lon: -63.5887, country: 'Bolivia' },

  // Regions
  'who african region': { lat: 1.6508, lon: 20.0, country: 'WHO African Region' },
  'african region': { lat: 1.6508, lon: 20.0, country: 'WHO African Region' },
  'region of the americas': { lat: 10.0, lon: -75.0, country: 'Region of the Americas' },
  'americas': { lat: 10.0, lon: -75.0, country: 'Region of the Americas' },
  'global': { lat: 20.0, lon: 0.0, country: 'Global' },
};

const US_STATE_COORDS = {
  'Alabama': { lat: 32.3182, lon: -86.9023 },
  'Alaska': { lat: 64.2008, lon: -149.4937 },
  'Arizona': { lat: 34.0489, lon: -111.0937 },
  'Arkansas': { lat: 35.2010, lon: -91.8318 },
  'California': { lat: 36.7783, lon: -119.4179 },
  'Colorado': { lat: 39.5501, lon: -105.7821 },
  'Connecticut': { lat: 41.6032, lon: -73.0877 },
  'Delaware': { lat: 38.9108, lon: -75.5277 },
  'Florida': { lat: 27.6648, lon: -81.5158 },
  'Georgia': { lat: 32.1656, lon: -82.9001 },
  'Hawaii': { lat: 19.8968, lon: -155.5828 },
  'Idaho': { lat: 44.0682, lon: -114.7420 },
  'Illinois': { lat: 40.6331, lon: -89.3985 },
  'Indiana': { lat: 40.2672, lon: -86.1349 },
  'Iowa': { lat: 41.8780, lon: -93.0977 },
  'Kansas': { lat: 39.0119, lon: -98.4842 },
  'Kentucky': { lat: 37.8393, lon: -84.2700 },
  'Louisiana': { lat: 30.9843, lon: -91.9623 },
  'Maine': { lat: 45.2538, lon: -69.4455 },
  'Maryland': { lat: 39.0458, lon: -76.6413 },
  'Massachusetts': { lat: 42.4072, lon: -71.3824 },
  'Michigan': { lat: 44.3148, lon: -85.6024 },
  'Minnesota': { lat: 46.7296, lon: -94.6859 },
  'Mississippi': { lat: 32.3547, lon: -89.3985 },
  'Missouri': { lat: 37.9643, lon: -91.8318 },
  'Montana': { lat: 46.8797, lon: -110.3626 },
  'Nebraska': { lat: 41.4925, lon: -99.9018 },
  'Nevada': { lat: 38.8026, lon: -116.4194 },
  'New Hampshire': { lat: 43.1939, lon: -71.5724 },
  'New Jersey': { lat: 40.0583, lon: -74.4057 },
  'New Mexico': { lat: 34.5199, lon: -105.8701 },
  'New York': { lat: 43.2994, lon: -74.2179 },
  'New York City': { lat: 40.7128, lon: -74.0060 },
  'North Carolina': { lat: 35.7596, lon: -79.0193 },
  'North Dakota': { lat: 47.5515, lon: -101.0020 },
  'Ohio': { lat: 40.4173, lon: -82.9071 },
  'Oklahoma': { lat: 35.0078, lon: -97.0929 },
  'Oregon': { lat: 43.8041, lon: -120.5542 },
  'Pennsylvania': { lat: 41.2033, lon: -77.1945 },
  'Rhode Island': { lat: 41.5801, lon: -71.4774 },
  'South Carolina': { lat: 33.8361, lon: -81.1637 },
  'South Dakota': { lat: 43.9695, lon: -99.9018 },
  'Tennessee': { lat: 35.5175, lon: -86.5804 },
  'Texas': { lat: 31.9686, lon: -99.9018 },
  'Utah': { lat: 39.3210, lon: -111.0937 },
  'Vermont': { lat: 44.5588, lon: -72.5778 },
  'Virginia': { lat: 37.4316, lon: -78.6569 },
  'Washington': { lat: 47.7511, lon: -120.7401 },
  'West Virginia': { lat: 38.5976, lon: -80.4549 },
  'Wisconsin': { lat: 43.7844, lon: -88.7879 },
  'Wyoming': { lat: 43.0759, lon: -107.2903 },
  'Puerto Rico': { lat: 18.2208, lon: -66.5901 },
};

function determineSeverity(diseaseName, cases = 0, source = 'WHO') {
  const d = (diseaseName || '').toLowerCase();
  
  // Critical WHO or high-mortality viral hemorrhagic / respiratory threats
  if (
    d.includes('ebola') ||
    d.includes('marburg') ||
    d.includes('avian influenza') ||
    d.includes('h5n1') ||
    d.includes('h5n5') ||
    d.includes('mers') ||
    d.includes('plague') ||
    d.includes('anthrax') ||
    d.includes('sudan virus') ||
    d.includes('nipah') ||
    d.includes('smallpox') ||
    d.includes('cholera') ||
    d.includes('yellow fever') ||
    d.includes('polio')
  ) {
    return 'critical';
  }

  // High tier: Arboviruses, drug-resistant fungi/bacteria, measles, mpox, high case volume
  if (
    d.includes('dengue') ||
    d.includes('mpox') ||
    d.includes('measles') ||
    d.includes('west nile') ||
    d.includes('candida auris') ||
    d.includes('legionellosis') ||
    d.includes('listeriosis') ||
    d.includes('meningococcal') ||
    d.includes('hantavirus') ||
    d.includes('carbapenemase') ||
    d.includes('cpo') ||
    cases >= 100
  ) {
    return 'high';
  }

  // Moderate tier: Common foodborne, respiratory, and endemic outbreaks with elevated counts
  if (
    d.includes('pertussis') ||
    d.includes('salmonella') ||
    d.includes('campylobacter') ||
    d.includes('coccidioidomycosis') ||
    d.includes('cryptosporidiosis') ||
    d.includes('vibriosis') ||
    d.includes('shigellosis') ||
    cases >= 20
  ) {
    return 'moderate';
  }

  return 'monitoring';
}

function extractLocationFromTitle(title) {
  // Common WHO title patterns: "Disease Name – Country", "Disease Name - Country", "Disease in Country"
  const cleanTitle = title.replace(/\u2013|\u2014/g, '-');
  const parts = cleanTitle.split('-');
  if (parts.length > 1) {
    const locPart = parts[parts.length - 1].trim().toLowerCase();
    // Check if known country or region
    for (const [key, coords] of Object.entries(COUNTRY_COORDINATES)) {
      if (locPart.includes(key)) {
        return coords;
      }
    }
  }

  // Scan full title for known country keys
  const titleLower = cleanTitle.toLowerCase();
  for (const [key, coords] of Object.entries(COUNTRY_COORDINATES)) {
    if (titleLower.includes(key)) {
      return coords;
    }
  }

  return { lat: 10.0, lon: 0.0, country: 'Global / Multi-region' };
}

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWhoOutbreaks() {
  try {
    const d = '$';
    const url = `https://www.who.int/api/news/diseaseoutbreaknews?${d}orderby=PublicationDateAndTime%20desc&${d}top=35`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/2.5 (Health-Surveillance-Proxy)',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[Outbreaks] WHO API returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data.value || [];

    return items.map((item) => {
      const geo = extractLocationFromTitle(item.Title || '');
      const rawSummary = item.Summary || item.Overview || '';
      const summary = cleanHtml(rawSummary).slice(0, 320);
      const urlPath = item.ItemDefaultUrl || item.UrlName || '';
      const fullUrl = urlPath.startsWith('http')
        ? urlPath
        : `https://www.who.int/emergencies/disease-outbreak-news/item${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;

      // Derive disease name from Title
      const titleParts = (item.Title || '').replace(/\u2013|\u2014/g, '-').split('-');
      const disease = titleParts[0].trim();

      const severity = determineSeverity(disease, 0, 'WHO');

      return {
        id: `who-${item.Id || item.UrlName || Math.random().toString(36).substring(2, 9)}`,
        source: 'WHO',
        title: item.Title,
        disease,
        location: geo.country,
        country: geo.country,
        lat: geo.lat,
        lon: geo.lon,
        date: item.PublicationDateAndTime || item.PublicationDate || new Date().toISOString(),
        severity,
        summary: summary || 'Official Disease Outbreak News notification published by the World Health Organization.',
        url: fullUrl,
      };
    });
  } catch (err) {
    console.warn('[Outbreaks] Failed to fetch WHO outbreaks:', err?.message || err);
    return [];
  }
}

async function fetchCdcOutbreaks() {
  try {
    const d = '$';
    const q = "'";
    // Query active weekly infectious disease reports, excluding endemic non-outbreak STDs
    const where = `location1 IS NOT NULL AND m1 > 0 AND year >= ${q}2025${q} AND label NOT LIKE ${q}%Chlamydia%${q} AND label NOT LIKE ${q}%Gonorrhea%${q} AND label NOT LIKE ${q}%Syphilis%${q} AND label NOT LIKE ${q}%chronic%${q}`;
    const url = `https://data.cdc.gov/resource/x9gk-5huc.json?${d}where=${encodeURIComponent(where)}&${d}order=${encodeURIComponent('year DESC, week DESC, m1 DESC')}&${d}limit=60`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WorldMonitor/2.5 (CDC-Socrata-Proxy)',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[Outbreaks] CDC Socrata API returned ${res.status}`);
      return [];
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    return rows.map((r) => {
      const stateName = r.location1 || r.states || 'USA';
      let lat = 39.8283;
      let lon = -98.5795;

      if (r.geocode && Array.isArray(r.geocode.coordinates) && r.geocode.coordinates.length >= 2) {
        lon = Number(r.geocode.coordinates[0]);
        lat = Number(r.geocode.coordinates[1]);
      } else if (US_STATE_COORDS[stateName]) {
        lat = US_STATE_COORDS[stateName].lat;
        lon = US_STATE_COORDS[stateName].lon;
      }

      const weekCases = parseFloat(r.m1) || 0;
      const max52w = parseFloat(r.m2) || 0;
      const ytdCases = parseFloat(r.m3) || 0;
      const diseaseLabel = r.label || 'Infectious Disease';
      const severity = determineSeverity(diseaseLabel, weekCases, 'CDC');

      return {
        id: `cdc-${r.sort_order || `${r.year}-${r.week}-${stateName}-${diseaseLabel}`.replace(/[^a-zA-Z0-9-]/g, '_')}`,
        source: 'CDC',
        title: `${diseaseLabel} – ${stateName}`,
        disease: diseaseLabel,
        location: `${stateName}, USA`,
        country: 'United States',
        lat,
        lon,
        date: new Date(Date.now() - (r.week ? (45 - Number(r.week)) * 7 * 86400000 : 0)).toISOString(),
        cases: weekCases,
        max52wCases: max52w,
        ytdCases: ytdCases,
        severity,
        summary: `CDC NNDSS weekly surveillance report for MMWR Week ${r.week || 'latest'}, ${r.year || '2026'}. Registered ${weekCases.toLocaleString()} new confirmed/probable cases (YTD: ${ytdCases.toLocaleString()}, 52-week max: ${max52w.toLocaleString()}).`,
        url: 'https://data.cdc.gov/resource/x9gk-5huc',
      };
    });
  } catch (err) {
    console.warn('[Outbreaks] Failed to fetch CDC outbreaks:', err?.message || err);
    return [];
  }
}

// Fallback baseline in case external network is unreachable
const BASELINE_OUTBREAKS = [
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
    summary: 'The National International Health Regulations (IHR) Focal Point of the State of Qatar notified WHO of a confirmed case of MERS-CoV infection with camel contact history.',
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
    summary: 'CDC NNDSS surveillance report for Tennessee. Unusual healthcare cluster spike exceeding previous 52-week max.',
    url: 'https://data.cdc.gov/resource/x9gk-5huc',
  },
];

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    const now = Date.now();

    // 1. Check in-memory edge cache
    if (!forceRefresh && cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800, s-maxage=3600',
          'X-Cache': 'HIT-MEMORY',
          ...corsHeaders,
        },
      });
    }

    // 2. Check Upstash Redis cache
    const redis = getRedis();
    if (!forceRefresh && redis) {
      try {
        const fromRedis = await redis.get(REDIS_KEY);
        if (fromRedis && Array.isArray(fromRedis.outbreaks) && fromRedis.outbreaks.length > 0) {
          cachedData = fromRedis;
          cacheTimestamp = now;
          return new Response(JSON.stringify(fromRedis), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=1800, s-maxage=3600',
              'X-Cache': 'HIT-REDIS',
              ...corsHeaders,
            },
          });
        }
      } catch (err) {
        console.warn('[Outbreaks] Redis get error:', err?.message || err);
      }
    }

    // 3. Deduplicate in-flight upstream fetches
    if (!inFlightFetch) {
      inFlightFetch = (async () => {
        const [whoOutbreaks, cdcOutbreaks] = await Promise.all([
          fetchWhoOutbreaks(),
          fetchCdcOutbreaks(),
        ]);

        let combined = [...whoOutbreaks, ...cdcOutbreaks];

        if (combined.length === 0) {
          combined = BASELINE_OUTBREAKS;
        }

        // Sort: Critical first, then high, moderate, monitoring; then by date descending
        const severityRank = { critical: 4, high: 3, moderate: 2, monitoring: 1 };
        combined.sort((a, b) => {
          const rankDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
          if (rankDiff !== 0) return rankDiff;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        const payload = {
          updatedAt: new Date().toISOString(),
          totalCount: combined.length,
          whoCount: whoOutbreaks.length,
          cdcCount: cdcOutbreaks.length,
          outbreaks: combined,
        };

        cachedData = payload;
        cacheTimestamp = Date.now();

        if (redis) {
          await redis.setex(REDIS_KEY, REDIS_TTL_SECONDS, payload).catch(() => {});
        }

        return payload;
      })().finally(() => {
        inFlightFetch = null;
      });
    }

    const result = await inFlightFetch;

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'X-Cache': 'MISS',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Outbreaks] Handler error:', error);
    return new Response(JSON.stringify({
      updatedAt: new Date().toISOString(),
      totalCount: BASELINE_OUTBREAKS.length,
      whoCount: 5,
      cdcCount: 4,
      outbreaks: BASELINE_OUTBREAKS,
      fallback: true,
      error: error?.message || String(error),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        ...corsHeaders,
      },
    });
  }
}
