import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const countriesGeo = JSON.parse(readFileSync(resolve(__dirname, '../public/data/countries.geojson'), 'utf-8'));

function pointInPolygon(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(pt, coordinates) {
  for (const poly of coordinates) {
    if (pointInPolygon(pt, poly[0])) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInPolygon(pt, poly[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function pointInGeometry(pt, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInMultiPolygon(pt, [geometry.coordinates]);
  } else if (geometry.type === 'MultiPolygon') {
    return pointInMultiPolygon(pt, geometry.coordinates);
  }
  return false;
}

const nameMap = {
  'United States of America': ['United States of America', 'United States'],
  'Korea (Republic of)': ['South Korea', 'Korea, Republic of', 'Republic of Korea', 'Korea'],
  'South Korea': ['South Korea', 'Korea, Republic of', 'Republic of Korea', 'Korea'],
  'Taiwan': ['Taiwan', 'Taiwan, Province of China'],
  'Russia': ['Russia', 'Russian Federation'],
  'United Kingdom': ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'],
  'United Kingdom of Great Britain and Northern Ireland': ['United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'],
  'Iran': ['Iran', 'Iran, Islamic Republic of'],
};

function checkPointInCountry(pt, countryName) {
  if (countryName === 'Singapore') {
    return pt[1] >= 1.15 && pt[1] <= 1.48 && pt[0] >= 103.58 && pt[0] <= 104.05;
  }
  if (countryName === 'Switzerland') {
    if (pt[1] >= 45.8 && pt[1] <= 47.9 && pt[0] >= 5.9 && pt[0] <= 10.5) return true;
  }
  if (countryName === 'Iceland') {
    if (pt[1] >= 63.3 && pt[1] <= 66.6 && pt[0] >= -24.6 && pt[0] <= -13.4) return true;
  }

  const targets = nameMap[countryName] || [countryName];
  for (const f of countriesGeo.features) {
    if (targets.includes(f.properties.name)) {
      if (pointInGeometry(pt, f.geometry)) return true;
    }
  }
  return false;
}

const dcFileContent = readFileSync(resolve(__dirname, '../src/config/ai-datacenters.ts'), 'utf-8');
const dcBlocks = dcFileContent.split(/\{\s*id:\s*'/).slice(1);
const dcs = dcBlocks.map(block => {
  const id = block.match(/^([^']+)'/)[1];
  const name = block.match(/name:\s*'([^']+)'/)[1];
  const country = block.match(/country:\s*'([^']+)'/)[1];
  const lat = parseFloat(block.match(/lat:\s*([-\d.]+)/)[1]);
  const lon = parseFloat(block.match(/lon:\s*([-\d.]+)/)[1]);
  return { id, name, country, lat, lon };
});

describe('AI Data Centers geographic accuracy', () => {
  it('contains expected number of data centers with valid lat/lon ranges', () => {
    assert.ok(dcs.length >= 300, `Expected at least 300 data centers, found ${dcs.length}`);
    for (const dc of dcs) {
      assert.ok(!isNaN(dc.lat) && dc.lat >= -90 && dc.lat <= 90, `Invalid lat for ${dc.id}: ${dc.lat}`);
      assert.ok(!isNaN(dc.lon) && dc.lon >= -180 && dc.lon <= 180, `Invalid lon for ${dc.id}: ${dc.lon}`);
    }
  });

  it('pins major supercomputers and labs to real facilities', () => {
    const verified = [
      { id: 'dc-166', name: 'Argonne NL Aurora', lat: 41.7061, lon: -87.9818 },
      { id: 'dc-237', name: 'University of Florida HiPerGator', lat: 29.6436, lon: -82.3549 },
      { id: 'dc-147', name: 'NERSC Perlmutter LBNL', lat: 37.8768, lon: -122.2508 },
      { id: 'dc-141', name: 'LANL Crossroads', lat: 35.8756, lon: -106.3149 },
      { id: 'dc-102', name: 'Mare Nostrum 5 Barcelona', lat: 41.3892, lon: 2.1158 },
      { id: 'dc-146', name: 'EuroHPC LUMI Kajaani', lat: 64.2273, lon: 27.7285 },
      { id: 'dc-47',  name: 'Jupiter Jülich', lat: 50.9037, lon: 6.4124 },
      { id: 'dc-104', name: 'EuroHPC Leonardo CINECA Bologna', lat: 44.4949, lon: 11.3426 },
      { id: 'dc-92',  name: 'Isambard-AI Bristol', lat: 51.4545, lon: -2.5879 },
      { id: 'dc-24',  name: 'Nscale Loughton UK', lat: 51.6520, lon: 0.0540 },
      { id: 'dc-208', name: 'Azure Voyager-EUS2 Boydton VA', lat: 36.6534, lon: -78.3889 },
    ];

    for (const item of verified) {
      const found = dcs.find(d => d.id === item.id);
      assert.ok(found, `Expected ${item.id} to be found`);
      assert.ok(Math.abs(found.lat - item.lat) < 0.01, `${item.name} lat mismatch: expected ${item.lat}, got ${found.lat}`);
      assert.ok(Math.abs(found.lon - item.lon) < 0.01, `${item.name} lon mismatch: expected ${item.lon}, got ${found.lon}`);
    }
  });

  it('all 313 data centers fall within their respective country boundaries/territories', () => {
    const mislocated = [];
    for (const dc of dcs) {
      const pt = [dc.lon, dc.lat];
      if (!checkPointInCountry(pt, dc.country)) {
        mislocated.push(`${dc.id} (${dc.name}) in ${dc.country} at [${dc.lat}, ${dc.lon}]`);
      }
    }
    assert.deepStrictEqual(mislocated, [], `Found mislocated data centers: ${mislocated.join(', ')}`);
  });
});
