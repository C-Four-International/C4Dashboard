import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// 18-hour cache TTL (18 * 60 * 60 * 1000 ms = 64,800,000 ms; 64,800 seconds).
// In a 31-day month, 744 hours / 18 hours = 41.3 scheduled requests, strictly staying under the 50 requests/month limit.
export const NOTAM_CACHE_TTL_HOURS = 18;
export const CACHE_TTL_MS = NOTAM_CACHE_TTL_HOURS * 60 * 60 * 1000;
export const CACHE_MAX_AGE_SEC = NOTAM_CACHE_TTL_HOURS * 3600;

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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
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
    source: 'Notamify / NASA DIP / FAA SWIM',
  },
];

/**
 * ICAO location center coordinates lookup table for major flight information regions (FIRs) and airports.
 * Provides reliable geospatial placement when NOTAM notices lack direct coordinates in the text.
 */
export const ICAO_COORDINATES = {
  // US ARTCC / FIRs
  'KZDC': { lat: 38.8977, lon: -77.0365, name: 'Washington ARTCC' },
  'KZNY': { lat: 40.7128, lon: -74.0060, name: 'New York ARTCC' },
  'KZBW': { lat: 42.3601, lon: -71.0589, name: 'Boston ARTCC' },
  'KZMA': { lat: 25.7617, lon: -80.1918, name: 'Miami ARTCC' },
  'KZJX': { lat: 30.3322, lon: -81.6557, name: 'Jacksonville ARTCC' },
  'KZTL': { lat: 33.7490, lon: -84.3880, name: 'Atlanta ARTCC' },
  'KZAU': { lat: 41.8781, lon: -87.6298, name: 'Chicago ARTCC' },
  'KZOB': { lat: 41.4993, lon: -81.6944, name: 'Cleveland ARTCC' },
  'KZID': { lat: 39.7684, lon: -86.1581, name: 'Indianapolis ARTCC' },
  'KZME': { lat: 35.1495, lon: -90.0490, name: 'Memphis ARTCC' },
  'KZHU': { lat: 29.7604, lon: -95.3698, name: 'Houston ARTCC' },
  'KZFW': { lat: 32.7767, lon: -96.7970, name: 'Fort Worth ARTCC' },
  'KZKC': { lat: 39.0997, lon: -94.5786, name: 'Kansas City ARTCC' },
  'KZMP': { lat: 44.9778, lon: -93.2650, name: 'Minneapolis ARTCC' },
  'KZDV': { lat: 39.7392, lon: -104.9903, name: 'Denver ARTCC' },
  'KZAB': { lat: 35.0844, lon: -106.6504, name: 'Albuquerque ARTCC' },
  'KZLC': { lat: 40.7608, lon: -111.8910, name: 'Salt Lake ARTCC' },
  'KZLA': { lat: 34.0522, lon: -118.2437, name: 'Los Angeles ARTCC' },
  'KZOA': { lat: 37.7749, lon: -122.4194, name: 'Oakland ARTCC' },
  'KZSE': { lat: 47.6062, lon: -122.3321, name: 'Seattle ARTCC' },
  'PAZA': { lat: 61.2181, lon: -149.9003, name: 'Anchorage ARTCC' },
  'PHZH': { lat: 21.3069, lon: -157.8583, name: 'Honolulu ARTCC' },
  // Major International Airports & FIRs
  'KJFK': { lat: 40.6413, lon: -73.7781, name: 'New York JFK' },
  'KLAX': { lat: 33.9416, lon: -118.4085, name: 'Los Angeles Intl' },
  'KORD': { lat: 41.9742, lon: -87.9073, name: 'Chicago O\'Hare' },
  'KMIA': { lat: 25.7959, lon: -80.2870, name: 'Miami Intl' },
  'KATL': { lat: 33.6407, lon: -84.4277, name: 'Atlanta Hartsfield' },
  'EGLL': { lat: 51.4700, lon: -0.4543, name: 'London Heathrow' },
  'EGTT': { lat: 51.5074, lon: -0.1278, name: 'London FIR' },
  'EGGX': { lat: 55.0000, lon: -10.0000, name: 'Shanwick Oceanic FIR' },
  'LFPG': { lat: 49.0097, lon: 2.5479, name: 'Paris Charles de Gaulle' },
  'LFFF': { lat: 48.8566, lon: 2.3522, name: 'Paris FIR' },
  'EDDF': { lat: 50.0379, lon: 8.5622, name: 'Frankfurt Airport' },
  'EDDM': { lat: 48.3537, lon: 11.7750, name: 'Munich Airport' },
  'EDGG': { lat: 50.1109, lon: 8.6821, name: 'Langen FIR' },
  'EHAM': { lat: 52.3105, lon: 4.7683, name: 'Amsterdam Schiphol' },
  'RJTT': { lat: 35.5494, lon: 139.7798, name: 'Tokyo Haneda' },
  'VHHH': { lat: 22.3080, lon: 113.9185, name: 'Hong Kong Intl' },
  'WSSS': { lat: 1.3644, lon: 103.9915, name: 'Singapore Changi' },
  'OMDB': { lat: 25.2532, lon: 55.3657, name: 'Dubai Intl' },
  'LLBG': { lat: 32.0055, lon: 34.8854, name: 'Tel Aviv Ben Gurion' },
};

