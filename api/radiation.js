import { Redis } from '@upstash/redis/cloudflare';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// In-memory cache for edge runtime (6 hours TTL to reduce upstream rate limits)
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// In-flight request deduplication to prevent stampedes
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

const REDIS_KEY = 'wm:radiation:stations:v6';
const REDIS_TTL_SECONDS = 6 * 60 * 60; // 6 hours

const BFS_TARGET_CITIES = [
  { id: 'bfs-berlin', name: 'Berlin', city: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050, defaultDose: 75 },
  { id: 'bfs-munich', name: 'Munich', city: 'Munich', country: 'Germany', lat: 48.1351, lon: 11.5820, defaultDose: 103 },
  { id: 'bfs-hamburg', name: 'Hamburg', city: 'Hamburg', country: 'Germany', lat: 53.5511, lon: 9.9937, defaultDose: 97 },
  { id: 'bfs-frankfurt', name: 'Frankfurt', city: 'Frankfurt', country: 'Germany', lat: 50.1109, lon: 8.6821, defaultDose: 113 },
  { id: 'bfs-cologne', name: 'Cologne', city: 'Cologne', country: 'Germany', lat: 50.9375, lon: 6.9603, defaultDose: 104 },
  { id: 'bfs-stuttgart', name: 'Stuttgart', city: 'Stuttgart', country: 'Germany', lat: 48.7758, lon: 9.1829, defaultDose: 130 },
  { id: 'bfs-leipzig', name: 'Leipzig', city: 'Leipzig', country: 'Germany', lat: 51.3397, lon: 12.3731, defaultDose: 110 },
  { id: 'bfs-dresden', name: 'Dresden', city: 'Dresden', country: 'Germany', lat: 51.0504, lon: 13.7373, defaultDose: 151 },
  { id: 'bfs-nuremberg', name: 'Nuremberg', city: 'Nuremberg', country: 'Germany', lat: 49.4521, lon: 11.0767, defaultDose: 118 },
  { id: 'bfs-hanover', name: 'Hanover', city: 'Hanover', country: 'Germany', lat: 52.3759, lon: 9.7320, defaultDose: 86 },
  { id: 'bfs-aachen', name: 'Aachen (West Border)', city: 'Aachen', country: 'Germany', lat: 50.7753, lon: 6.0839, defaultDose: 100 },
  { id: 'bfs-freiburg', name: 'Freiburg (South Border)', city: 'Freiburg', country: 'Germany', lat: 47.9990, lon: 7.8522, defaultDose: 136 },
  { id: 'bfs-passau', name: 'Passau (Austria Border)', city: 'Passau', country: 'Germany', lat: 48.5667, lon: 13.4319, defaultDose: 134 },
  { id: 'bfs-flensburg', name: 'Flensburg (North Border)', city: 'Flensburg', country: 'Germany', lat: 54.7877, lon: 9.4357, defaultDose: 85 }
];

