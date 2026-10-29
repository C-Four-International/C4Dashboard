import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSrc = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf-8');

describe('BGP Routing Anomalies layer fallback dashboard availability', () => {
  it('DeckGLMap initializes bgpAnomalies in unavailableLayers Set', () => {
    const src = readSrc('src/components/DeckGLMap.ts');
    assert.match(
      src,
      /unavailableLayers:\s*Set<keyof\s*MapLayers>\s*=\s*new\s*Set\(\s*\[['"]bgpAnomalies['"]/,
      'DeckGLMap should initialize unavailableLayers with bgpAnomalies to prevent flash of available layer'
    );
  });

  it('DeckGLMap marks bgpAnomalies unavailable when unconfigured or on fetch error', () => {
    const src = readSrc('src/components/DeckGLMap.ts');
    assert.match(
      src,
      /this\.setLayerUnavailable\(['"]bgpAnomalies['"],\s*true,\s*['"]BGP Anomalies API unavailable['"]\)/,
      'DeckGLMap should explicitly set bgpAnomalies unavailable when API is unconfigured or fails'
    );
  });

  it('MapComponent (SVG fallback) marks bgpAnomalies unavailable and disabled', () => {
    const src = readSrc('src/components/Map.ts');
    assert.match(
      src,
      /const\s+isUnavailable\s*=\s*layer\s*===\s*['"]bgpAnomalies['"]/,
      'MapComponent should identify bgpAnomalies as unavailable during button creation'
    );
    assert.match(
      src,
      /if\s*\(\s*this\.isLayerUnavailable\(layer\)\s*\)\s*return;/,
      'MapComponent toggleLayer should guard against toggling unavailable layers'
    );
    assert.match(
      src,
      /if\s*\(\s*layer\s*===\s*['"]bgpAnomalies['"]\s*\)\s*return\s+true;/,
      'MapComponent isLayerUnavailable should return true for bgpAnomalies'
    );
  });

  it('App.ts explicitly marks bgpAnomalies as unavailable after init', () => {
    const src = readSrc('src/App.ts');
    assert.match(
      src,
      /this\.state\.map\?\.setLayerUnavailable\(['"]bgpAnomalies['"],\s*true,\s*['"]BGP Anomalies API unavailable['"]\);/,
      'App.ts should mark bgpAnomalies as unavailable alongside unconfigured layers'
    );
  });

  it('DataLoaderManager probeLayerApis ensures bgpAnomalies is marked unavailable', () => {
    const src = readSrc('src/app/data-loader.ts');
    assert.match(
      src,
      /this\.ctx\.map\?\.setLayerUnavailable\(['"]bgpAnomalies['"],\s*true,\s*['"]BGP Anomalies API unavailable['"]\);/,
      'DataLoaderManager probeLayerApis should mark bgpAnomalies as unavailable'
    );
  });

  it('bgp-anomalies service defaults to unconfigured in fallback build', () => {
    const src = readSrc('src/services/bgp-anomalies.ts');
    assert.match(
      src,
      /let\s+anomaliesConfigured:\s*boolean\s*\|\s*null\s*=\s*false;/,
      'anomaliesConfigured should default to false in fallback build'
    );
  });

  it('api/bgp-anomalies.js supports HEAD probes and returns 503 when token is absent', () => {
    const src = readSrc('api/bgp-anomalies.js');
    assert.match(
      src,
      /if\s*\(\s*req\.method\s*===\s*['"]HEAD['"]\s*\)\s*\{\s*return\s+new\s+Response\(null,\s*\{\s*status:\s*apiToken\s*\?\s*200\s*:\s*503/,
      'api/bgp-anomalies.js should handle HEAD probes and return 503 when unconfigured'
    );
    assert.match(
      src,
      /if\s*\(\s*!apiToken\s*\)\s*\{\s*return\s+new\s+Response\(JSON\.stringify\(\{\s*configured:\s*false/s,
      'api/bgp-anomalies.js should return configured: false when token absent'
    );
    assert.match(
      src,
      /status:\s*503,\s*headers:\s*\{\s*['"]Content-Type['"]:\s*['"]application\/json['"]/,
      'api/bgp-anomalies.js should return 503 instead of 200 when token absent'
    );
  });
});