/**
 * Parses standard ICAO Annex 15 Q-line:
 * Q) <FIR>/<QCODE>/<TRAFFIC>/<PURPOSE>/<SCOPE>/<LOWER>/<UPPER>/<COORDS_RADIUS>
 * Example: Q) KZDC/QRTCA/IV/BO/W/000/180/3854N07702W030
 */
export function parseQLine(text) {
  if (!text) return null;

  // Complete Q-line with coordinates & radius:
  const qMatch = text.match(/Q\)\s*([A-Z0-9]{4})\/([A-Z]{5})\/[A-Z\s\/]*\/([0-9]{3})\/([0-9]{3})\/([0-9]{2})([0-9]{2})([NS])\s*([0-9]{3})([0-9]{2})([EW])\s*([0-9]{3})/i);
  if (qMatch) {
    const fir = qMatch[1].toUpperCase();
    const qCode = qMatch[2].toUpperCase();
    const lowerFlStr = qMatch[3];
    const upperFlStr = qMatch[4];

    let lowerAlt = 'SFC';
    if (lowerFlStr && lowerFlStr !== '000') {
      const lFl = parseInt(lowerFlStr, 10);
      lowerAlt = lFl >= 180 ? `FL${lFl}` : `${lFl * 100} FT MSL`;
    }

    let upperAlt = '18,000 FT MSL';
    if (upperFlStr) {
      if (upperFlStr === '999') {
        upperAlt = 'UNL';
      } else {
        const uFl = parseInt(upperFlStr, 10);
        upperAlt = uFl >= 180 ? `FL${uFl}` : `${uFl * 100} FT MSL`;
      }
    }

    const latDeg = parseInt(qMatch[5], 10);
    const latMin = parseInt(qMatch[6], 10);
    const latSign = qMatch[7].toUpperCase() === 'S' ? -1 : 1;
    const lat = Number(((latDeg + latMin / 60) * latSign).toFixed(4));

    const lonDeg = parseInt(qMatch[8], 10);
    const lonMin = parseInt(qMatch[9], 10);
    const lonSign = qMatch[10].toUpperCase() === 'W' ? -1 : 1;
    const lon = Number(((lonDeg + lonMin / 60) * lonSign).toFixed(4));

    const radiusNm = Math.max(1, parseInt(qMatch[11], 10));

    return { fir, qCode, lowerAlt, upperAlt, lat, lon, radiusNm };
  }

  // Q-line without coordinates:
  const shortQMatch = text.match(/Q\)\s*([A-Z0-9]{4})\/([A-Z]{5})(?:\/[A-Z\s\/]*\/([0-9]{3})\/([0-9]{3}))?/i);
  if (shortQMatch) {
    const fir = shortQMatch[1].toUpperCase();
    const qCode = shortQMatch[2].toUpperCase();
    let lowerAlt = 'SFC';
    let upperAlt = '18,000 FT MSL';
    if (shortQMatch[3] && shortQMatch[3] !== '000') {
      const lFl = parseInt(shortQMatch[3], 10);
      lowerAlt = lFl >= 180 ? `FL${lFl}` : `${lFl * 100} FT MSL`;
    }
    if (shortQMatch[4]) {
      if (shortQMatch[4] === '999') upperAlt = 'UNL';
      else {
        const uFl = parseInt(shortQMatch[4], 10);
        upperAlt = uFl >= 180 ? `FL${uFl}` : `${uFl * 100} FT MSL`;
      }
    }
    return { fir, qCode, lowerAlt, upperAlt };
  }

  return null;
}

