import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import handler, {
  parseQLine,
  extractFromMapElements,
  extractCoordinates,
  classifyNotamType,
  normalizeNotamifyNotams,
  ICAO_COORDINATES,
  NOTAM_CACHE_TTL_HOURS,
  CACHE_MAX_AGE_SEC,
  CACHE_TTL_MS,
} from '../api/notams.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('Notamify.com API Format & Parsing Verification', () => {
  it('parses standard ICAO Q-lines into altitude limits, coordinates, and radius', () => {
    // Washington DC VIP TFR Q-line
    const q1 = parseQLine('Q) KZDC/QRTCA/IV/BO/W/000/180/3854N07702W030');
    assert.ok(q1);
    assert.equal(q1.fir, 'KZDC');
    assert.equal(q1.qCode, 'QRTCA');
    assert.equal(q1.lowerAlt, 'SFC');
    assert.equal(q1.upperAlt, 'FL180');
    assert.equal(q1.lat, 38.9);
    assert.equal(q1.lon, -77.0333);
    assert.equal(q1.radiusNm, 30);

    // London Heathrow obstacle Q-line
    const q2 = parseQLine('Q) EGTT/QOBCE/IV/M/AE/000/002/5128N00028W001');
    assert.ok(q2);
    assert.equal(q2.fir, 'EGTT');
    assert.equal(q2.qCode, 'QOBCE');
    assert.equal(q2.lowerAlt, 'SFC');
    assert.equal(q2.upperAlt, '200 FT MSL');
    assert.equal(q2.lat, 51.4667);
    assert.equal(q2.lon, -0.4667);
    assert.equal(q2.radiusNm, 1);

    // Southern hemisphere & Eastern hemisphere coordinates (e.g. Sydney YSSY)
    const q3 = parseQLine('Q) YMMM/QWBLW/IV/M/W/000/050/3356S15110E015');
    assert.ok(q3);
    assert.equal(q3.fir, 'YMMM');
    assert.equal(q3.lat, -33.9333);
    assert.equal(q3.lon, 151.1667);
    assert.equal(q3.radiusNm, 15);
  });

  it('extracts point and polygon coordinates from Notamify map_elements', () => {
    // Single Point GeoJSON [lon, lat]
    const pointElem = [
      {
        geometry_type: 'Point',
        coordinates: [-117.2, 35.35],
        radius_nm: 45,
        lower_alt: 'SFC',
        upper_alt: 'FL600',
      },
    ];
    const pointRes = extractFromMapElements(pointElem);
    assert.ok(pointRes);
    assert.equal(pointRes.lat, 35.35);
    assert.equal(pointRes.lon, -117.2);
    assert.equal(pointRes.radiusNm, 45);
    assert.equal(pointRes.lowerAlt, 'SFC');
    assert.equal(pointRes.upperAlt, 'FL600');

    // Polygon boundary GeoJSON
    const polyElem = {
      geometry_type: 'Polygon',
      coordinates: [
        [-115.0, 36.0],
        [-114.0, 36.0],
        [-114.0, 37.0],
        [-115.0, 37.0],
      ],
      radius_nm: 25,
    };
    const polyRes = extractFromMapElements(polyElem);
    assert.ok(polyRes);
    assert.equal(polyRes.lat, 36.5);
    assert.equal(polyRes.lon, -114.5);
    assert.equal(polyRes.radiusNm, 25);
  });

  it('correctly classifies NOTAM notices across all 6 core categories', () => {
    // 1. Prohibited Area
    const p1 = classifyNotamType({
      notam_number: 'P-56',
      interpretation: { subcategory: 'PROHIBITED', excerpt: 'Prohibited Area P-56' },
    });
    assert.equal(p1.type, 'prohibited');

    // 2. Military Operating Area (MOA)
    const m1 = classifyNotamType({
      notam_number: 'MOA-VIPER',
      q_code: 'QRMCA',
      interpretation: { subcategory: 'MOA', excerpt: 'Viper Military Operating Area' },
    });
    assert.equal(m1.type, 'moa');

    // 3. Airspace Reservation & Closure
    const c1 = classifyNotamType({
      notam_number: 'ALTRV-NORTHLAKES',
      q_code: 'QRACA',
      interpretation: { subcategory: 'AIRSPACE_CLOSURE', excerpt: 'Altitude Reservation Closure' },
    });
    assert.equal(c1.type, 'closure');

    const c2 = classifyNotamType({
      notam_number: 'A1234/26',
      q_code: 'QMRLC',
      interpretation: {
        affected_elements: [{ type: 'RUNWAY', effect: 'CLOSED' }],
        excerpt: 'Runway 09R/27L closed for maintenance',
      },
    });
    assert.equal(c2.type, 'closure');

    // 4. Restricted Area
    const r1 = classifyNotamType({
      notam_number: 'R-2508',
      q_code: 'QRRCA',
      interpretation: { subcategory: 'RESTRICTED', excerpt: 'Special Use Airspace R-2508' },
    });
    assert.equal(r1.type, 'restricted');

    // 5. Danger Area
    const d1 = classifyNotamType({
      notam_number: 'D-120',
      q_code: 'QRDCA',
      interpretation: { subcategory: 'DANGER', excerpt: 'Danger Area Warning D-120' },
    });
    assert.equal(d1.type, 'danger');

    // 6. Temporary Flight Restriction (TFR)
    const t1 = classifyNotamType({
      notam_number: '!FDC 4/1042',
      q_code: 'QRTCA',
      interpretation: { subcategory: 'TFR', excerpt: 'VIP Temporary Flight Restriction' },
    });
    assert.equal(t1.type, 'tfr');
  });

  it('normalizes authentic Notamify v2 API responses with AI interpretations', () => {
    const notamifySample = [
      {
        id: '24edf937-ac5b-44e9-8970-37a510f139ef',
        notam_number: 'A3733/26',
        icao_code: 'EGLL',
        classification: 'INTL',
        q_code: 'QOBCE',
        icao_message: 'A3733/26 NOTAMN\nQ) EGTT/QOBCE/IV/M/AE/000/002/5128N00028W001\nA) EGLL B) 2609222130 C) 2612180430\nE) LIT CRANE OPR WI AREA...',
        starts_at: '2026-09-22T21:30:00Z',
        ends_at: '2026-12-18T04:30:00Z',
        interpretation: {
          excerpt: 'A lit crane operates at Heathrow at night, up to 171 ft AMSL',
          full_text: 'Temporary crane operations at London Heathrow Airport, lighting active.',
          category: 'OBSTACLES',
          subcategory: 'DANGER',
          schedule: {
            raw_schedule: '22 SEP-23 OCT 2130-0330',
            parsed_windows: [
              { start: '2026-09-22T21:30:00Z', end: '2026-10-23T03:30:00Z' },
            ],
          },
          affected_elements: [
            { type: 'AERODROME', effect: 'HAZARD', identifier: 'EGLL', details: 'Obstacle near runway' },
          ],
          map_elements: [
            {
              geometry_type: 'Point',
              coordinates: [-0.4667, 51.4667],
              radius_nm: 2,
              lower_alt: 'SFC',
              upper_alt: '200 FT MSL',
            },
          ],
        },
      },
      {
        id: '99abc123-dc11-44aa-9900-55aabbccddee',
        notam_number: '!FDC 4/9912',
        icao_code: 'KZDC',
        classification: 'FDC',
        q_code: 'QRTCA',
        icao_message: 'Q) KZDC/QRTCA/IV/BO/W/000/180/3854N07702W030\nE) AIRSPACE RESTRICTION...',
        starts_at: '2026-11-01T00:00:00Z',
        ends_at: '2026-11-30T23:59:59Z',
        interpretation: {
          excerpt: 'VIP Security Temporary Flight Restriction active over Washington DC',
          full_text: 'VIP Movement and Executive Security under 14 CFR Section 91.141.',
          category: 'AIRSPACE',
          subcategory: 'TFR',
          schedule: {
            parsed_windows: [
              { start: '2026-11-01T00:00:00Z', end: '2026-11-30T23:59:59Z' },
            ],
          },
          map_elements: [
            {
              geometry_type: 'Point',
              coordinates: [-77.0333, 38.9],
              radius_nm: 30,
              lower_alt: 'SFC',
              upper_alt: '18,000 FT MSL',
            },
          ],
        },
      },
    ];

    const normalized = normalizeNotamifyNotams(notamifySample);
    assert.ok(normalized);
    assert.equal(normalized.length, 2);

    // Verify first NOTAM (Danger / Obstacle)
    const n1 = normalized[0];
    assert.equal(n1.notamNumber, 'A3733/26');
    assert.equal(n1.type, 'danger');
    assert.equal(n1.lat, 51.4667);
    assert.equal(n1.lon, -0.4667);
    assert.equal(n1.radiusNm, 2);
    assert.equal(n1.lowerAlt, 'SFC');
    assert.equal(n1.upperAlt, '200 FT MSL');
    assert.equal(n1.effectiveStart, '2026-09-22T21:30:00Z');
    assert.equal(n1.effectiveEnd, '2026-10-23T03:30:00Z');
    assert.equal(n1.locationName, 'EGLL');
    assert.equal(n1.source, 'Notamify');

    // Verify second NOTAM (TFR)
    const n2 = normalized[1];
    assert.equal(n2.notamNumber, '!FDC 4/9912');
    assert.equal(n2.type, 'tfr');
    assert.equal(n2.lat, 38.9);
    assert.equal(n2.lon, -77.0333);
    assert.equal(n2.radiusNm, 30);
    assert.equal(n2.locationName, 'KZDC');
    assert.equal(n2.source, 'Notamify');
  });

  it('uses ICAO airport/FIR coordinate table fallback when coordinates are omitted', () => {
    assert.ok(ICAO_COORDINATES['KZDC']);
    assert.ok(ICAO_COORDINATES['EGLL']);
    assert.ok(ICAO_COORDINATES['KJFK']);
    assert.ok(ICAO_COORDINATES['EDDF']);

    const coords = extractCoordinates({
      icao_code: 'KJFK',
      interpretation: { excerpt: 'JFK Operations' },
    }, null);

    assert.ok(coords);
    assert.equal(coords.lat, 40.6413);
    assert.equal(coords.lon, -73.7781);
    assert.equal(coords.radiusNm, 15);
  });
});