const EPA_STATIONS = [
  // Northeast
  { id: 'radnet-dc-washington', name: 'Washington, DC', city: 'Washington', state: 'DC', epaCity: 'WASHINGTON', lat: 38.9072, lon: -77.0369, defaultCpm: 887, defaultDose: 27 },
  { id: 'radnet-ma-boston', name: 'Boston, MA', city: 'Boston', state: 'MA', epaCity: 'BOSTON', lat: 42.3601, lon: -71.0589, defaultCpm: 2322, defaultDose: 63 },
  { id: 'radnet-ny-albany', name: 'Albany, NY', city: 'Albany', state: 'NY', epaCity: 'ALBANY', lat: 42.6526, lon: -73.7562, defaultCpm: 1315, defaultDose: 47 },
  { id: 'radnet-ny-buffalo', name: 'Buffalo, NY', city: 'Buffalo', state: 'NY', epaCity: 'BUFFALO', lat: 42.8864, lon: -78.8784, defaultCpm: 1579, defaultDose: 44 },
  { id: 'radnet-ny-rochester', name: 'Rochester, NY', city: 'Rochester', state: 'NY', epaCity: 'ROCHESTER', lat: 43.1566, lon: -77.6088, defaultCpm: 2145, defaultDose: 62 },
  { id: 'radnet-ny-syracuse', name: 'Syracuse, NY', city: 'Syracuse', state: 'NY', epaCity: 'SYRACUSE', lat: 43.0481, lon: -76.1474, defaultCpm: 1203, defaultDose: 39 },
  { id: 'radnet-pa-philadelphia', name: 'Philadelphia, PA', city: 'Philadelphia', state: 'PA', epaCity: 'PHILADELPHIA', lat: 39.9526, lon: -75.1652, defaultCpm: 1529, defaultDose: 42 },
  { id: 'radnet-pa-pittsburgh', name: 'Pittsburgh, PA', city: 'Pittsburgh', state: 'PA', epaCity: 'PITTSBURGH', lat: 40.4406, lon: -79.9959, defaultCpm: 2124, defaultDose: 62 },
  { id: 'radnet-ct-hartford', name: 'Hartford, CT', city: 'Hartford', state: 'CT', epaCity: 'HARTFORD', lat: 41.7658, lon: -72.6734, defaultCpm: 2339, defaultDose: 55 },
  { id: 'radnet-ri-providence', name: 'Providence, RI', city: 'Providence', state: 'RI', epaCity: 'PROVIDENCE', lat: 41.8240, lon: -71.4128, defaultCpm: 2481, defaultDose: 58 },
  { id: 'radnet-md-baltimore', name: 'Baltimore, MD', city: 'Baltimore', state: 'MD', epaCity: 'BALTIMORE', lat: 39.2904, lon: -76.6122, defaultCpm: 1042, defaultDose: 32 },

  // Southeast
  { id: 'radnet-ga-atlanta', name: 'Atlanta, GA', city: 'Atlanta', state: 'GA', epaCity: 'ATLANTA', lat: 33.7490, lon: -84.3880, defaultCpm: 2781, defaultDose: 71 },
  { id: 'radnet-fl-miami', name: 'Miami, FL', city: 'Miami', state: 'FL', epaCity: 'MIAMI', lat: 25.7617, lon: -80.1918, defaultCpm: 1479, defaultDose: 49 },
  { id: 'radnet-fl-orlando', name: 'Orlando, FL', city: 'Orlando', state: 'FL', epaCity: 'ORLANDO', lat: 28.5383, lon: -81.3792, defaultCpm: 990, defaultDose: 29 },
  { id: 'radnet-fl-tampa', name: 'Tampa, FL', city: 'Tampa', state: 'FL', epaCity: 'TAMPA', lat: 27.9506, lon: -82.4572, defaultCpm: 923, defaultDose: 31 },
  { id: 'radnet-fl-jacksonville', name: 'Jacksonville, FL', city: 'Jacksonville', state: 'FL', epaCity: 'JACKSONVILLE', lat: 30.3322, lon: -81.6557, defaultCpm: 1127, defaultDose: 35 },
  { id: 'radnet-nc-charlotte', name: 'Charlotte, NC', city: 'Charlotte', state: 'NC', epaCity: 'CHARLOTTE', lat: 35.2271, lon: -80.8431, defaultCpm: 940, defaultDose: 37 },
  { id: 'radnet-nc-raleigh', name: 'Raleigh, NC', city: 'Raleigh', state: 'NC', epaCity: 'RALEIGH', lat: 35.7796, lon: -78.6382, defaultCpm: 3855, defaultDose: 98 },
  { id: 'radnet-tn-memphis', name: 'Memphis, TN', city: 'Memphis', state: 'TN', epaCity: 'MEMPHIS', lat: 35.1495, lon: -90.0490, defaultCpm: 2343, defaultDose: 60 },
  { id: 'radnet-tn-knoxville', name: 'Knoxville, TN', city: 'Knoxville', state: 'TN', epaCity: 'KNOXVILLE', lat: 35.9606, lon: -83.9207, defaultCpm: 1649, defaultDose: 49 },
  { id: 'radnet-tn-nashville', name: 'Nashville, TN', city: 'Nashville', state: 'TN', epaCity: 'NASHVILLE', lat: 36.1627, lon: -86.7816, defaultCpm: 983, defaultDose: 62 },
  { id: 'radnet-la-batonrouge', name: 'Baton Rouge, LA', city: 'Baton Rouge', state: 'LA', epaCity: 'BATON ROUGE', lat: 30.4515, lon: -91.1871, defaultCpm: 1514, defaultDose: 43 },

  // Midwest
  { id: 'radnet-il-chicago', name: 'Chicago, IL', city: 'Chicago', state: 'IL', epaCity: 'CHICAGO', lat: 41.8781, lon: -87.6298, defaultCpm: 1154, defaultDose: 40 },
  { id: 'radnet-mi-detroit', name: 'Detroit, MI', city: 'Detroit', state: 'MI', epaCity: 'DETROIT', lat: 42.3314, lon: -83.0458, defaultCpm: 1637, defaultDose: 50 },
  { id: 'radnet-in-indianapolis', name: 'Indianapolis, IN', city: 'Indianapolis', state: 'IN', epaCity: 'INDIANAPOLIS', lat: 39.7684, lon: -86.1581, defaultCpm: 1792, defaultDose: 47 },
  { id: 'radnet-oh-columbus', name: 'Columbus, OH', city: 'Columbus', state: 'OH', epaCity: 'COLUMBUS', lat: 39.9612, lon: -82.9988, defaultCpm: 1776, defaultDose: 45 },
  { id: 'radnet-oh-cleveland', name: 'Cleveland, OH', city: 'Cleveland', state: 'OH', epaCity: 'CLEVELAND', lat: 41.4993, lon: -81.6944, defaultCpm: 1388, defaultDose: 40 },
  { id: 'radnet-oh-cincinnati', name: 'Cincinnati, OH', city: 'Cincinnati', state: 'OH', epaCity: 'CINCINNATI', lat: 39.1031, lon: -84.5120, defaultCpm: 1393, defaultDose: 43 },
  { id: 'radnet-wi-milwaukee', name: 'Milwaukee, WI', city: 'Milwaukee', state: 'WI', epaCity: 'MILWAUKEE', lat: 43.0389, lon: -87.9065, defaultCpm: 1236, defaultDose: 43 },
  { id: 'radnet-wi-madison', name: 'Madison, WI', city: 'Madison', state: 'WI', epaCity: 'MADISON', lat: 43.0731, lon: -89.4012, defaultCpm: 1519, defaultDose: 50 },
  { id: 'radnet-mn-stpaul', name: 'St. Paul, MN', city: 'St. Paul', state: 'MN', epaCity: 'ST. PAUL', lat: 44.9537, lon: -93.0900, defaultCpm: 2064, defaultDose: 54 },
  { id: 'radnet-mn-duluth', name: 'Duluth, MN', city: 'Duluth', state: 'MN', epaCity: 'DULUTH', lat: 46.7867, lon: -92.1005, defaultCpm: 2196, defaultDose: 59 },
  { id: 'radnet-mo-stlouis', name: 'St. Louis, MO', city: 'St. Louis', state: 'MO', epaCity: 'ST. LOUIS', lat: 38.6270, lon: -90.1994, defaultCpm: 1326, defaultDose: 43 },
  { id: 'radnet-ia-desmoines', name: 'Des Moines, IA', city: 'Des Moines', state: 'IA', epaCity: 'DES MOINES', lat: 41.5868, lon: -93.6250, defaultCpm: 1727, defaultDose: 49 },
  { id: 'radnet-ne-omaha', name: 'Omaha, NE', city: 'Omaha', state: 'NE', epaCity: 'OMAHA', lat: 41.2565, lon: -95.9345, defaultCpm: 1955, defaultDose: 57 },

  // South & Southwest
  { id: 'radnet-tx-houston', name: 'Houston, TX', city: 'Houston', state: 'TX', epaCity: 'HOUSTON', lat: 29.7604, lon: -95.3698, defaultCpm: 1473, defaultDose: 41 },
  { id: 'radnet-tx-austin', name: 'Austin, TX', city: 'Austin', state: 'TX', epaCity: 'AUSTIN', lat: 30.2672, lon: -97.7431, defaultCpm: 1336, defaultDose: 43 },
  { id: 'radnet-tx-elpaso', name: 'El Paso, TX', city: 'El Paso', state: 'TX', epaCity: 'EL PASO', lat: 31.7619, lon: -106.4850, defaultCpm: 2182, defaultDose: 74 },
  { id: 'radnet-az-phoenix', name: 'Phoenix, AZ', city: 'Phoenix', state: 'AZ', epaCity: 'PHOENIX', lat: 33.4484, lon: -112.0740, defaultCpm: 2857, defaultDose: 86 },
  { id: 'radnet-nv-lasvegas', name: 'Las Vegas, NV', city: 'Las Vegas', state: 'NV', epaCity: 'LAS VEGAS', lat: 36.1699, lon: -115.1398, defaultCpm: 1524, defaultDose: 52 },
  { id: 'radnet-nm-albuquerque', name: 'Albuquerque, NM', city: 'Albuquerque', state: 'NM', epaCity: 'ALBUQUERQUE', lat: 35.0844, lon: -106.6504, defaultCpm: 2275, defaultDose: 82 },
  { id: 'radnet-ok-oklahomacity', name: 'Oklahoma City, OK', city: 'Oklahoma City', state: 'OK', epaCity: 'OKLAHOMA CITY', lat: 35.4676, lon: -97.5164, defaultCpm: 2406, defaultDose: 63 },
  { id: 'radnet-ok-tulsa', name: 'Tulsa, OK', city: 'Tulsa', state: 'OK', epaCity: 'TULSA', lat: 36.1540, lon: -95.9928, defaultCpm: 1961, defaultDose: 56 },
  { id: 'radnet-ar-littlerock', name: 'Little Rock, AR', city: 'Little Rock', state: 'AR', epaCity: 'LITTLE ROCK', lat: 34.7465, lon: -92.2896, defaultCpm: 3650, defaultDose: 83 },

  // West
  { id: 'radnet-ca-losangeles', name: 'Los Angeles, CA', city: 'Los Angeles', state: 'CA', epaCity: 'LOS ANGELES', lat: 34.0522, lon: -118.2437, defaultCpm: 3012, defaultDose: 74 },
  { id: 'radnet-ca-sanfrancisco', name: 'San Francisco, CA', city: 'San Francisco', state: 'CA', epaCity: 'SAN FRANCISCO', lat: 37.7749, lon: -122.4194, defaultCpm: 774, defaultDose: 28 },
  { id: 'radnet-ca-sandiego', name: 'San Diego, CA', city: 'San Diego', state: 'CA', epaCity: 'SAN DIEGO', lat: 32.7157, lon: -117.1611, defaultCpm: 3726, defaultDose: 94 },
  { id: 'radnet-ca-sacramento', name: 'Sacramento, CA', city: 'Sacramento', state: 'CA', epaCity: 'SACRAMENTO', lat: 38.5816, lon: -121.4944, defaultCpm: 924, defaultDose: 33 },
  { id: 'radnet-wa-seattle', name: 'Seattle, WA', city: 'Seattle', state: 'WA', epaCity: 'SEATTLE', lat: 47.6062, lon: -122.3321, defaultCpm: 605, defaultDose: 26 },
  { id: 'radnet-wa-spokane', name: 'Spokane, WA', city: 'Spokane', state: 'WA', epaCity: 'SPOKANE', lat: 47.6588, lon: -117.4260, defaultCpm: 3002, defaultDose: 88 },
  { id: 'radnet-or-portland', name: 'Portland, OR', city: 'Portland', state: 'OR', epaCity: 'PORTLAND', lat: 45.5152, lon: -122.6784, defaultCpm: 1418, defaultDose: 42 },
  { id: 'radnet-co-denver', name: 'Denver, CO', city: 'Denver', state: 'CO', epaCity: 'DENVER', lat: 39.7392, lon: -104.9903, defaultCpm: 2733, defaultDose: 85 },
  { id: 'radnet-ut-saltlakecity', name: 'Salt Lake City, UT', city: 'Salt Lake City', state: 'UT', epaCity: 'SALT LAKE CITY', lat: 40.7608, lon: -111.8910, defaultCpm: 1398, defaultDose: 64 },
  { id: 'radnet-id-boise', name: 'Boise, ID', city: 'Boise', state: 'ID', epaCity: 'BOISE', lat: 43.6150, lon: -116.2023, defaultCpm: 3096, defaultDose: 80 },
  { id: 'radnet-hi-honolulu', name: 'Honolulu, HI', city: 'Honolulu', state: 'HI', epaCity: 'HONOLULU', lat: 21.3069, lon: -157.8583, defaultCpm: 624, defaultDose: 28 },
  { id: 'radnet-ak-anchorage', name: 'Anchorage, AK', city: 'Anchorage', state: 'AK', epaCity: 'ANCHORAGE', lat: 61.2181, lon: -149.9003, defaultCpm: 767, defaultDose: 37 }
];

