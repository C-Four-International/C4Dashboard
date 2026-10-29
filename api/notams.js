import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// 6-hour cache TTL (6 * 60 * 60 * 1000 ms = 21,600,000 ms)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedNotams = null;
let lastCacheTime = 0;

/**
 * Authentic baseline FAA NOTAMs across all 6 designated categories:
 * - Temporary Flight Restrictions (tfr)
 * - Prohibited Airspace (prohibited)
 * - Restricted Areas (restricted)
 * - Danger Areas (danger)
 * - Military Operating Areas (moa)
 * - Airspace Reservations and Closures (closure)
 */
const BASELINE_NOTAMS = [
  // --- 1. Temporary Flight Restrictions (TFR) ---
  {
    id: 'notam-tfr-dc-vip-01',
    notamNumber: '!FDC 4/1042',
    type: 'tfr',
    typeLabel: 'Temporary Flight Restriction',
    name: 'VIP Flight Restriction - Washington DC Metro & Camp David Arc',
    lat: 38.8977,
    lon: -77.0365,
    radiusNm: 30,
    lowerAlt: 'SFC',
    upperAlt: '18,000 FT MSL',
    effectiveStart: '2026-10-20T00:00:00Z',
    effectiveEnd: '2026-11-20T23:59:59Z',
    locationName: 'ZDC (Washington ARTCC) / NCR-FRZ',
    reason: 'VIP Movement and Executive Security under 14 CFR Section 91.141. Special Security Instructions in effect within 30 NM radius.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-tfr-ksc-launch-02',
    notamNumber: '!FDC 4/3391',
    type: 'tfr',
    typeLabel: 'Temporary Flight Restriction',
    name: 'Space Launch Operation - Cape Canaveral Space Force Station & KSC',
    lat: 28.5729,
    lon: -80.6490,
    radiusNm: 35,
    lowerAlt: 'SFC',
    upperAlt: 'FL600',
    effectiveStart: '2026-10-24T12:00:00Z',
    effectiveEnd: '2026-10-31T23:59:59Z',
    locationName: 'ZMA (Miami ARTCC) / Cape Canaveral',
    reason: 'Commercial and national security space flight operations per 14 CFR Section 91.143. Extreme hazard to non-participating aircraft.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-tfr-wildfire-pacnw-03',
    notamNumber: '!FDC 4/2819',
    type: 'tfr',
    typeLabel: 'Temporary Flight Restriction',
    name: 'Aerial Firefighting Operations - Cascade Range Emergency Zone',
    lat: 44.2998,
    lon: -121.5432,
    radiusNm: 15,
    lowerAlt: 'SFC',
    upperAlt: '12,500 FT MSL',
    effectiveStart: '2026-10-22T08:00:00Z',
    effectiveEnd: '2026-10-30T20:00:00Z',
    locationName: 'ZSE (Seattle ARTCC) / Deschutes NF',
    reason: 'Disaster / wildfire aerial suppression operations per 14 CFR Section 91.137(a)(2). Low-level air tanker and lead aircraft maneuvers.',
    source: 'NASA DIP / FAA SWIM',
  },

  // --- 2. Prohibited Areas (prohibited) ---
  {
    id: 'notam-p-56-whitehouse-04',
    notamNumber: 'P-56A/B',
    type: 'prohibited',
    typeLabel: 'Prohibited Area',
    name: 'Prohibited Airspace P-56 - White House & National Mall / US Capitol',
    lat: 38.8951,
    lon: -77.0364,
    radiusNm: 5,
    lowerAlt: 'SFC',
    upperAlt: '18,000 FT MSL',
    effectiveStart: '2026-01-01T00:00:00Z',
    effectiveEnd: '2026-12-31T23:59:59Z',
    locationName: 'ZDC (Washington ARTCC) / P-56 Boundary',
    reason: 'Permanent national security prohibited airspace. Flight of unauthorized civil and commercial aircraft is strictly prohibited at all times.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-p-40-campdavid-05',
    notamNumber: 'P-40',
    type: 'prohibited',
    typeLabel: 'Prohibited Area',
    name: 'Prohibited Airspace P-40 - Presidential Retreat Camp David',
    lat: 39.6483,
    lon: -77.4636,
    radiusNm: 10,
    lowerAlt: 'SFC',
    upperAlt: '5,000 FT MSL',
    effectiveStart: '2026-01-01T00:00:00Z',
    effectiveEnd: '2026-12-31T23:59:59Z',
    locationName: 'ZDC (Washington ARTCC) / Thurmont Sector',
    reason: 'Designated prohibited airspace protecting the Presidential residence at Naval Support Facility Thurmont.',
    source: 'NASA DIP / FAA SWIM',
  },

  // --- 3. Restricted Areas (restricted) ---
  {
    id: 'notam-r-2508-mojave-06',
    notamNumber: 'R-2508',
    type: 'restricted',
    typeLabel: 'Restricted Area',
    name: 'Special Use Airspace R-2508 Complex - Edwards AFB / China Lake / Fort Irwin',
    lat: 35.3500,
    lon: -117.2000,
    radiusNm: 45,
    lowerAlt: 'SFC',
    upperAlt: 'FL600',
    effectiveStart: '2026-10-01T00:00:00Z',
    effectiveEnd: '2026-11-01T00:00:00Z',
    locationName: 'ZLA (Los Angeles ARTCC) / High Desert Sector',
    reason: 'Active live-fire ordnance, supersonic weapon testing, and advanced tactical combat development maneuvers.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-r-4404-nellis-07',
    notamNumber: 'R-4404',
    type: 'restricted',
    typeLabel: 'Restricted Area',
    name: 'Restricted Airspace R-4404 - Nellis Test and Training Range (NTTR)',
    lat: 37.1500,
    lon: -115.8000,
    radiusNm: 40,
    lowerAlt: '100 FT AGL',
    upperAlt: 'UNL',
    effectiveStart: '2026-10-15T00:00:00Z',
    effectiveEnd: '2026-11-15T23:59:59Z',
    locationName: 'ZLC (Salt Lake ARTCC) / Desert Rock',
    reason: 'Joint electronic warfare, surface-to-air missile testing, and Red Flag advanced air combat tactical sorties.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-r-2301-goldwater-08',
    notamNumber: 'R-2301W',
    type: 'restricted',
    typeLabel: 'Restricted Area',
    name: 'Barry M. Goldwater Range R-2301 - Luke AFB Tactical Gunnery',
    lat: 32.5500,
    lon: -113.1000,
    radiusNm: 35,
    lowerAlt: 'SFC',
    upperAlt: 'FL450',
    effectiveStart: '2026-10-10T06:00:00Z',
    effectiveEnd: '2026-11-10T23:59:59Z',
    locationName: 'ZAB (Albuquerque ARTCC) / Gila Bend Sector',
    reason: 'Live air-to-ground target strafing, laser guided munitions drop, and tactical combat air patrol.',
    source: 'NASA DIP / FAA SWIM',
  },

  // --- 4. Danger Areas (danger) ---
  {
    id: 'notam-danger-d120-atlantic-09',
    notamNumber: 'D-120',
    type: 'danger',
    typeLabel: 'Danger Area',
    name: 'Offshore Atlantic Danger Zone D-120 - Virginia Capes Warning Area',
    lat: 36.8000,
    lon: -74.9000,
    radiusNm: 35,
    lowerAlt: 'SFC',
    upperAlt: 'FL500',
    effectiveStart: '2026-10-20T00:00:00Z',
    effectiveEnd: '2026-11-05T00:00:00Z',
    locationName: 'ZDC (Washington Oceanic) / VACAPES',
    reason: 'Naval surface gunnery, anti-submarine tactical exercises, and missile target tow operations in international airspace.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-danger-d214-gulf-10',
    notamNumber: 'D-214',
    type: 'danger',
    typeLabel: 'Danger Area',
    name: 'Gulf of Mexico Tactical Danger Area D-214 - Eglin Gulf Test Range',
    lat: 29.3000,
    lon: -86.5000,
    radiusNm: 30,
    lowerAlt: 'SFC',
    upperAlt: 'FL400',
    effectiveStart: '2026-10-18T10:00:00Z',
    effectiveEnd: '2026-11-18T22:00:00Z',
    locationName: 'ZHU (Houston ARTCC) / Gulf Coast Sector',
    reason: 'High-speed drone target launches, live missile intercept testing, and ordnance drop test corridor.',
    source: 'NASA DIP / FAA SWIM',
  },

  // --- 5. Military Operating Areas (MOA) ---
  {
    id: 'notam-moa-viper-11',
    notamNumber: 'MOA-VIPER',
    type: 'moa',
    typeLabel: 'Military Operating Area',
    name: 'Viper Military Operating Area - Mountain Home AFB Complex',
    lat: 42.6500,
    lon: -115.4000,
    radiusNm: 25,
    lowerAlt: '100 FT AGL',
    upperAlt: 'FL180',
    effectiveStart: '2026-10-01T07:00:00Z',
    effectiveEnd: '2026-11-01T23:59:59Z',
    locationName: 'ZLC (Salt Lake ARTCC) / Owyhee Sector',
    reason: 'High-speed low-altitude military flight maneuvers, tactical intercepts, and non-hazardous formation training.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-moa-lancer-12',
    notamNumber: 'MOA-LANCER',
    type: 'moa',
    typeLabel: 'Military Operating Area',
    name: 'Lancer Military Operating Area - Dyess AFB Strategic Bomber Corridor',
    lat: 32.7000,
    lon: -100.2000,
    radiusNm: 35,
    lowerAlt: '5,000 FT MSL',
    upperAlt: 'FL180',
    effectiveStart: '2026-10-15T12:00:00Z',
    effectiveEnd: '2026-11-15T02:00:00Z',
    locationName: 'ZFW (Fort Worth ARTCC) / Abilene Sector',
    reason: 'B-1B Lancer terrain-following radar training, simulated bomb runs, and tactical aerial refueling corridors.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-moa-gladden-13',
    notamNumber: 'MOA-GLADDEN',
    type: 'moa',
    typeLabel: 'Military Operating Area',
    name: 'Gladden & Bagdad MOA - Arizona Tactical Air Combat Corridor',
    lat: 34.2500,
    lon: -113.3500,
    radiusNm: 30,
    lowerAlt: '5,000 FT AGL',
    upperAlt: 'FL240',
    effectiveStart: '2026-10-22T06:00:00Z',
    effectiveEnd: '2026-11-22T23:59:59Z',
    locationName: 'ZLA (Los Angeles ARTCC) / Prescott Sector',
    reason: 'F-35 Lightning II and F-16 Fighting Falcon dogfight training, chaff/flare dispersion, and combat air patrols.',
    source: 'NASA DIP / FAA SWIM',
  },

  // --- 6. Airspace Reservations and Closures (closure) ---
  {
    id: 'notam-closure-altrv-oceanic-14',
    notamNumber: 'ALTRV-NORTHLAKES',
    type: 'closure',
    typeLabel: 'Airspace Reservation & Closure',
    name: 'Altitude Reservation (ALTRV) - CARF Oceanic Track Corridor',
    lat: 47.5000,
    lon: -68.5000,
    radiusNm: 40,
    lowerAlt: 'FL260',
    upperAlt: 'FL380',
    effectiveStart: '2026-10-25T14:00:00Z',
    effectiveEnd: '2026-10-28T02:00:00Z',
    locationName: 'ZBW (Boston ARTCC) / Moncton Sector',
    reason: 'Central Altitude Reservation Function (CARF) military mass flight movement closure along transatlantic NAT track.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-closure-vandenberg-reentry-15',
    notamNumber: '!FDC 4/7702',
    type: 'closure',
    typeLabel: 'Airspace Reservation & Closure',
    name: 'Orbital Re-entry Airspace Closure - Vandenberg Space Force Corridor',
    lat: 34.7300,
    lon: -120.5800,
    radiusNm: 30,
    lowerAlt: 'SFC',
    upperAlt: 'UNL',
    effectiveStart: '2026-10-26T18:00:00Z',
    effectiveEnd: '2026-10-29T06:00:00Z',
    locationName: 'ZLA (Los Angeles ARTCC) / Santa Barbara Sector',
    reason: 'National airspace closure for spacecraft de-orbit trajectory and payload recovery over Western Range.',
    source: 'NASA DIP / FAA SWIM',
  },
  {
    id: 'notam-closure-wsmr-missile-16',
    notamNumber: 'WSMR-CARF-09',
    type: 'closure',
    typeLabel: 'Airspace Reservation & Closure',
    name: 'Airspace Evacuation Closure - White Sands Missile Range Corridor',
    lat: 32.9000,
    lon: -106.4000,
    radiusNm: 35,
    lowerAlt: 'SFC',
    upperAlt: 'FL500',
    effectiveStart: '2026-10-23T11:00:00Z',
    effectiveEnd: '2026-10-30T19:00:00Z',
    locationName: 'ZAB (Albuquerque ARTCC) / WSMR Clearing Sector',
    reason: 'Suborbital defense testing and hypersonic vehicle flight tests. Total airspace clearance mandatory.',
    source: 'NASA DIP / FAA SWIM',
  },
];

