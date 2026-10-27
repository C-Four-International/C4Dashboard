import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('Internet Outages Infrastructure Layer with 3-Hour Cache', () => {
  it('configures 3-hour cache TTL on client circuit breaker', () => {
    const infraSrc = readSrc('src/services/infrastructure/index.ts');

    assert.ok(infraSrc.includes('OUTAGES_CACHE_TTL_MS = 3 * 60 * 60 * 1000'), 'Must define 3-hour cache TTL (3 * 60 * 60 * 1000 ms)');
    assert.ok(infraSrc.includes("cacheTtlMs: OUTAGES_CACHE_TTL_MS"), 'outageBreaker must use OUTAGES_CACHE_TTL_MS');
  });

  it('configures 3-hour cache TTL on server Cloudflare Radar handler', () => {
    const serverHandlerSrc = readSrc('server/worldmonitor/infrastructure/v1/list-internet-outages.ts');

    assert.ok(serverHandlerSrc.includes('REDIS_CACHE_TTL = 10800') || serverHandlerSrc.includes('REDIS_CACHE_TTL = 3 * 3600'), 'Server REDIS_CACHE_TTL must be 3 hours (10,800s)');
    assert.ok(serverHandlerSrc.includes('https://api.cloudflare.com/client/v4/radar/annotations/outages'), 'Must call Cloudflare Radar API');
  });

  it('adds internet outages to desktop Infrastructure layer category in DeckGLMap', () => {
    const deckSrc = readSrc('src/components/DeckGLMap.ts');

    // Verify in full variant category
    const fullInfraMatch = deckSrc.match(/id:\s*'infrastructure'[\s\S]*?layers:\s*\[([\s\S]*?)\]/);
    assert.ok(fullInfraMatch, 'Must find infrastructure category in DeckGLMap');
    assert.ok(deckSrc.includes("{ key: 'outages', label: t('components.deckgl.layers.internetOutages')"), 'Infrastructure category must contain outages layer');

    // Verify layer is built when mapLayers.outages is active
    assert.ok(deckSrc.includes('if (mapLayers.outages && filteredOutages.length > 0)'), 'Must render outages layer when mapLayers.outages is active');
    assert.ok(deckSrc.includes('createOutagesLayer'), 'Must call createOutagesLayer');
  });

  it('adds Internet Outages legend entry with severity subswatches in DeckGLMap', () => {
    const deckSrc = readSrc('src/components/DeckGLMap.ts');

    assert.ok(deckSrc.includes("name: t('components.deckgl.layers.internetOutages')"), 'DeckGLMap legend must include internetOutages item');
    assert.ok(deckSrc.includes('Cloudflare Radar'), 'Legend entry must mention Cloudflare Radar');
    assert.ok(deckSrc.includes('Cache: 3 hours'), 'Legend entry must state 3 hours cache');
    assert.ok(deckSrc.includes("label: 'Total'"), 'Legend subswatches must include Total');
    assert.ok(deckSrc.includes("label: 'Major'"), 'Legend subswatches must include Major');
    assert.ok(deckSrc.includes("label: 'Partial'"), 'Legend subswatches must include Partial');
  });

  it('updates layer description to mention Cloudflare Radar and 3-hour cache', () => {
    const enSrc = readSrc('src/locales/en.json');

    assert.ok(enSrc.includes('"infraOutages":'), 'en.json must contain infraOutages');
    assert.ok(enSrc.includes('Cloudflare Radar. [Cache: 3 hours]'), 'infraOutages must mention Cloudflare Radar and 3 hours cache');
  });

  it('dispatches outages loading in data loader when layer is active', () => {
    const loaderSrc = readSrc('src/app/data-loader.ts');

    assert.ok(loaderSrc.includes("if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.outages) tasks.push({ name: 'outages', task: runGuarded('outages', () => this.loadOutages()) })"), 'data-loader must load outages in loadInitialData when active');
    assert.ok(loaderSrc.includes('case \'outages\':'), 'data-loader must handle outages toggle in onLayerToggled');
  });
});