describe('Notamify API Edge Endpoint Request Handling', () => {
  it('supports location and proximity query parameters', async () => {
    // Location parameter query
    const locReq = new Request('http://localhost/api/notams?location=KJFK&location=EGLL&fresh=1', {
      method: 'GET',
    });
    const locRes = await handler(locReq);
    assert.equal(locRes.status, 200);
    const locData = await locRes.json();
    assert.ok(Array.isArray(locData));
    assert.ok(locData.length > 0);

    // Proximity parameter query
    const proxReq = new Request('http://localhost/api/notams?lat=38.89&lon=-77.03&radius=30&fresh=1', {
      method: 'GET',
    });
    const proxRes = await handler(proxReq);
    assert.equal(proxRes.status, 200);
    const proxData = await proxRes.json();
    assert.ok(Array.isArray(proxData));
    assert.ok(proxData.length > 0);
  });

  it('client service fetchFaaNotams supports FetchNotamsOptions and boolean forceRefresh', async () => {
    const notamsSrc = readSrc('src/services/notams.ts');
    assert.ok(notamsSrc.includes('FetchNotamsOptions'), 'Must export FetchNotamsOptions interface');
    assert.ok(notamsSrc.includes('locations?: string[]'), 'Must support locations array option');
    assert.ok(notamsSrc.includes('lat?: number'), 'Must support lat proximity option');
    assert.ok(notamsSrc.includes('lon?: number'), 'Must support lon proximity option');
    assert.ok(notamsSrc.includes('radiusNm?: number'), 'Must support radiusNm proximity option');
    assert.ok(notamsSrc.includes('optionsOrForceRefresh'), 'Must support options object or boolean forceRefresh');
  });

  it('guarantees caching interval stays strictly under 50 requests per month', async () => {
    // 18 hours cache TTL
    assert.equal(NOTAM_CACHE_TTL_HOURS, 18, 'Cache TTL hours must be 18');
    assert.equal(CACHE_MAX_AGE_SEC, 64800, 'max-age seconds must be 64800 (18 hours)');
    assert.equal(CACHE_TTL_MS, 18 * 60 * 60 * 1000, 'CACHE_TTL_MS must be 64,800,000 ms');

    // Monthly quota calculation verification:
    // A 31-day month has 744 hours; 744 / 18 = 41.33 requests
    // A 30-day month has 720 hours; 720 / 18 = 40.00 requests
    const maxMonthlyRequests31Days = (31 * 24) / NOTAM_CACHE_TTL_HOURS;
    const maxMonthlyRequests30Days = (30 * 24) / NOTAM_CACHE_TTL_HOURS;
    assert.ok(maxMonthlyRequests31Days < 50, `31-day requests (${maxMonthlyRequests31Days}) must be under 50`);
    assert.ok(maxMonthlyRequests30Days < 50, `30-day requests (${maxMonthlyRequests30Days}) must be under 50`);

    // Verify Cache-Control response header
    const req = new Request('http://localhost/api/notams', { method: 'GET' });
    const res = await handler(req);
    const cc = res.headers.get('Cache-Control');
    assert.ok(cc);
    assert.ok(cc.includes('max-age=64800'));
    assert.ok(cc.includes('s-maxage=64800'));

    // Verify client service circuit breaker TTL
    const notamsSrc = readSrc('src/services/notams.ts');
    assert.ok(notamsSrc.includes('18 * 60 * 60 * 1000'), 'Client circuit breaker must use 18-hour TTL');
  });
});