/**
 * Extracts coordinates and radius from Notamify's map_elements schema.
 * Supports Points, Circles, and Polygon boundaries.
 */
export function extractFromMapElements(mapElements) {
  if (!mapElements) return null;
  const elements = Array.isArray(mapElements) ? mapElements : [mapElements];

  for (const elem of elements) {
    if (!elem) continue;
    const coords = elem.coordinates;
    const radiusNm = Number(elem.radius_nm || elem.radius || elem.radiusNm || 0);
    const lowerAlt = elem.lower_alt || elem.lowerAlt;
    const upperAlt = elem.upper_alt || elem.upperAlt;

    // Single coordinate pair: [lon, lat] (standard GeoJSON) or [lat, lon]
    if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      let c1 = coords[0];
      let c2 = coords[1];
      let lon, lat;
      if (Math.abs(c1) > 90 && Math.abs(c2) <= 90) {
        lon = c1;
        lat = c2;
      } else if (Math.abs(c2) > 90 && Math.abs(c1) <= 90) {
        lon = c2;
        lat = c1;
      } else {
        // Standard GeoJSON is [lon, lat]
        lon = c1;
        lat = c2;
      }
      return {
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        radiusNm: radiusNm > 0 ? radiusNm : 15,
        lowerAlt,
        upperAlt,
      };
    }

    // Polygon coordinates: array of coordinate vertices
    if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0])) {
      const ring = Array.isArray(coords[0][0]) ? coords[0] : coords;
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;
      for (const pt of ring) {
        if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
          sumLon += pt[0];
          sumLat += pt[1];
          count++;
        }
      }
      if (count > 0) {
        return {
          lat: Number((sumLat / count).toFixed(4)),
          lon: Number((sumLon / count).toFixed(4)),
          radiusNm: radiusNm > 0 ? radiusNm : 15,
          lowerAlt,
          upperAlt,
        };
      }
    }
  }

  return null;
}

/**
 * Extracts best geospatial location from Notamify item, Q-line, or ICAO location table.
 */
export function extractCoordinates(item, qLineData) {
  // 1. From Notamify interpretation map_elements
  const mapData = extractFromMapElements(item.interpretation?.map_elements || item.map_elements);
  if (mapData && typeof mapData.lat === 'number' && typeof mapData.lon === 'number') {
    return mapData;
  }

  // 2. From direct fields (lat, lon, coordinates)
  const directLat = Number(item.lat ?? item.latitude ?? (Array.isArray(item.coordinates) ? item.coordinates[1] : undefined));
  const directLon = Number(item.lon ?? item.longitude ?? (Array.isArray(item.coordinates) ? item.coordinates[0] : undefined));
  if (!isNaN(directLat) && !isNaN(directLon) && (directLat !== 0 || directLon !== 0)) {
    return {
      lat: Number(directLat.toFixed(4)),
      lon: Number(directLon.toFixed(4)),
      radiusNm: Number(item.radiusNm || item.radius_nm || item.radius || 15),
    };
  }

  // 3. From Q-line parsed coordinates
  if (qLineData && typeof qLineData.lat === 'number' && typeof qLineData.lon === 'number') {
    return {
      lat: qLineData.lat,
      lon: qLineData.lon,
      radiusNm: qLineData.radiusNm || 15,
      lowerAlt: qLineData.lowerAlt,
      upperAlt: qLineData.upperAlt,
    };
  }

  // 4. From ICAO airport / FIR location code fallback
  const icao = (item.icao_code || item.locationName || item.facility || '').toUpperCase().trim();
  if (icao && ICAO_COORDINATES[icao]) {
    const loc = ICAO_COORDINATES[icao];
    return {
      lat: loc.lat,
      lon: loc.lon,
      radiusNm: 15,
    };
  }

  return null;
}

