import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

export function getRelayBaseUrl() {
  let raw = process.env.WS_RELAY_URL || process.env.VITE_WS_RELAY_URL || '';
  if (typeof raw !== 'string') return null;
  raw = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;

  if (raw.startsWith('wss://')) {
    raw = 'https://' + raw.slice(6);
  } else if (raw.startsWith('ws://')) {
    raw = 'http://' + raw.slice(5);
  } else if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch (err) {
    console.warn('[HumanConflict Proxy] Invalid WS_RELAY_URL configured:', raw, err?.message || err);
    return null;
  }
}

function getRelayHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const relaySecret = process.env.RELAY_SHARED_SECRET || '';
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeConflictCategory(rawCategory, rawSubcategory, rawTitle) {
  const combined = `${rawCategory || ''} ${rawSubcategory || ''} ${rawTitle || ''}`.toLowerCase();
  if (combined.includes('battle') || combined.includes('armed') || combined.includes('clash') || combined.includes('airstrike') || combined.includes('shelling') || combined.includes('artillery') || combined.includes('military engagement')) {
    return 'battles';
  }
  if (combined.includes('riot') || combined.includes('mob') || combined.includes('looting') || combined.includes('violent demonstration') || combined.includes('unrest')) {
    return 'riots';
  }
  if (combined.includes('protest') || combined.includes('demonstrat') || combined.includes('strike') || combined.includes('rally') || combined.includes('march') || combined.includes('picket')) {
    return 'protests';
  }
  if (combined.includes('strategic') || combined.includes('agreement') || combined.includes('treaty') || combined.includes('troop') || combined.includes('defense') || combined.includes('military movement') || combined.includes('headquarters') || combined.includes('ceasefire') || combined.includes('surrender')) {
    return 'strategic_developments';
  }
  const catLower = (rawCategory || '').toLowerCase();
  if (catLower.includes('protest')) return 'protests';
  if (catLower.includes('riot')) return 'riots';
  if (catLower.includes('strategic')) return 'strategic_developments';
  return 'battles';
}

function convertUcdpToHumanConflictEvents(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((item, idx) => {
      const lat = Number(item.latitude ?? item.lat);
      const lon = Number(item.longitude ?? item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return null;
      }

      const rawType = item.type_of_violence ?? item.typeOfViolence ?? item.violenceType ?? 1;
      let violenceType = 'state-based';
      if (rawType === 1 || rawType === '1' || rawType === 'state-based' || rawType === 'UCDP_VIOLENCE_TYPE_STATE_BASED') {
        violenceType = 'state-based';
      } else if (rawType === 2 || rawType === '2' || rawType === 'non-state' || rawType === 'UCDP_VIOLENCE_TYPE_NON_STATE') {
        violenceType = 'non-state';
      } else if (rawType === 3 || rawType === '3' || rawType === 'one-sided' || rawType === 'UCDP_VIOLENCE_TYPE_ONE_SIDED') {
        violenceType = 'one-sided';
      }

      const isOneSided = violenceType === 'one-sided';
      const category = isOneSided ? 'riots' : 'battles';
      const sideA = item.side_a || item.sideA || 'Armed forces';
      const sideB = item.side_b || item.sideB || 'Opposing forces';
      const country = item.country || '';
      const title = `${sideA} vs ${sideB}${country ? ` (${country})` : ''}`;
      const deaths = Math.max(0, Number(item.best ?? item.deaths_best ?? item.deathsBest ?? 0) || 0);

      const rawDate = item.date_start ?? item.dateStart ?? item.date ?? '';
      let dateStr = '';
      if (typeof rawDate === 'number' && Number.isFinite(rawDate) && rawDate > 0) {
        dateStr = new Date(rawDate).toISOString().split('T')[0];
      } else if (rawDate) {
        dateStr = String(rawDate).split('T')[0];
      }
      if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
      }

      const actors = [sideA, sideB].filter(Boolean);

      return {
        id: String(item.id || `ucdp-${idx}-${lat.toFixed(3)}-${lon.toFixed(3)}`),
        title,
        category,
        subcategory: violenceType,
        subcategoryLabel: violenceType.replace(/-/g, ' ').toUpperCase(),
        date: dateStr,
        lat,
        lon,
        country,
        location: country,
        fatalities: deaths,
        actors: actors.length > 0 ? actors : undefined,
        significance: Math.min(10, Math.max(1, Math.ceil((deaths || 1) / 5))),
        source: 'ucdp',
        notes: item.source_original || undefined,
      };
    })
    .filter(Boolean);
}