const SAFECAST_STATIONS = [
  // Exclusion & Vicinity Zones
  { id: 'safecast-chernobyl', name: 'Chernobyl Exclusion Zone', city: 'Pripyat / Chernobyl', country: 'Ukraine', lat: 51.389, lon: 30.099, defaultCpm: 50, defaultDose: 150, status: 'elevated' },
  { id: 'safecast-fukushima', name: 'Fukushima Daiichi Vicinity', city: 'Okuma / Fukushima', country: 'Japan', lat: 37.4214, lon: 141.0326, defaultCpm: 41, defaultDose: 123, status: 'normal' },

  // Europe - Major Metropolitan Centers
  { id: 'safecast-london', name: 'London', city: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278, defaultCpm: 16, defaultDose: 48, status: 'normal' },
  { id: 'safecast-paris', name: 'Paris', city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, defaultCpm: 25, defaultDose: 75, status: 'normal' },
  { id: 'safecast-madrid', name: 'Madrid', city: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038, defaultCpm: 45, defaultDose: 135, status: 'normal' },
  { id: 'safecast-rome', name: 'Rome', city: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964, defaultCpm: 55, defaultDose: 165, status: 'normal' },
  { id: 'safecast-kyiv', name: 'Kyiv', city: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234, defaultCpm: 22, defaultDose: 66, status: 'normal' },
  { id: 'safecast-warsaw', name: 'Warsaw', city: 'Warsaw', country: 'Poland', lat: 52.2297, lon: 21.0122, defaultCpm: 25, defaultDose: 75, status: 'normal' },
  { id: 'safecast-vienna', name: 'Vienna', city: 'Vienna', country: 'Austria', lat: 48.2082, lon: 16.3738, defaultCpm: 28, defaultDose: 84, status: 'normal' },
  { id: 'safecast-amsterdam', name: 'Amsterdam', city: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lon: 4.9041, defaultCpm: 24, defaultDose: 72, status: 'normal' },
  { id: 'safecast-stockholm', name: 'Stockholm', city: 'Stockholm', country: 'Sweden', lat: 59.3293, lon: 18.0686, defaultCpm: 35, defaultDose: 105, status: 'normal' },
  { id: 'safecast-prague', name: 'Prague', city: 'Prague', country: 'Czechia', lat: 50.0755, lon: 14.4378, defaultCpm: 25, defaultDose: 75, status: 'normal' },
  { id: 'safecast-brussels', name: 'Brussels', city: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517, defaultCpm: 22, defaultDose: 66, status: 'normal' },

  // Asia - Major Metropolitan Centers
  { id: 'safecast-tokyo', name: 'Tokyo', city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, defaultCpm: 15, defaultDose: 45, status: 'normal' },
  { id: 'safecast-osaka', name: 'Osaka', city: 'Osaka', country: 'Japan', lat: 34.6937, lon: 135.5023, defaultCpm: 20, defaultDose: 60, status: 'normal' },
  { id: 'safecast-seoul', name: 'Seoul', city: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.9780, defaultCpm: 32, defaultDose: 96, status: 'normal' },
  { id: 'safecast-taipei', name: 'Taipei', city: 'Taipei', country: 'Taiwan', lat: 25.0330, lon: 121.5654, defaultCpm: 38, defaultDose: 114, status: 'normal' },
  { id: 'safecast-hongkong', name: 'Hong Kong', city: 'Hong Kong', country: 'China', lat: 22.3193, lon: 114.1694, defaultCpm: 45, defaultDose: 135, status: 'normal' },
  { id: 'safecast-beijing', name: 'Beijing', city: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074, defaultCpm: 25, defaultDose: 75, status: 'normal' },
  { id: 'safecast-shanghai', name: 'Shanghai', city: 'Shanghai', country: 'China', lat: 31.2304, lon: 121.4737, defaultCpm: 24, defaultDose: 72, status: 'normal' },
  { id: 'safecast-singapore', name: 'Singapore', city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, defaultCpm: 30, defaultDose: 90, status: 'normal' },
  { id: 'safecast-bangkok', name: 'Bangkok', city: 'Bangkok', country: 'Thailand', lat: 13.7563, lon: 100.5018, defaultCpm: 22, defaultDose: 66, status: 'normal' },
  { id: 'safecast-newdelhi', name: 'New Delhi', city: 'New Delhi', country: 'India', lat: 28.6139, lon: 77.2090, defaultCpm: 30, defaultDose: 90, status: 'normal' },

  // Middle East - Major Metropolitan Centers
  { id: 'safecast-istanbul', name: 'Istanbul', city: 'Istanbul', country: 'Turkey', lat: 41.0082, lon: 28.9784, defaultCpm: 26, defaultDose: 78, status: 'normal' },
  { id: 'safecast-ankara', name: 'Ankara', city: 'Ankara', country: 'Turkey', lat: 39.9334, lon: 32.8597, defaultCpm: 28, defaultDose: 84, status: 'normal' },
  { id: 'safecast-dubai', name: 'Dubai', city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708, defaultCpm: 35, defaultDose: 105, status: 'normal' },
  { id: 'safecast-abudhabi', name: 'Abu Dhabi', city: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4539, lon: 54.3773, defaultCpm: 32, defaultDose: 96, status: 'normal' },
  { id: 'safecast-riyadh', name: 'Riyadh', city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, defaultCpm: 30, defaultDose: 90, status: 'normal' },
  { id: 'safecast-telaviv', name: 'Tel Aviv', city: 'Tel Aviv', country: 'Israel', lat: 32.0853, lon: 34.7818, defaultCpm: 28, defaultDose: 84, status: 'normal' },
  { id: 'safecast-jerusalem', name: 'Jerusalem', city: 'Jerusalem', country: 'Israel', lat: 31.7683, lon: 35.2137, defaultCpm: 30, defaultDose: 90, status: 'normal' },
  { id: 'safecast-doha', name: 'Doha', city: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.5310, defaultCpm: 30, defaultDose: 90, status: 'normal' },
  { id: 'safecast-kuwaitcity', name: 'Kuwait City', city: 'Kuwait City', country: 'Kuwait', lat: 29.3759, lon: 47.9774, defaultCpm: 28, defaultDose: 84, status: 'normal' },
  { id: 'safecast-amman', name: 'Amman', city: 'Amman', country: 'Jordan', lat: 31.9454, lon: 35.9284, defaultCpm: 28, defaultDose: 84, status: 'normal' },
];

