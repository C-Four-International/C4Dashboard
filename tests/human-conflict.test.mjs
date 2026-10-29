import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Human Conflict Railway relay hook & GDELT Cloud integration', async (t) => {
  const relayPath = path.resolve('scripts/ais-relay.cjs');
  const relayCode = fs.readFileSync(relayPath, 'utf8');

  await t.test('ais-relay.cjs extracts GDELT_API_KEY from environment', () => {
    assert.match(relayCode, /GDELT_API_KEY\s*=\s*process\.env\.GDELT_API_KEY/);
  });

  await t.test('ais-relay.cjs defines /human-conflict handler with caching and deduplication', () => {
    assert.match(relayCode, /handleHumanConflictRequest/);
    assert.match(relayCode, /humanConflictCache/);
    assert.match(relayCode, /humanConflictInFlight/);
    assert.match(relayCode, /https:\/\/gdeltcloud\.com\/api\/v2\/events/);
  });

  await t.test('ais-relay.cjs supports protest, battle, riot, and strategic development categories', () => {
    assert.match(relayCode, /battles/);
    assert.match(relayCode, /protests/);
    assert.match(relayCode, /riots/);
    assert.match(relayCode, /strategic_developments/);
  });

  await t.test('ais-relay.cjs dispatches /human-conflict route and includes health stats', () => {
    assert.match(relayCode, /pathname\.startsWith\(['"]\/human-conflict['"]\)/);
    assert.match(relayCode, /humanConflict:\s*humanConflictCache\.size/);
  });
});

test('Human Conflict edge proxy & client service', async (t) => {
  const proxyPath = path.resolve('api/human-conflict.js');
  assert.ok(fs.existsSync(proxyPath), 'api/human-conflict.js must exist');
  const proxyCode = fs.readFileSync(proxyPath, 'utf8');

  await t.test('api/human-conflict.js proxies to Railway relay with auth and lengthy cache', () => {
    assert.match(proxyCode, /WS_RELAY_URL/);
    assert.match(proxyCode, /RELAY_SHARED_SECRET/);
    assert.match(proxyCode, /\/human-conflict/);
    assert.match(proxyCode, /s-maxage=86400/);
    assert.match(proxyCode, /EDGE_CACHE_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  await t.test('api/human-conflict.js getRelayBaseUrl robustly normalizes URLs without throwing Invalid URL string', async () => {
    const { getRelayBaseUrl } = await import('../api/human-conflict.js');
    const origWs = process.env.WS_RELAY_URL;
    const origVite = process.env.VITE_WS_RELAY_URL;

    try {
      // 1. Without protocol
      process.env.WS_RELAY_URL = 'my-railway-app.up.railway.app';
      delete process.env.VITE_WS_RELAY_URL;
      assert.equal(getRelayBaseUrl(), 'https://my-railway-app.up.railway.app');

      // 2. With quotes and trailing whitespace
      process.env.WS_RELAY_URL = ' "https://my-railway-app.up.railway.app" ';
      assert.equal(getRelayBaseUrl(), 'https://my-railway-app.up.railway.app');

      // 3. With wss:// and path
      process.env.WS_RELAY_URL = 'wss://my-railway-app.up.railway.app/ws';
      assert.equal(getRelayBaseUrl(), 'https://my-railway-app.up.railway.app');

      // 4. Fallback to VITE_WS_RELAY_URL
      delete process.env.WS_RELAY_URL;
      process.env.VITE_WS_RELAY_URL = 'fallback-relay.up.railway.app';
      assert.equal(getRelayBaseUrl(), 'https://fallback-relay.up.railway.app');

      // 5. Completely invalid string returns null instead of throwing
      process.env.WS_RELAY_URL = '::invalid-url::';
      assert.equal(getRelayBaseUrl(), null);
    } finally {
      process.env.WS_RELAY_URL = origWs;
      process.env.VITE_WS_RELAY_URL = origVite;
    }
  });

  const servicePath = path.resolve('src/services/human-conflict.ts');
  assert.ok(fs.existsSync(servicePath), 'src/services/human-conflict.ts must exist');
  const serviceCode = fs.readFileSync(servicePath, 'utf8');

  await t.test('src/services/human-conflict.ts exports fetchHumanConflictEvents with 24-hour circuit breaker', () => {
    assert.match(serviceCode, /export async function fetchHumanConflictEvents/);
    assert.match(serviceCode, /createCircuitBreaker/);
    assert.match(serviceCode, /\/api\/human-conflict/);
    assert.match(serviceCode, /cacheTtlMs:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(serviceCode, /persistCache:\s*true/);
  });
});

test('Human Conflict layer integration in DeckGL and map layers', async (t) => {
  const typesPath = path.resolve('src/types/index.ts');
  const typesCode = fs.readFileSync(typesPath, 'utf8');

  await t.test('types define humanConflict in MapLayers and HumanConflictEvent', () => {
    assert.match(typesCode, /humanConflict:\s*boolean/);
    assert.match(typesCode, /export interface HumanConflictEvent/);
    assert.match(typesCode, /export type HumanConflictCategory/);
  });

  const deckGlPath = path.resolve('src/components/DeckGLMap.ts');
  const deckGlCode = fs.readFileSync(deckGlPath, 'utf8');

  await t.test('DeckGLMap includes humanConflict layer, styling, and tooltip', () => {
    assert.match(deckGlCode, /createHumanConflictLayer/);
    assert.match(deckGlCode, /conflictBattle/);
    assert.match(deckGlCode, /conflictRiot/);
    assert.match(deckGlCode, /conflictProtest/);
    assert.match(deckGlCode, /conflictStrategic/);
    assert.match(deckGlCode, /case 'human-conflict-layer':/);
    assert.match(deckGlCode, /setHumanConflictEvents/);
  });

  const loaderPath = path.resolve('src/app/data-loader.ts');
  const loaderCode = fs.readFileSync(loaderPath, 'utf8');

  await t.test('DataLoaderManager loads and caches human conflict events', () => {
    assert.match(loaderCode, /loadHumanConflict/);
    assert.match(loaderCode, /fetchHumanConflictEvents/);
    assert.match(loaderCode, /case 'humanConflict':/);
  });

  const appPath = path.resolve('src/App.ts');
  const appCode = fs.readFileSync(appPath, 'utf8');

  await t.test('src/App.ts registers 24-hour refresh interval for human conflict', () => {
    assert.match(appCode, /name:\s*['"]humanConflict['"].*intervalMs:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  await t.test('DeckGLMap includes humanConflict in legend with category subswatches', () => {
    assert.match(deckGlCode, /badge:\s*['"]Conflict Dot['"]/);
    assert.match(deckGlCode, /name:\s*t\(['"]components\.deckgl\.layers\.humanConflict['"]\)/);
    assert.match(deckGlCode, /label:\s*['"]Battles['"]/);
    assert.match(deckGlCode, /label:\s*['"]Riots['"]/);
    assert.match(deckGlCode, /label:\s*['"]Protests['"]/);
    assert.match(deckGlCode, /label:\s*['"]Strategic Developments['"]/);
  });

  await t.test('layer descriptions are defined in DeckGLMap, Map, and en.json', () => {
    assert.match(deckGlCode, /case 'humanConflict': return 'humanConflictDesc';/);

    const enLocalesPath = path.resolve('src/locales/en.json');
    const enLocalesCode = fs.readFileSync(enLocalesPath, 'utf8');
    assert.match(enLocalesCode, /"humanConflictDesc":\s*"[^"]+\[Cache:\s*24\s*hours\]"/);

    const mapPath = path.resolve('src/components/Map.ts');
    const mapCode = fs.readFileSync(mapPath, 'utf8');
    assert.match(mapCode, /'humanConflict'/);
    assert.match(mapCode, /humanConflictDesc/);
  });

  await t.test('humanConflict layer icon is 💥 and layer name is Human Conflict', () => {
    assert.match(deckGlCode, /key:\s*['"]humanConflict['"],\s*label:[^,]+,\s*icon:\s*['"]💥['"]/);

    const enLocalesPath = path.resolve('src/locales/en.json');
    const enLocalesCode = fs.readFileSync(enLocalesPath, 'utf8');
    assert.match(enLocalesCode, /"humanConflict":\s*"Human Conflict"/);
  });
});