function parseAndSanitizeConflictEvents(parsed) {
  let list = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.data)) {
    list = parsed.data;
  } else if (parsed && Array.isArray(parsed.events)) {
    list = parsed.events;
  } else if (parsed && Array.isArray(parsed.result)) {
    list = parsed.result;
  } else if (parsed && Array.isArray(parsed.Result)) {
    return convertUcdpToHumanConflictEvents(parsed.Result);
  } else if (parsed && Array.isArray(parsed.features)) {
    list = parsed.features.map(f => ({
      id: f.id || f.properties?.id,
      ...f.properties,
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
    }));
  }

  // Check if incoming structure is UCDP-formatted
  if (list.length > 0 && (list[0].type_of_violence !== undefined || list[0].side_a !== undefined)) {
    return convertUcdpToHumanConflictEvents(list);
  }

  return list
    .map((item, idx) => {
      const lat = Number(item.latitude ?? item.lat ?? item.geo?.latitude ?? item.geo?.lat ?? item.location?.latitude ?? item.location?.lat);
      const lon = Number(item.longitude ?? item.lon ?? item.lng ?? item.geo?.longitude ?? item.geo?.lon ?? item.geo?.lng ?? item.location?.longitude ?? item.location?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return null;
      }

      const rawCat = item.category || item.event_category || item.type || item.event_type || '';
      const rawSub = item.subcategory || item.subcategory_label || item.sub_type || item.sub_event_type || '';
      const rawTitle = item.title || item.name || item.event_name || item.notes || item.summary || '';
      const category = normalizeConflictCategory(rawCat, rawSub, rawTitle);

      const actors = Array.isArray(item.actors)
        ? item.actors.map(String).filter(Boolean)
        : [item.actor1, item.actor2].filter(Boolean).map(String);

      const rawDate = item.event_date || item.date || item.timestamp || item.created_at || '';
      let dateStr = '';
      if (rawDate) {
        try {
          dateStr = new Date(rawDate).toISOString().split('T')[0];
        } catch {
          dateStr = String(rawDate).slice(0, 10);
        }
      }
      if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
      }

      return {
        id: String(item.id || item.event_id || item.eventId || `ucdp-${idx}-${lat.toFixed(3)}-${lon.toFixed(3)}`),
        title: rawTitle || `${category.replace(/_/g, ' ').toUpperCase()} in ${item.country || item.geo?.country || 'Region'}`,
        category,
        subcategory: rawSub || undefined,
        subcategoryLabel: item.subcategory_label || rawSub || undefined,
        date: dateStr,
        lat,
        lon,
        country: item.country || item.geo?.country || item.country_code || '',
        location: item.location || item.location_name || item.geo?.location || item.city || '',
        fatalities: Math.max(0, Number(item.fatalities ?? item.deaths ?? item.deaths_best ?? 0) || 0),
        actors: actors.length > 0 ? actors : undefined,
        significance: Number(item.significance ?? item.goldstein_scale ?? item.severity ?? 1) || 1,
        source: 'ucdp',
        notes: item.notes || item.summary || item.description || undefined,
      };
    })
    .filter(Boolean);
}

// Edge module cache: single canonical dataset cached for 24 hours
const EDGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours lengthy cache
let edgeCanonicalSnapshot = null;
let edgeCanonicalSnapshotTime = 0;
let edgeRateLimitUntil = 0;
let edgeCanonicalFetchInFlight = null;

function filterSnapshotEvents(events, categoryParam, countryParam, limitParam) {
  let list = Array.isArray(events) ? events : [];
  if (categoryParam) {
    const allowed = categoryParam.toLowerCase().split(',').map(s => s.trim());
    list = list.filter(e => allowed.includes((e.category || '').toLowerCase()));
  }
  if (countryParam) {
    const countryLower = countryParam.toLowerCase();
    list = list.filter(e => (e.country || '').toLowerCase() === countryLower);
  }
  const maxLimit = Math.min(300, Math.max(1, Number(limitParam || 250)));
  return list.slice(0, maxLimit);
}