function classifyStatus(doseRate, cpm) {
  // Global radiological safety standards (ICRP / EPA / IAEA):
  // Normal natural background: < 200 nSv/h (< 0.20 µSv/h, or < 65 GM CPM)
  // Elevated (e.g. exclusion borders / high altitude): 200 - 500 nSv/h (65 - 165 GM CPM)
  // High / Radiation Warning: > 500 nSv/h (> 0.50 µSv/h, or > 165 GM CPM)
  if (doseRate != null && doseRate > 0) {
    if (doseRate >= 500) return 'high';
    if (doseRate >= 200) return 'elevated';
    return 'normal';
  }
  if (cpm >= 165) return 'high';
  if (cpm >= 65) return 'elevated';
  return 'normal';
}

async function fetchEpaStation(station, year) {
  const url = `https://radnet.epa.gov/cdx-radnet-rest/api/rest/csv/${year}/fixed/${station.state}/${encodeURIComponent(station.epaCity)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return null;
    const lastLine = lines[lines.length - 1];
    const parts = lastLine.split(',');
    const doseRate = parseFloat(parts[2]) || null;
    const rawCpm = parseFloat(parts[3]) || null;
    const time = parts[1] || '';
    if (rawCpm == null && doseRate == null) return null;

    const finalRawCpm = rawCpm != null ? Math.round(rawCpm) : station.defaultCpm;
    const finalDose = doseRate != null ? Math.round(doseRate) : station.defaultDose;

    // Standard Geiger-Müller (GM/Safecast equivalent) CPM:
    // EPA RadNet uses a high-volume 2"x2" NaI(Tl) scintillation crystal pulling air through a filter,
    // which generates 700-3,500 raw counts/min in clean background.
    // Standard GM pancake tube calibration: 1 µSv/h (1,000 nSv/h) ≈ 334 CPM (or ~3 nSv/h per CPM).
    // Normalizing allows direct, scientifically sound cross-comparison with Safecast.
    const gmCpm = Math.max(1, Math.round(finalDose / 3.0));

    return {
      id: station.id,
      name: station.name,
      city: station.city,
      state: station.state,
      country: 'United States',
      lat: station.lat,
      lon: station.lon,
      cpm: gmCpm,
      rawCpm: finalRawCpm,
      doseRate: finalDose,
      unit: 'CPM',
      status: classifyStatus(finalDose, gmCpm),
      time: (() => {
        if (!time) return new Date().toISOString();
        const parsed = new Date(time).getTime();
        return !isNaN(parsed) && parsed >= Date.now() - 60 * 86400 * 1000 ? time : new Date().toISOString();
      })(),
      source: 'EPA RadNet (Envirofacts)',
      detectorType: 'NaI(Tl) Scintillator (EPA RadNet)',
    };
  } catch {
    return null;
  }
}

async function fetchBfsStations() {
  const url = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.features)) return null;

    const validFeatures = data.features.filter(f => f.properties && f.properties.value != null && f.properties.value > 0);
    if (validFeatures.length === 0) return null;

    const matchedStations = [];
    for (const city of BFS_TARGET_CITIES) {
      let nearest = null;
      let minDistance = Infinity;
      for (const feat of validFeatures) {
        const [flon, flat] = feat.geometry?.coordinates || [];
        if (flon != null && flat != null) {
          const dist = Math.hypot(flon - city.lon, flat - city.lat);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = feat;
          }
        }
      }

      if (nearest && minDistance < 0.6) {
        const valDose = Math.round(nearest.properties.value * 1000); // µSv/h -> nSv/h
        const gmCpm = Math.max(1, Math.round(valDose / 3.0));
        matchedStations.push({
          id: city.id,
          name: city.name,
          city: city.city,
          country: city.country,
          lat: nearest.geometry.coordinates[1],
          lon: nearest.geometry.coordinates[0],
          cpm: gmCpm,
          rawCpm: gmCpm,
          doseRate: valDose,
          unit: 'CPM',
          status: classifyStatus(valDose, gmCpm),
          time: nearest.properties.end_measure || new Date().toISOString(),
          source: 'BfS ODL-Messnetz (Germany / EU)',
          detectorType: 'Gamma-ODL Probe (BfS / ODL)',
        });
      }
    }
    return matchedStations.length > 0 ? matchedStations : null;
  } catch (err) {
    console.warn('[BfS Fetch error]', err?.message || err);
    return null;
  }
}

async function fetchSafecastStation(station, apiKey) {
  const fallback = {
    id: station.id,
    name: station.name,
    city: station.city,
    country: station.country,
    lat: station.lat,
    lon: station.lon,
    cpm: station.defaultCpm,
    rawCpm: station.defaultCpm,
    doseRate: station.defaultDose,
    unit: 'CPM',
    status: station.status || classifyStatus(station.defaultDose, station.defaultCpm),
    time: new Date().toISOString(),
    source: 'Safecast Open Radiation Network',
    detectorType: 'Calibrated Background Baseline (Safecast)',
  };

  const headers = { 'Accept': 'application/json' };
  if (apiKey) {
    headers['X-API-KEY'] = apiKey;
  }
  const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : '';

  try {
    const now = Date.now();
    const tomorrow = new Date(now + 86400 * 1000).toISOString().split('T')[0];
    const days14 = new Date(now - 14 * 86400 * 1000).toISOString().split('T')[0];
    const days60 = new Date(now - 60 * 86400 * 1000).toISOString().split('T')[0];

    let items = null;
    for (const after of [days14, days60]) {
      const url = `https://api.safecast.org/measurements.json?distance=75000&latitude=${station.lat}&longitude=${station.lon}&unit=cpm&captured_after=${after}&captured_before=${tomorrow}${apiKeyParam}&per_page=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const maxFuture = now + 86400 * 1000;
          const minPast = now - 65 * 86400 * 1000;
          const valid = raw.filter(x => {
            const t = new Date(x.captured_at).getTime();
            return !isNaN(t) && t >= minPast && t <= maxFuture;
          });
          if (valid.length > 0) {
            valid.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
            items = valid;
            break;
          }
        }
      }
    }

    if (!items || items.length === 0) {
      return fallback;
    }

    const top = items[0];
    const rawVal = parseFloat(top.value);
    const cpm = Number.isFinite(rawVal) && rawVal >= 0 ? Math.round(rawVal) : station.defaultCpm;
    // Standard calibration for pancake GM tube (LND 7317 / Safecast): 1 CPM ≈ 3 nSv/h
    const doseRate = Math.round(cpm * 3);
    const status = station.id === 'safecast-chernobyl' && doseRate >= 150 ? 'elevated' : classifyStatus(doseRate, cpm);

    return {
      id: station.id,
      name: station.name,
      city: station.city,
      country: station.country,
      lat: top.latitude ? parseFloat(top.latitude) : station.lat,
      lon: top.longitude ? parseFloat(top.longitude) : station.lon,
      cpm,
      rawCpm: cpm,
      doseRate,
      unit: 'CPM',
      status,
      time: top.captured_at,
      source: 'Safecast Open Radiation Network',
      detectorType: top.devicetype_id ? `Safecast (${top.devicetype_id})` : 'Geiger-Müller Tube (Safecast)',
    };
  } catch {
    return fallback;
  }
}