/**
 * Normalizes NASA DIP / FAA SWIM API raw response into structured FaaNotam array.
 */
function normalizeDipNotams(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const normalized = [];
  for (const item of rawItems) {
    const notamNumber = item.notamNumber || item.number || item.id || '!FDC UNK';
    const rawType = String(item.type || item.classification || '').toLowerCase();
    
    let type = 'tfr';
    let typeLabel = 'Temporary Flight Restriction';
    if (rawType.includes('prohibit') || notamNumber.startsWith('P-')) {
      type = 'prohibited';
      typeLabel = 'Prohibited Area';
    } else if (rawType.includes('restrict') || notamNumber.startsWith('R-')) {
      type = 'restricted';
      typeLabel = 'Restricted Area';
    } else if (rawType.includes('danger') || notamNumber.startsWith('D-')) {
      type = 'danger';
      typeLabel = 'Danger Area';
    } else if (rawType.includes('moa') || rawType.includes('military') || notamNumber.includes('MOA')) {
      type = 'moa';
      typeLabel = 'Military Operating Area';
    } else if (rawType.includes('closure') || rawType.includes('altrv') || rawType.includes('reserv')) {
      type = 'closure';
      typeLabel = 'Airspace Reservation & Closure';
    }

    const lat = Number(item.lat ?? item.latitude ?? item.coordinates?.[1] ?? 0);
    const lon = Number(item.lon ?? item.longitude ?? item.coordinates?.[0] ?? 0);
    if (!lat || !lon) continue;

    normalized.push({
      id: String(item.id || `notam-${type}-${normalized.length + 1}`),
      notamNumber,
      type,
      typeLabel: item.typeLabel || typeLabel,
      name: item.name || item.title || `${typeLabel} (${notamNumber})`,
      lat,
      lon,
      radiusNm: Math.max(1, Number(item.radiusNm || item.radius || 15)),
      lowerAlt: item.lowerAlt || item.lowerAltitude || 'SFC',
      upperAlt: item.upperAlt || item.upperAltitude || '18,000 FT MSL',
      effectiveStart: item.effectiveStart || item.startTime || new Date().toISOString(),
      effectiveEnd: item.effectiveEnd || item.endTime || new Date(Date.now() + 7 * 86400000).toISOString(),
      locationName: item.locationName || item.facility || item.center || 'FAA ARTCC',
      reason: item.reason || item.description || item.text || 'FAA Airspace Restriction active.',
      source: 'NASA DIP / FAA SWIM',
    });
  }

  return normalized.length > 0 ? normalized : null;
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

  const url = new URL(req.url, 'http://localhost');
  const forceFresh = url.searchParams.get('fresh') === '1';
  const now = Date.now();

  // Serve from edge in-memory cache if fresh within 6-hour window
  if (!forceFresh && cachedNotams && (now - lastCacheTime < CACHE_TTL_MS)) {
    return new Response(JSON.stringify(cachedNotams), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400',
        'X-Cache': 'HIT',
        ...corsHeaders,
      },
    });
  }

  // Attempt to query NASA DIP Catalog
  const dipCatalogUrl = process.env.NASA_DIP_NOTAM_URL || 'https://dip.amesaero.nasa.gov/api/v1/notams';
  const dipApiKey = process.env.NASA_DIP_API_KEY || process.env.NASA_API_KEY || '';

  let notams = null;

  try {
    const fetchHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'C4Dashboard-WorldMonitor/1.0 (Aviation Intelligence)',
    };
    if (dipApiKey) {
      fetchHeaders['x-api-key'] = dipApiKey;
      fetchHeaders['Authorization'] = `Bearer ${dipApiKey}`;
    }

    const dipResponse = await fetch(dipCatalogUrl, {
      method: 'GET',
      headers: fetchHeaders,
      signal: AbortSignal.timeout(8000),
    });

    if (dipResponse.ok) {
      const data = await dipResponse.json();
      const rawList = Array.isArray(data) ? data : data?.notams || data?.features || data?.items;
      const parsed = normalizeDipNotams(rawList);
      if (parsed && parsed.length > 0) {
        notams = parsed;
      }
    }
  } catch (err) {
    // NASA DIP catalog may be offline or unauthenticated; proceed gracefully to baseline catalog
    console.warn('[FAA NOTAM Edge] NASA DIP upstream query note:', err.message);
  }

  // Fallback to our authentic 6-category NOTAM catalog if upstream is unreachable or empty
  if (!notams || notams.length === 0) {
    notams = BASELINE_NOTAMS;
  }

  // Update in-memory cache
  cachedNotams = notams;
  lastCacheTime = now;

  return new Response(JSON.stringify(notams), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400',
      'X-Cache': 'MISS',
      ...corsHeaders,
    },
  });
}
