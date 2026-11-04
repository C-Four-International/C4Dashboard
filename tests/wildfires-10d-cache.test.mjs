import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('NASA FIRMS 24h Retrieval & 10-Day Caching', () => {
  const serverSrc = readSrc('server/worldmonitor/wildfire/v1/list-fire-detections.ts');
  const clientSrc = readSrc('src/services/wildfires/index.ts');
  const deckMapSrc = readSrc('src/components/DeckGLMap.ts');
  const svgMapSrc = readSrc('src/components/Map.ts');

  it('uses operational NASA FIRMS feeds (NOAA-20 J1, NOAA-21 J2, MODIS) instead of idle Suomi-NPP alone', () => {
    assert.match(serverSrc, /noaa-20-viirs-c2.*J1_VIIRS_C2_Global_24h\.csv/, 'Must include NOAA-20 24h VIIRS feed');
    assert.match(serverSrc, /noaa-21-viirs-c2.*J2_VIIRS_C2_Global_24h\.csv/, 'Must include NOAA-21 24h VIIRS feed');
    assert.match(serverSrc, /modis-c6\.1.*MODIS_C6_1_Global_24h\.csv/, 'Must include MODIS 24h feed');
  });

  it('retrieves all detections without arbitrary 3500-cap or 315K frp<2 filter', () => {
    assert.doesNotMatch(serverSrc, /fireDetections\.slice\(0,\s*3500\)/, 'Should not artificially truncate to 3500 items');
    assert.doesNotMatch(serverSrc, /frp < 2\.0 && brightness < 315/, 'Should not artificially drop valid thermal detections');
  });

  it('implements 10-day retention and accumulation in server cache', () => {
    assert.match(serverSrc, /TEN_DAYS_MS\s*=\s*10\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Must define 10-day millisecond window');
    assert.match(serverSrc, /TEN_DAYS_SECONDS\s*=\s*10\s*\*\s*24\s*\*\s*60\s*\*\s*60/, 'Must define 10-day TTL in seconds');
    assert.match(serverSrc, /cutoff/, 'Must prune detections older than the cutoff window');
  });

  it('implements 10-day persistent cache and accumulation on the client service', () => {
    assert.match(clientSrc, /PERSISTENT_CACHE_KEY\s*=\s*['"]wildfires:10d:v1['"]/, 'Client must use dedicated 10-day persistent cache');
    assert.match(clientSrc, /TEN_DAYS_MS\s*=\s*10\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Client must retain 10 days of detections');
    assert.match(clientSrc, /setPersistentCache/, 'Client must persist accumulated detections');
  });

  it('toMapFires maps detectedAt timestamp and MapFire interface supports detectedAt', () => {
    assert.match(clientSrc, /export interface MapFire[\s\S]*?detectedAt\?: number;/, 'MapFire interface must include detectedAt');
    assert.match(clientSrc, /toMapFires[\s\S]*?detectedAt: f\.detectedAt,/, 'toMapFires must map detectedAt');
  });

  it('DeckGLMap filters fires using detectedAt for sub-day and multi-day precision', () => {
    assert.match(deckMapSrc, /this\.filterByTime\(this\.firmsFireData,\s*\(fire\)\s*=>\s*fire\.detectedAt\s*\?\?\s*fire\.acq_date\)/,
      'DeckGLMap must use fire.detectedAt for time selection menu');
  });

  it('Map SVG fallback respects time selection menu cutoff', () => {
    assert.match(svgMapSrc, /this\.state\.timeRange === 'all' \? 0 : Date\.now\(\) - this\.getTimeRangeMs\(\)/,
      'Map SVG fallback must calculate cutoff based on timeRange');
    assert.match(svgMapSrc, /ts < cutoff/,
      'Map SVG fallback must filter fires older than cutoff');
  });
});
