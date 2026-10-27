import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import handler from '../api/notams.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('FAA NOTAMs via NASA DIP Catalog API & Desktop Layer Integration', () => {
  it('serves FAA NOTAMs with 6-hour Cache-Control header and CORS support', async () => {
    const req = new Request('http://localhost/api/notams', {
      method: 'GET',
      headers: {
        'Origin': 'https://worldmonitor.app',
      },
    });

    const res = await handler(req);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('Cache-Control');
    assert.ok(cacheControl, 'Cache-Control header must be set');
    assert.ok(cacheControl.includes('max-age=21600'), 'Cache-Control must specify 21600 seconds (6 hours)');
    assert.ok(cacheControl.includes('s-maxage=21600'), 'Cache-Control must specify s-maxage=21600');

    const allowOrigin = res.headers.get('Access-Control-Allow-Origin');
    assert.equal(allowOrigin, 'https://worldmonitor.app');

    const notams = await res.json();
    assert.ok(Array.isArray(notams), 'Payload must be an array of NOTAMs');
    assert.ok(notams.length >= 6, 'Must contain NOTAMs across all requested categories');
  });

  it('provides all 6 designated NOTAM airspace types', async () => {
    const req = new Request('http://localhost/api/notams', { method: 'GET' });
    const res = await handler(req);
    const notams = await res.json();

    const types = new Set(notams.map((n) => n.type));

    assert.ok(types.has('tfr'), 'Must include Temporary Flight Restrictions (tfr)');
    assert.ok(types.has('restricted'), 'Must include Restricted areas (restricted)');
    assert.ok(types.has('danger'), 'Must include Danger areas (danger)');
    assert.ok(types.has('prohibited'), 'Must include Prohibited areas (prohibited)');
    assert.ok(types.has('moa'), 'Must include Military Operating Areas (moa)');
    assert.ok(types.has('closure'), 'Must include Airspace Reservations & Closures (closure)');

    // Verify properties of each NOTAM item
    for (const item of notams) {
      assert.ok(item.id, 'NOTAM must have an id');
      assert.ok(item.notamNumber, 'NOTAM must have a notamNumber');
      assert.ok(item.typeLabel, 'NOTAM must have a typeLabel');
      assert.ok(typeof item.lat === 'number' && !isNaN(item.lat), 'lat must be numeric');
      assert.ok(typeof item.lon === 'number' && !isNaN(item.lon), 'lon must be numeric');
      assert.ok(typeof item.radiusNm === 'number' && item.radiusNm > 0, 'radiusNm must be positive number');
      assert.ok(item.lowerAlt, 'lowerAlt must be defined');
      assert.ok(item.upperAlt, 'upperAlt must be defined');
      assert.ok(item.reason, 'reason context must be present');
      assert.ok(item.source.includes('NASA DIP') || item.source.includes('FAA SWIM'), 'Source must credit NASA DIP / FAA SWIM');
    }
  });

  it('supports cache hits and force-refresh via ?fresh=1', async () => {
    const req1 = new Request('http://localhost/api/notams', { method: 'GET' });
    const res1 = await handler(req1);
    assert.equal(res1.status, 200);

    const req2 = new Request('http://localhost/api/notams', { method: 'GET' });
    const res2 = await handler(req2);
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('X-Cache'), 'HIT', 'Subsequent request within 6h window should HIT cache');

    const req3 = new Request('http://localhost/api/notams?fresh=1', { method: 'GET' });
    const res3 = await handler(req3);
    assert.equal(res3.status, 200);
    assert.equal(res3.headers.get('X-Cache'), 'MISS', 'fresh=1 should bypass edge cache');
  });

  it('handles OPTIONS preflight request', async () => {
    const req = new Request('http://localhost/api/notams', {
      method: 'OPTIONS',
      headers: { 'Origin': 'https://worldmonitor.app' },
    });
    const res = await handler(req);
    assert.equal(res.status, 204);
  });

  it('rejects disallowed methods and disallowed origins', async () => {
    const postReq = new Request('http://localhost/api/notams', { method: 'POST' });
    const postRes = await handler(postReq);
    assert.equal(postRes.status, 405);

    const badOriginReq = new Request('http://localhost/api/notams', {
      method: 'GET',
      headers: { 'Origin': 'https://malicious-site.example.com' },
    });
    const badRes = await handler(badOriginReq);
    assert.equal(badRes.status, 403);
  });

  it('defines 6-hour client circuit breaker TTL and semi-transparent color mappings', () => {
    const notamsSrc = readSrc('src/services/notams.ts');

    assert.ok(notamsSrc.includes('6 * 60 * 60 * 1000'), 'Must use 6-hour cache TTL (6 * 60 * 60 * 1000)');
    assert.ok(notamsSrc.includes('createCircuitBreaker'), 'Must use circuit breaker');
    assert.ok(notamsSrc.includes('fetchFaaNotams'), 'Must export fetchFaaNotams');
    assert.ok(notamsSrc.includes('getNotamColor'), 'Must export getNotamColor');

    // Verify all 6 types have color mappings
    const types = ['tfr', 'prohibited', 'restricted', 'danger', 'moa', 'closure'];
    for (const t of types) {
      assert.ok(notamsSrc.includes(`${t}:`), `Must configure color for ${t}`);
    }

    // Verify semi-transparent alpha channels in fill (e.g. 90) and stroke (e.g. 230)
    assert.ok(notamsSrc.includes('239, 68, 68, 90'), 'TFR fill must be semi-transparent red');
    assert.ok(notamsSrc.includes('220, 38, 38, 90'), 'Prohibited fill must be semi-transparent crimson');
    assert.ok(notamsSrc.includes('249, 115, 22, 90'), 'Restricted fill must be semi-transparent orange');
    assert.ok(notamsSrc.includes('234, 179, 8, 90'), 'Danger fill must be semi-transparent yellow/gold');
    assert.ok(notamsSrc.includes('59, 130, 246, 90'), 'MOA fill must be semi-transparent blue');
    assert.ok(notamsSrc.includes('168, 85, 247, 90'), 'Closure fill must be semi-transparent purple');
  });

  it('renders MapPopup context information with coverage area, altitudes, and NASA DIP attribution', () => {
    const popupSrc = readSrc('src/components/MapPopup.ts');

    assert.ok(popupSrc.includes("case 'notam':"), 'MapPopup must handle case "notam"');
    assert.ok(popupSrc.includes('renderNotamPopup'), 'MapPopup must implement renderNotamPopup');
    assert.ok(popupSrc.includes('NASA Digital Information Platform (DIP)'), 'Popup must credit NASA DIP');
    assert.ok(popupSrc.includes('Coverage Area'), 'Popup must display Coverage Area');
    assert.ok(popupSrc.includes('Altitude Limits'), 'Popup must display Altitude Limits');
    assert.ok(popupSrc.includes('Effective Window'), 'Popup must display Effective Window');
  });

  it('renders tooltip with NOTAM number and type in DeckGLMap', () => {
    const deckSrc = readSrc('src/components/DeckGLMap.ts');

    assert.ok(deckSrc.includes("case 'notams-layer':"), 'DeckGLMap must handle case "notams-layer" in tooltip');
    assert.ok(deckSrc.includes('notam.typeLabel'), 'Tooltip must show NOTAM type');
    assert.ok(deckSrc.includes('notam.notamNumber'), 'Tooltip must show NOTAM number');
    assert.ok(deckSrc.includes("'notams-layer': 'notam'"), 'layerToPopupType must map notams-layer to notam');
    assert.ok(deckSrc.includes('createNotamsLayer'), 'DeckGLMap must implement createNotamsLayer');
    assert.ok(deckSrc.includes('setNotams'), 'DeckGLMap must implement setNotams');
  });

  it('loads NOTAMs in Aviation layer on desktop runtime via DataLoader', () => {
    const loaderSrc = readSrc('src/app/data-loader.ts');

    assert.ok(loaderSrc.includes('fetchFaaNotams'), 'DataLoader must import fetchFaaNotams');
    assert.ok(loaderSrc.includes('isDesktopRuntime()'), 'DataLoader must check isDesktopRuntime()');
    assert.ok(loaderSrc.includes('this.ctx.map?.setNotams(notams)'), 'DataLoader must pass notams to map');
  });

  it('mentions FAA NOTAMs and NASA DIP catalog in layer description and legend', () => {
    const enSrc = readSrc('src/locales/en.json');
    assert.ok(enSrc.includes('FAA NOTAM airspace restrictions'), 'en.json must mention FAA NOTAM airspace restrictions');
    assert.ok(enSrc.includes('NASA DIP catalog'), 'en.json must mention NASA DIP catalog');
    assert.ok(enSrc.includes('Cache: 6 hours') || enSrc.includes('Cache: 6 hrs'), 'en.json must mention 6 hours cache');

    const deckSrc = readSrc('src/components/DeckGLMap.ts');
    assert.ok(deckSrc.includes('Airspace Restrictions (FAA NOTAMs)'), 'DeckGLMap legend must include Airspace Restrictions');
    assert.ok(deckSrc.includes('NASA DIP catalog'), 'DeckGLMap legend must mention NASA DIP catalog');
  });
});