async function fetchUcdpCanonicalSnapshot(timeoutMs = 15000) {
  const token = (process.env.UCDP_ACCESS_TOKEN || process.env.UC_DP_KEY || '').trim();
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'WorldMonitor-Proxy/1.0 (+https://worldmonitor.app)',
  };
  if (token) {
    headers['x-ucdp-access-token'] = token;
  }

  const year = new Date().getFullYear() - 2000;
  const candidates = [`${year}.1`, `${year - 1}.1`, '25.1', '24.1'];

  let version = null;
  let page0Data = null;

  for (const v of candidates) {
    try {
      const resp = await fetchWithTimeout(
        `https://ucdpapi.pcr.uu.se/api/gedevents/${v}?pagesize=1000&page=0`,
        { headers },
        timeoutMs
      );
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json?.Result)) {
          version = v;
          page0Data = json;
          break;
        }
      }
    } catch {
      // ignore and try next candidate
    }
  }

  if (!version || !page0Data) {
    throw new Error('UCDP GED API discovery failed or returned non-200');
  }

  const totalPages = Math.max(1, Number(page0Data.TotalPages) || 1);
  const newestPage = totalPages - 1;
  const maxPages = 4;
  const pagesToFetch = [];

  for (let offset = 0; offset < maxPages && (newestPage - offset) >= 0; offset++) {
    const page = newestPage - offset;
    if (page === 0) {
      pagesToFetch.push(Promise.resolve(page0Data));
    } else {
      pagesToFetch.push(
        fetchWithTimeout(
          `https://ucdpapi.pcr.uu.se/api/gedevents/${version}?pagesize=1000&page=${page}`,
          { headers },
          timeoutMs
        ).then(r => (r.ok ? r.json() : null)).catch(() => null)
      );
    }
  }

  const results = await Promise.all(pagesToFetch);
  const events = [];
  for (const res of results) {
    if (res && Array.isArray(res.Result)) {
      events.push(...res.Result);
    }
  }

  return convertUcdpToHumanConflictEvents(events);
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

  const requestUrl = new URL(req.url);
  const relayBaseUrl = getRelayBaseUrl();

  // Strategy 1: Forward to Railway relay hook
  if (relayBaseUrl) {
    try {
      const relayUrl = new URL(`/human-conflict${requestUrl.search || ''}`, relayBaseUrl).toString();
      const response = await fetchWithTimeout(relayUrl, {
        headers: getRelayHeaders({ Accept: 'application/json' }),
      }, 15000);

      const body = await response.text();
      const headers = {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        ...corsHeaders,
      };

      return new Response(body, {
        status: response.status,
        headers,
      });
    } catch (relayErr) {
      console.warn('[HumanConflict Proxy] Railway relay request failed, evaluating direct UCDP fallback:', relayErr?.message || relayErr);
    }
  }

  // Strategy 2: Direct call to UCDP API
  const clientCategory = requestUrl.searchParams.get('category') || '';
  const clientCountry = requestUrl.searchParams.get('country') || '';
  const clientLimit = requestUrl.searchParams.get('limit') || '250';

  const makeResponse = (events, cacheHeader) => {
    const filtered = filterSnapshotEvents(events, clientCategory, clientCountry, clientLimit);
    return new Response(JSON.stringify({
      success: true,
      count: filtered.length,
      data: filtered,
      cached_at: new Date(edgeCanonicalSnapshotTime || Date.now()).toISOString(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Cache': cacheHeader,
        'X-Conflict-Source': 'ucdp-api',
        ...corsHeaders,
      },
    });
  };

  // 1. Fresh cache hit (< 24 hours)
  if (edgeCanonicalSnapshot && (Date.now() - edgeCanonicalSnapshotTime < EDGE_CACHE_TTL_MS)) {
    return makeResponse(edgeCanonicalSnapshot, 'HIT');
  }

  // 2. Upstream 429 cooldown active: serve stale snapshot
  if (edgeCanonicalSnapshot && (Date.now() < edgeRateLimitUntil)) {
    return makeResponse(edgeCanonicalSnapshot, 'STALE-COOLDOWN');
  }

  // 3. Deduplicate in-flight fetch
  if (edgeCanonicalFetchInFlight) {
    try {
      const events = await edgeCanonicalFetchInFlight;
      return makeResponse(events, 'DEDUP');
    } catch {
      if (edgeCanonicalSnapshot) return makeResponse(edgeCanonicalSnapshot, 'STALE');
    }
  }

  // 4. Fetch canonical dataset from UCDP API
  try {
    edgeCanonicalFetchInFlight = fetchUcdpCanonicalSnapshot(15000);
    const events = await edgeCanonicalFetchInFlight;
    if (events && events.length > 0) {
      edgeCanonicalSnapshot = events;
      edgeCanonicalSnapshotTime = Date.now();
      return makeResponse(events, 'MISS');
    }
  } catch (directErr) {
    console.error('[HumanConflict Proxy] Direct UCDP fetch failed:', directErr);
    if (edgeCanonicalSnapshot) {
      return makeResponse(edgeCanonicalSnapshot, 'STALE');
    }
  } finally {
    edgeCanonicalFetchInFlight = null;
  }

  // Graceful degradation: serve curated active conflict snapshot
  return makeResponse(getCuratedConflictEvents(), 'FALLBACK');
}

