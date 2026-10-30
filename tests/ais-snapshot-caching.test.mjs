import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('AIS Snapshot Caching & Throttling Optimization', () => {
  it('api/ais-snapshot.js enforces IP sliding window rate limiting (10 req/min)', () => {
    const src = readSrc('api/ais-snapshot.js');
    assert.match(src, /const RATE_LIMIT = 10;/, 'Should set RATE_LIMIT to 10');
    assert.match(src, /isRateLimited\(clientIp\)/, 'Should check if client IP is rate limited');
    assert.match(src, /status: 429/, 'Should return HTTP 429 when rate limited');
  });

  it('api/ais-snapshot.js has edge instance in-memory cache and in-flight fetch deduplication', () => {
    const src = readSrc('api/ais-snapshot.js');
    assert.match(src, /const edgeCache = new Map\(\);/, 'Should define edgeCache map');
    assert.match(src, /const inFlightFetches = new Map\(\);/, 'Should define inFlightFetches map');
    assert.match(src, /const EDGE_CACHE_TTL_MS = 60 \* 1000;/, 'Should have 60s TTL');
    assert.match(src, /'X-Edge-Cache': 'HIT'/, 'Should set X-Edge-Cache header on cache hit');
    assert.match(src, /'X-Edge-Cache': isFresh \? 'MISS' : 'HIT-INFLIGHT'/, 'Should track in-flight deduplication');
  });

  it('api/ais-snapshot.js sets 5-minute CDN cache with stale-while-revalidate', () => {
    const src = readSrc('api/ais-snapshot.js');
    assert.match(src, /s-maxage=300/, 'CDN s-maxage should be 300 seconds');
    assert.match(src, /stale-while-revalidate=600/, 'stale-while-revalidate should be 600 seconds');
  });

  it('src/services/maritime/index.ts attempts direct Railway bypass when VITE_WS_RELAY_URL is configured', () => {
    const src = readSrc('src/services/maritime/index.ts');
    assert.match(src, /function getDirectRailwayUrl\(\)/, 'Should define getDirectRailwayUrl');
    assert.match(src, /DIRECT_RAILWAY_URL/, 'Should use DIRECT_RAILWAY_URL constant');
    assert.match(src, /globalThis\.fetch\(`\$\{DIRECT_RAILWAY_URL\}\?candidates=true`/, 'Should fetch directly from Railway relay first');
    assert.match(src, /globalThis\.fetch\('\/api\/ais-snapshot\?candidates=true'\)/, 'Should fall back to Vercel edge proxy if direct fetch fails');
  });

  it('scripts/ais-relay.cjs caps candidate reports to 5,000 to keep snapshot size bounded', () => {
    const src = readSrc('scripts/ais-relay.cjs');
    assert.match(src, /MAX_CANDIDATE_REPORTS = Math\.min\(25000, Number\(process\.env\.AIS_MAX_CANDIDATE_REPORTS \|\| 5000\)\);/,
      'Should default MAX_CANDIDATE_REPORTS to 5000');
  });
});