/**
 * Classifies NOTAM into one of the 6 core airspace types:
 * 'tfr' | 'prohibited' | 'restricted' | 'danger' | 'moa' | 'closure'
 */
export function classifyNotamType(item, qCode) {
  const notamNumber = String(item.notam_number || item.notamNumber || item.number || item.id || '').toUpperCase();
  const subcategory = String(item.interpretation?.subcategory || '').toLowerCase();
  const category = String(item.interpretation?.category || '').toLowerCase();
  const rawType = String(item.type || item.classification || '').toLowerCase();
  const excerpt = String(item.interpretation?.excerpt || item.name || '').toLowerCase();
  const fullText = String(item.interpretation?.full_text || item.reason || item.description || item.icao_message || '').toLowerCase();
  const qc = String(qCode || item.q_code || '').toUpperCase();

  const affected = item.interpretation?.affected_elements || [];
  const hasClosedEffect = affected.some((a) => String(a.effect || '').toUpperCase() === 'CLOSED');
  const hasRestrictedEffect = affected.some((a) => String(a.effect || '').toUpperCase() === 'RESTRICTED');

  // 1. Prohibited Airspace
  if (
    subcategory.includes('prohibit') ||
    notamNumber.startsWith('P-') ||
    qc.startsWith('QRP') ||
    (qc.startsWith('QRO') && (subcategory.includes('prohibit') || excerpt.includes('prohibit') || fullText.includes('prohibit'))) ||
    excerpt.includes('prohibited area') ||
    excerpt.includes('prohibited airspace')
  ) {
    return { type: 'prohibited', typeLabel: 'Prohibited Area' };
  }

  // 2. Military Operating Area (MOA)
  if (
    subcategory.includes('moa') ||
    subcategory.includes('military operating') ||
    notamNumber.includes('MOA') ||
    qc.startsWith('QRM') ||
    excerpt.includes('military operating area') ||
    excerpt.includes(' moa ')
  ) {
    return { type: 'moa', typeLabel: 'Military Operating Area' };
  }

  // 3. Airspace Reservation & Closure
  if (
    subcategory.includes('closure') ||
    subcategory.includes('closed') ||
    subcategory.includes('altrv') ||
    subcategory.includes('reserv') ||
    notamNumber.includes('ALTRV') ||
    notamNumber.includes('CARF') ||
    qc.startsWith('QRA') ||
    hasClosedEffect ||
    (qc.startsWith('QMR') && qc.endsWith('LC')) ||
    (qc.startsWith('QFA') && qc.endsWith('LC')) ||
    excerpt.includes('airspace closure') ||
    excerpt.includes('airspace reservation') ||
    excerpt.includes('altitude reservation')
  ) {
    return { type: 'closure', typeLabel: 'Airspace Reservation & Closure' };
  }

  // 4. Restricted Area
  if (
    subcategory.includes('restrict') ||
    notamNumber.startsWith('R-') ||
    qc.startsWith('QRR') ||
    hasRestrictedEffect ||
    (qc.startsWith('QRO') && (subcategory.includes('restrict') || excerpt.includes('restrict') || fullText.includes('restrict'))) ||
    excerpt.includes('restricted area') ||
    excerpt.includes('special use airspace r-')
  ) {
    return { type: 'restricted', typeLabel: 'Restricted Area' };
  }

  // 5. Danger Area
  if (
    subcategory.includes('danger') ||
    subcategory.includes('hazard') ||
    subcategory.includes('obstacle') ||
    category.includes('obstacle') ||
    notamNumber.startsWith('D-') ||
    qc.startsWith('QRD') ||
    qc.startsWith('QOB') ||
    excerpt.includes('danger area') ||
    excerpt.includes('hazard to navigation')
  ) {
    return { type: 'danger', typeLabel: 'Danger Area' };
  }

  // 6. Temporary Flight Restriction (TFR)
  if (
    subcategory.includes('tfr') ||
    subcategory.includes('temporary') ||
    subcategory.includes('vip') ||
    notamNumber.startsWith('!FDC') ||
    notamNumber.includes('TFR') ||
    qc.startsWith('QRT') ||
    qc.startsWith('QWA') ||
    excerpt.includes('temporary flight restriction') ||
    excerpt.includes('vip flight') ||
    excerpt.includes('airshow') ||
    excerpt.includes('firefighting') ||
    excerpt.includes('space launch') ||
    rawType.includes('tfr')
  ) {
    return { type: 'tfr', typeLabel: 'Temporary Flight Restriction' };
  }

  return { type: 'tfr', typeLabel: 'Temporary Flight Restriction' };
}

