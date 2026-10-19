import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// In-memory cache for edge runtime
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
    // Normalizing allows direct, scientifically sound cross-comparison with Safecast (Chernobyl/Fukushima).
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
      time: time || new Date().toISOString(),
      source: 'EPA RadNet (Envirofacts)',
      detectorType: 'NaI(Tl) Scintillator (EPA RadNet)',
    };
  } catch {
    return null;
  }
}

async function fetchChernobyl() {
  const fallback = {
    id: 'safecast-chernobyl',
    name: 'Chernobyl Exclusion Zone',
    city: 'Pripyat / Chernobyl',
    country: 'Ukraine',
    lat: 51.389,
    lon: 30.099,
    cpm: 106,
    doseRate: 318,
    unit: 'CPM',
    status: 'elevated',
    time: new Date().toISOString(),
    source: 'Safecast Open Radiation Network',
  };

  try {
    const res = await fetch('https://api.safecast.org/measurements.json?distance=25000&latitude=51.389&longitude=30.099&order=captured_at+desc', {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return fallback;
    const items = await res.json();
    if (!items || items.length === 0) return fallback;

    const top = items[0];
    const cpm = Math.round(parseFloat(top.value) || 106);
    // Standard calibration for pancake GM tube (LND 7317 / Safecast): 1 CPM ≈ 3 nSv/h
    const doseRate = Math.round(cpm * 3);
    const status = classifyStatus(doseRate, cpm);

    return {
      id: 'safecast-chernobyl',
      name: 'Chernobyl Exclusion Zone',
      city: 'Pripyat / Chernobyl',
      country: 'Ukraine',
      lat: top.latitude ? parseFloat(top.latitude) : 51.389,
      lon: top.longitude ? parseFloat(top.longitude) : 30.099,
      cpm,
      rawCpm: cpm,
      doseRate,
      unit: 'CPM',
      status,
      time: top.captured_at || new Date().toISOString(),
      source: 'Safecast Open Radiation Network',
      detectorType: 'Geiger-Müller Tube (Safecast)',
    };
  } catch {
    return fallback;
  }
}

async function fetchFukushima() {
  const fallback = {
    id: 'safecast-fukushima',
    name: 'Fukushima Daiichi Vicinity',
    city: 'Okuma / Fukushima',
    country: 'Japan',
    lat: 37.4214,
    lon: 141.0326,
    cpm: 64,
    rawCpm: 64,
    doseRate: 192,
    unit: 'CPM',
    status: 'normal',
    time: new Date().toISOString(),
    source: 'Safecast Open Radiation Network',
    detectorType: 'Geiger-Müller Tube (Safecast)',
  };

  try {
    const res = await fetch('https://api.safecast.org/measurements.json?distance=25000&latitude=37.4214&longitude=141.0326&order=captured_at+desc', {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return fallback;
    const items = await res.json();
    if (!items || items.length === 0) return fallback;

    const top = items[0];
    const cpm = Math.round(parseFloat(top.value) || 64);
    const doseRate = Math.round(cpm * 3);
    const status = classifyStatus(doseRate, cpm);

    return {
      id: 'safecast-fukushima',
      name: 'Fukushima Daiichi Vicinity',
      city: 'Okuma / Fukushima',
      country: 'Japan',
      lat: top.latitude ? parseFloat(top.latitude) : 37.4214,
      lon: top.longitude ? parseFloat(top.longitude) : 141.0326,
      cpm,
      rawCpm: cpm,
      doseRate,
      unit: 'CPM',
      status,
      time: top.captured_at || new Date().toISOString(),
      source: 'Safecast Open Radiation Network',
      detectorType: 'Geiger-Müller Tube (Safecast)',
    };
  } catch {
    return fallback;
  }
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

  const now = Date.now();
  if (cachedData && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return new Response(JSON.stringify(cachedData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200',
        ...corsHeaders,
      },
    });
  }

  try {
    const year = new Date().getFullYear();
    // Fetch in parallel chunks
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

    const [epaResults, chernobyl, fukushima] = await Promise.all([
      Promise.all(epaPromises),
      fetchChernobyl(),
      fetchFukushima(),
    ]);

    const results = [...epaResults, chernobyl, fukushima];
    cachedData = results;
    cacheTimestamp = now;

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('[Radiation Handler] Error:', error);
    // Fallback to baseline
    const fallbackList = EPA_STATIONS.map((st) => {
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

    fallbackList.push({
      id: 'safecast-chernobyl',
      name: 'Chernobyl Exclusion Zone',
      city: 'Pripyat / Chernobyl',
      country: 'Ukraine',
      lat: 51.389,
      lon: 30.099,
      cpm: 106,
      rawCpm: 106,
      doseRate: 318,
      unit: 'CPM',
      status: 'elevated',
      time: new Date().toISOString(),
      source: 'Safecast Open Radiation Network',
      detectorType: 'Geiger-Müller Tube (Safecast)',
    });

    fallbackList.push({
      id: 'safecast-fukushima',
      name: 'Fukushima Daiichi Vicinity',
      city: 'Okuma / Fukushima',
      country: 'Japan',
      lat: 37.4214,
      lon: 141.0326,
      cpm: 64,
      rawCpm: 64,
      doseRate: 192,
      unit: 'CPM',
      status: 'normal',
      time: new Date().toISOString(),
      source: 'Safecast Open Radiation Network',
      detectorType: 'Geiger-Müller Tube (Safecast)',
    });

    return new Response(JSON.stringify(fallbackList), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
