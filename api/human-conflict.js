import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

function getRelayBaseUrl() {
  const relayUrl = process.env.WS_RELAY_URL;
  if (!relayUrl) return null;
  return relayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
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
  } else if (parsed && Array.isArray(parsed.features)) {
    list = parsed.features.map(f => ({
      id: f.id || f.properties?.id,
      ...f.properties,
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
    }));
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
        id: String(item.id || item.event_id || item.eventId || `gdelt-${idx}-${lat.toFixed(3)}-${lon.toFixed(3)}`),
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
        source: 'gdeltcloud',
        notes: item.notes || item.summary || item.description || undefined,
      };
    })
    .filter(Boolean);
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
      const relayUrl = `${relayBaseUrl}/human-conflict${requestUrl.search || ''}`;
      const response = await fetchWithTimeout(relayUrl, {
        headers: getRelayHeaders({ Accept: 'application/json' }),
      }, 15000);

      const body = await response.text();
      const headers = {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'public, max-age=180, s-maxage=300, stale-while-revalidate=600',
        ...corsHeaders,
      };

      return new Response(body, {
        status: response.status,
        headers,
      });
    } catch (relayErr) {
      console.warn('[HumanConflict Proxy] Railway relay request failed, evaluating direct fallback:', relayErr?.message || relayErr);
    }
  }

  // Strategy 2: Direct call to gdeltcloud.com if GDELT_API_KEY is present in runtime env
  const gdeltKey = process.env.GDELT_API_KEY;
  if (gdeltKey) {
    try {
      const upstreamUrl = new URL('https://gdeltcloud.com/api/v2/events');
      upstreamUrl.searchParams.set('event_family', 'conflict');
      upstreamUrl.searchParams.set('category', requestUrl.searchParams.get('category') || 'Battles,Protests,Riots,Strategic developments');
      upstreamUrl.searchParams.set('days', requestUrl.searchParams.get('days') || '14');
      upstreamUrl.searchParams.set('limit', requestUrl.searchParams.get('limit') || '250');
      if (requestUrl.searchParams.get('country')) {
        upstreamUrl.searchParams.set('country', requestUrl.searchParams.get('country'));
      }

      const upstreamResp = await fetchWithTimeout(upstreamUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${gdeltKey}`,
          'User-Agent': 'WorldMonitor-Proxy/1.0 (+https://worldmonitor.app)',
        },
      }, 15000);

      if (!upstreamResp.ok) {
        throw new Error(`GDELT Cloud HTTP ${upstreamResp.status}`);
      }

      const raw = await upstreamResp.json();
      const sanitized = parseAndSanitizeConflictEvents(raw);

      return new Response(JSON.stringify({
        success: true,
        count: sanitized.length,
        data: sanitized,
        cached_at: new Date().toISOString(),
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=180, s-maxage=300, stale-while-revalidate=600',
          ...corsHeaders,
        },
      });
    } catch (directErr) {
      console.error('[HumanConflict Proxy] Direct gdeltcloud fetch failed:', directErr);
    }
  }

  // Graceful degradation response if neither relay nor direct key succeeded
  return new Response(JSON.stringify({
    success: false,
    message: relayBaseUrl ? 'Failed to fetch conflict data from relay' : 'WS_RELAY_URL or GDELT_API_KEY not configured',
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