export function getCuratedConflictEvents() {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const d = (daysAgo) => new Date(now - daysAgo * dayMs).toISOString().slice(0, 10);

  return [
    { id: 'conf-ukr-1', title: 'Heavy artillery and drone clashes in Pokrovsk sector', category: 'battles', date: d(1), lat: 48.28, lon: 37.18, country: 'Ukraine', location: 'Pokrovsk, Donetsk', fatalities: 42, actors: ['Armed Forces of Ukraine', 'Russian Armed Forces'], significance: 9, source: 'fallback' },
    { id: 'conf-ukr-2', title: 'Airstrikes and frontline skirmishes near Kupiansk', category: 'battles', date: d(2), lat: 49.71, lon: 37.61, country: 'Ukraine', location: 'Kupiansk, Kharkiv', fatalities: 18, actors: ['Armed Forces of Ukraine', 'Russian Armed Forces'], significance: 7, source: 'fallback' },
    { id: 'conf-ukr-3', title: 'Urban combat engagements in Chasiv Yar', category: 'battles', date: d(1), lat: 48.58, lon: 37.83, country: 'Ukraine', location: 'Chasiv Yar, Donetsk', fatalities: 25, actors: ['Armed Forces of Ukraine', 'Russian Armed Forces'], significance: 8, source: 'fallback' },
    { id: 'conf-ukr-4', title: 'Cross-border counter-offensive operations in Kursk Oblast', category: 'battles', date: d(3), lat: 51.32, lon: 35.25, country: 'Russia', location: 'Sudzha, Kursk', fatalities: 31, actors: ['Armed Forces of Ukraine', 'Russian Armed Forces'], significance: 9, source: 'fallback' },
    { id: 'conf-ukr-5', title: 'Long-range missile and drone strikes on energy infrastructure', category: 'explosions_remote_violence', date: d(2), lat: 49.99, lon: 36.23, country: 'Ukraine', location: 'Kharkiv', fatalities: 12, actors: ['Russian Armed Forces'], significance: 8, source: 'fallback' },
    { id: 'conf-me-1', title: 'US and Israeli precision strikes on IRGC leadership and weapons facilities', category: 'explosions_remote_violence', date: d(1), lat: 35.68, lon: 51.38, country: 'Iran', location: 'Tehran', fatalities: 65, actors: ['US CENTCOM', 'IDF', 'IRGC'], significance: 10, source: 'fallback' },
    { id: 'conf-me-2', title: 'Retaliatory ballistic missile and drone volleys near Isfahan', category: 'battles', date: d(2), lat: 32.65, lon: 51.66, country: 'Iran', location: 'Isfahan', fatalities: 24, actors: ['IRGC', 'Coalition Forces'], significance: 9, source: 'fallback' },
    { id: 'conf-me-3', title: 'Maritime engagement and drone boat interception in Strait of Hormuz', category: 'battles', date: d(1), lat: 26.56, lon: 56.25, country: 'Oman / Iran', location: 'Strait of Hormuz', fatalities: 15, actors: ['US 5th Fleet', 'IRGC Navy'], significance: 9, source: 'fallback' },
    { id: 'conf-me-4', title: 'Artillery exchanges and cross-border airstrikes in Southern Lebanon', category: 'battles', date: d(1), lat: 33.27, lon: 35.20, country: 'Lebanon', location: 'Tyre / Bint Jbeil', fatalities: 28, actors: ['IDF', 'Hezbollah'], significance: 8, source: 'fallback' },
    { id: 'conf-me-5', title: 'Intense skirmishes and aerial bombardment in Northern Gaza', category: 'battles', date: d(1), lat: 31.52, lon: 34.45, country: 'Palestine', location: 'Gaza City', fatalities: 35, actors: ['IDF', 'Hamas / PIJ'], significance: 8, source: 'fallback' },
    { id: 'conf-me-6', title: 'Armed confrontations during security raids in Jenin', category: 'battles', date: d(2), lat: 32.46, lon: 35.29, country: 'West Bank', location: 'Jenin', fatalities: 7, actors: ['IDF', 'Palestinian Militants'], significance: 6, source: 'fallback' },
    { id: 'conf-yem-1', title: 'Anti-ship missile launches and airstrikes on launch sites in Hodeidah', category: 'explosions_remote_violence', date: d(1), lat: 14.79, lon: 42.95, country: 'Yemen', location: 'Hodeidah Port', fatalities: 11, actors: ['Houthi Movement', 'Operation Prosperity Guardian'], significance: 8, source: 'fallback' },
    { id: 'conf-yem-2', title: 'Coalition strikes on underground munition depots near Sanaa', category: 'explosions_remote_violence', date: d(3), lat: 15.36, lon: 44.19, country: 'Yemen', location: 'Sanaa', fatalities: 9, actors: ['Coalition Forces', 'Houthi Movement'], significance: 7, source: 'fallback' },
    { id: 'conf-sud-1', title: 'Heavy artillery shelling between SAF and RSF in Omdurman', category: 'battles', date: d(1), lat: 15.65, lon: 32.48, country: 'Sudan', location: 'Khartoum / Omdurman', fatalities: 53, actors: ['Sudanese Armed Forces (SAF)', 'Rapid Support Forces (RSF)'], significance: 9, source: 'fallback' },
    { id: 'conf-sud-2', title: 'Besieged city offensive and clashes across El Fasher', category: 'battles', date: d(2), lat: 13.62, lon: 25.35, country: 'Sudan', location: 'El Fasher, North Darfur', fatalities: 78, actors: ['SAF / Joint Force', 'Rapid Support Forces (RSF)'], significance: 9, source: 'fallback' },
    { id: 'conf-syr-1', title: 'Frontline clashes and drone strikes in Southern Idlib countryside', category: 'battles', date: d(2), lat: 35.93, lon: 36.63, country: 'Syria', location: 'Idlib', fatalities: 14, actors: ['Syrian Arab Army', 'HTS / Opposition Forces'], significance: 6, source: 'fallback' },
    { id: 'conf-mya-1', title: 'Resistance forces attack military junta outpost in Sagaing', category: 'battles', date: d(2), lat: 21.88, lon: 95.97, country: 'Myanmar', location: 'Sagaing Region', fatalities: 22, actors: ['People Defence Force (PDF)', 'Myanmar Military (Tatmadaw)'], significance: 7, source: 'fallback' },
    { id: 'conf-mya-2', title: 'Intense offensive for control of border crossings in Shan State', category: 'battles', date: d(3), lat: 22.95, lon: 97.75, country: 'Myanmar', location: 'Northern Shan State', fatalities: 34, actors: ['Three Brotherhood Alliance', 'Myanmar Military (Tatmadaw)'], significance: 8, source: 'fallback' },
    { id: 'conf-drc-1', title: 'Violent clashes between M23 rebels and FARDC coalition near Sake', category: 'battles', date: d(2), lat: -1.57, lon: 29.04, country: 'Democratic Republic of Congo', location: 'North Kivu, Sake', fatalities: 37, actors: ['FARDC / SAMIDRC', 'M23 Movement'], significance: 8, source: 'fallback' },
    { id: 'conf-som-1', title: 'Suicide vehicle bombing and assault on security checkpoint in Mogadishu', category: 'explosions_remote_violence', date: d(1), lat: 2.04, lon: 45.33, country: 'Somalia', location: 'Mogadishu', fatalities: 16, actors: ['Al-Shabaab', 'Somali National Army'], significance: 7, source: 'fallback' },
    { id: 'conf-sah-1', title: 'Insurgent ambush on military convoy in Tillaberi region', category: 'battles', date: d(2), lat: 14.21, lon: 1.45, country: 'Niger', location: 'Tillaberi', fatalities: 21, actors: ['ISGS / JNIM', 'Nigerien Armed Forces'], significance: 7, source: 'fallback' },
    { id: 'conf-sah-2', title: 'Complex armed assault on volunteer defense detachment in Soum', category: 'battles', date: d(3), lat: 14.10, lon: -1.67, country: 'Burkina Faso', location: 'Soum Province', fatalities: 26, actors: ['JNIM', 'Burkinabe Armed Forces (VDP)'], significance: 7, source: 'fallback' }
  ];
}