// Retain explicit helpers for Chernobyl and Fukushima
async function fetchChernobyl(apiKey) {
  const station = SAFECAST_STATIONS.find(s => s.id === 'safecast-chernobyl');
  return fetchSafecastStation(station, apiKey);
}

async function fetchFukushima(apiKey) {
  const station = SAFECAST_STATIONS.find(s => s.id === 'safecast-fukushima');
  return fetchSafecastStation(station, apiKey);
}

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

  const url = new URL(req.url);
  const bypassCache = url.searchParams.get('refresh') === 'true' ||
                      url.searchParams.get('clear') === 'true' ||
                      req.headers.get('cache-control')?.includes('no-cache');

  if (bypassCache) {
    cachedData = null;
    cacheTimestamp = 0;
  }

  const now = Date.now();

  // 1. Check in-memory cache (6 hours)
  if (!bypassCache && cachedData && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return new Response(JSON.stringify(cachedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=43200',
        ...corsHeaders,
      },
    });
  }

  // 2. Check Upstash Redis cache (6 hours)
  if (!bypassCache) {
    try {
      const redis = getRedis();
      if (redis) {
        const redisCached = await redis.get(REDIS_KEY);
        if (redisCached && Array.isArray(redisCached) && redisCached.length > 0) {
          cachedData = redisCached;
          cacheTimestamp = now;
          return new Response(JSON.stringify(redisCached), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=43200',
              ...corsHeaders,
            },
          });
        }
      }
    } catch (err) {
      console.warn('[Radiation Handler] Redis GET error:', err?.message || err);
    }
  }

  // 3. Deduplicate in-flight upstream fetches
  if (inFlightFetch) {
    try {
      const sharedData = await inFlightFetch;
      if (sharedData) {
        return new Response(JSON.stringify(sharedData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=43200',
            ...corsHeaders,
          },
        });
      }
    } catch {
      // Fall through to execute new fetch
    }
  }

  inFlightFetch = (async () => {
    const year = new Date().getFullYear();
    const apiKey = process.env.SAFECAST_API_KEY || '';

    // Fetch EPA RadNet stations
    const epaPromises = EPA_STATIONS.map(async (st) => {
      const live = await fetchEpaStation(st, year);
      if (live) return live;
      const gmCpm = Math.max(1, Math.round(st.defaultDose / 3.0));
      return {
        id: st.id,
        name: st.name,
        city: st.city,
        state: st.state,
        country: 'United States',
        lat: st.lat,
        lon: st.lon,
        cpm: gmCpm,
        rawCpm: st.defaultCpm,
        doseRate: st.defaultDose,
        unit: 'CPM',
        status: classifyStatus(st.defaultDose, gmCpm),
        time: new Date().toISOString(),
        source: 'EPA RadNet (Envirofacts)',
        detectorType: 'NaI(Tl) Scintillator (EPA RadNet)',
      };
    });

    // Fetch Safecast stations in batches of 6 to prevent overwhelming upstream
    const safecastResults = [];
    const BATCH_SIZE = 6;
    for (let i = 0; i < SAFECAST_STATIONS.length; i += BATCH_SIZE) {
      const batch = SAFECAST_STATIONS.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(st => fetchSafecastStation(st, apiKey)));
      safecastResults.push(...batchResults);
    }

    const epaResults = await Promise.all(epaPromises);

    // Fetch BfS German & Central European governmental live network
    const bfsLive = await fetchBfsStations();
    const bfsResults = bfsLive || BFS_TARGET_CITIES.map(c => {
      const gmCpm = Math.max(1, Math.round(c.defaultDose / 3.0));
      return {
        id: c.id,
        name: c.name,
        city: c.city,
        country: c.country,
        lat: c.lat,
        lon: c.lon,
        cpm: gmCpm,
        rawCpm: gmCpm,
        doseRate: c.defaultDose,
        unit: 'CPM',
        status: classifyStatus(c.defaultDose, gmCpm),
        time: new Date().toISOString(),
        source: 'BfS ODL-Messnetz (Germany / EU)',
        detectorType: 'Gamma-ODL Probe (BfS / ODL)',
      };
    });

    const combined = [...epaResults, ...bfsResults, ...safecastResults];

    // Store in Redis with 6-hour TTL
    try {
      const redis = getRedis();
      if (redis) {
        redis.setex(REDIS_KEY, REDIS_TTL_SECONDS, combined).catch(() => {});
      }
    } catch (err) {
      console.warn('[Radiation Handler] Redis SET error:', err?.message || err);
    }

    cachedData = combined;
    cacheTimestamp = Date.now();
    return combined;
  })();

  try {
    const results = await inFlightFetch;
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=43200',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Radiation Handler] Error:', error);
    // Baseline fallback
    const fallbackList = [
      ...EPA_STATIONS.map((st) => {
        const gmCpm = Math.max(1, Math.round(st.defaultDose / 3.0));
        return {
          id: st.id,
          name: st.name,
          city: st.city,
          state: st.state,
          country: 'United States',
          lat: st.lat,
          lon: st.lon,
          cpm: gmCpm,
          rawCpm: st.defaultCpm,
          doseRate: st.defaultDose,
          unit: 'CPM',
          status: classifyStatus(st.defaultDose, gmCpm),
          time: new Date().toISOString(),
          source: 'EPA RadNet (Envirofacts)',
          detectorType: 'NaI(Tl) Scintillator (EPA RadNet)',
        };
      }),
      ...BFS_TARGET_CITIES.map(c => {
        const gmCpm = Math.max(1, Math.round(c.defaultDose / 3.0));
        return {
          id: c.id,
          name: c.name,
          city: c.city,
          country: c.country,
          lat: c.lat,
          lon: c.lon,
          cpm: gmCpm,
          rawCpm: gmCpm,
          doseRate: c.defaultDose,
          unit: 'CPM',
          status: classifyStatus(c.defaultDose, gmCpm),
          time: new Date().toISOString(),
          source: 'BfS ODL-Messnetz (Germany / EU)',
          detectorType: 'Gamma-ODL Probe (BfS / ODL)',
        };
      }),
      ...SAFECAST_STATIONS.map((st) => ({
        id: st.id,
        name: st.name,
        city: st.city,
        country: st.country,
        lat: st.lat,
        lon: st.lon,
        cpm: st.defaultCpm,
        rawCpm: st.defaultCpm,
        doseRate: st.defaultDose,
        unit: 'CPM',
        status: st.status || classifyStatus(st.defaultDose, st.defaultCpm),
        time: new Date().toISOString(),
        source: 'Safecast Open Radiation Network',
        detectorType: 'Calibrated Background Baseline (Safecast)',
      })),
    ];

    return new Response(JSON.stringify(fallbackList), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=43200',
        ...corsHeaders,
      },
    });
  } finally {
    inFlightFetch = null;
  }
}

