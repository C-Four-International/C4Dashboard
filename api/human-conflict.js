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

  // Graceful degradation response
  return new Response(JSON.stringify({
    success: false,
    message: relayBaseUrl ? 'Failed to fetch conflict data from relay or UCDP' : 'UCDP conflict data unavailable',
    count: 0,
    data: [],
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      ...corsHeaders,
    },
  });
}