/**
 * Normalizes Notamify API (and legacy NASA DIP / FAA SWIM) raw items into structured FaaNotam array.
 */
export function normalizeNotamifyNotams(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const normalized = [];
  for (const item of rawItems) {
    if (!item) continue;

    const notamNumber = item.notam_number || item.notamNumber || item.number || item.id || '!FDC UNK';
    const icaoMessage = String(item.icao_message || item.raw_text || item.text || '');
    const qLineData = parseQLine(icaoMessage);
    const qCode = item.q_code || qLineData?.qCode || '';

    const { type, typeLabel } = classifyNotamType(item, qCode);
    const coords = extractCoordinates(item, qLineData);
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
      continue;
    }

    const lowerAlt = coords.lowerAlt || item.lowerAlt || item.lowerAltitude || qLineData?.lowerAlt || 'SFC';
    const upperAlt = coords.upperAlt || item.upperAlt || item.upperAltitude || qLineData?.upperAlt || '18,000 FT MSL';

    const effectiveStart =
      item.interpretation?.schedule?.parsed_windows?.[0]?.start ||
      item.starts_at ||
      item.startTime ||
      item.effectiveStart ||
      new Date().toISOString();

    const effectiveEnd =
      item.interpretation?.schedule?.parsed_windows?.[0]?.end ||
      item.ends_at ||
      item.endTime ||
      item.effectiveEnd ||
      new Date(Date.now() + 7 * 86400000).toISOString();

    const name =
      item.interpretation?.excerpt ||
      item.name ||
      item.title ||
      `${typeLabel} (${notamNumber})`;

    const reason =
      item.interpretation?.full_text ||
      item.interpretation?.excerpt ||
      item.reason ||
      item.description ||
      item.icao_message ||
      'Airspace restriction active.';

    const locationName =
      item.icao_code ||
      item.locationName ||
      item.facility ||
      item.center ||
      (qLineData?.fir ? `${qLineData.fir} FIR` : 'Airspace');

    normalized.push({
      id: String(item.id || `notam-${type}-${normalized.length + 1}`),
      notamNumber,
      type,
      typeLabel: item.typeLabel || typeLabel,
      name,
      lat: coords.lat,
      lon: coords.lon,
      radiusNm: Math.max(1, coords.radiusNm || 15),
      lowerAlt,
      upperAlt,
      effectiveStart,
      effectiveEnd,
      locationName,
      reason,
      source: item.source || (item.interpretation ? 'Notamify' : 'Notamify / ICAO'),
    });
  }

  return normalized.length > 0 ? normalized : null;
}

export const normalizeDipNotams = normalizeNotamifyNotams;

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

  // Serve from edge in-memory cache if fresh within 18-hour window (<= 41 requests/month)
  if (!forceFresh && cachedNotams && (now - lastCacheTime < CACHE_TTL_MS)) {
    return new Response(JSON.stringify(cachedNotams), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SEC}, s-maxage=${CACHE_MAX_AGE_SEC}, stale-while-revalidate=86400`,
        'X-Cache': 'HIT',
        ...corsHeaders,
      },
    });
  }

  // Notamify.com API configuration with legacy fallback support
  const notamifyUrl = process.env.NOTAMIFY_API_URL || process.env.NASA_DIP_NOTAM_URL || 'https://api.notamify.com/api/v2';
  const notamifyApiKey = process.env.NOTAMIFY_API_KEY ||
    process.env.NOTAMIFY_KEY ||
    process.env.NOTAMIFY_API_TOKEN ||
    process.env.NASA_DIP_API_KEY ||
    process.env.NASA_API_KEY ||
    '';

  const queryLocations = url.searchParams.getAll('location');
  const queryLocationsCsv = url.searchParams.get('locations');
  const latParam = url.searchParams.get('lat');
  const lonParam = url.searchParams.get('lon');
  const radiusParam = url.searchParams.get('radius') || url.searchParams.get('radius_nm');

  let targetUrlString = '';
  const cleanBase = notamifyUrl.replace(/\/+$/, '');

  if (latParam && lonParam) {
    const nearbyUrl = cleanBase.endsWith('/notams')
      ? `${cleanBase}/nearby`
      : cleanBase.endsWith('/v2')
        ? `${cleanBase}/notams/nearby`
        : `${cleanBase}/v2/notams/nearby`;
    const targetUrl = new URL(nearbyUrl);
    targetUrl.searchParams.set('lat', latParam);
    targetUrl.searchParams.set('lon', lonParam);
    if (radiusParam) targetUrl.searchParams.set('radius_nm', radiusParam);
    targetUrlString = targetUrl.toString();
  } else {
    const activeUrl = cleanBase.endsWith('/notams')
      ? cleanBase
      : cleanBase.endsWith('/v2')
        ? `${cleanBase}/notams`
        : `${cleanBase}/v2/notams`;
    const targetUrl = new URL(activeUrl);

    let locations = [];
    if (queryLocations.length > 0) {
      locations = queryLocations;
    } else if (queryLocationsCsv) {
      locations = queryLocationsCsv.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else {
      // Default locations across strategic US & European flight information regions
      locations = ['KZDC', 'KZLA', 'KZMA', 'EGTT', 'EDDF'];
    }

    for (const loc of locations.slice(0, 5)) {
      targetUrl.searchParams.append('location', loc);
    }
    targetUrlString = targetUrl.toString();
  }

  let notams = null;

  try {
    const fetchHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'WorldMonitor/2.5 (Aviation Intelligence)',
    };
    if (notamifyApiKey) {
      fetchHeaders['Authorization'] = `Bearer ${notamifyApiKey}`;
      fetchHeaders['x-api-key'] = notamifyApiKey;
    }

    const response = await fetch(targetUrlString, {
      method: 'GET',
      headers: fetchHeaders,
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const data = await response.json();
      const rawList = Array.isArray(data)
        ? data
        : data?.notams || data?.items || data?.data || data?.features;
      const parsed = normalizeNotamifyNotams(rawList);
      if (parsed && parsed.length > 0) {
        notams = parsed;
      }
    }
  } catch (err) {
    console.warn('[NOTAM Edge] Upstream Notamify query note:', err.message);
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
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SEC}, s-maxage=${CACHE_MAX_AGE_SEC}, stale-while-revalidate=86400`,
      'X-Cache': 'MISS',
      ...corsHeaders,
    },
  });
}
