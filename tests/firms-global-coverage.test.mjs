/**
 * Tests verifying global NASA FIRMS coverage for the Fires layer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('NASA FIRMS Global Coverage in listFireDetections', () => {
  const src = readSrc('server/worldmonitor/wildfire/v1/list-fire-detections.ts');

  it('includes South America in MONITORED_REGIONS', () => {
    assert.match(src, /['"]South America['"]:\s*['"]-90,-56,-34,15['"]/);
  });

  it('includes Africa in MONITORED_REGIONS', () => {
    assert.match(src, /['"]Southern & Eastern Africa['"]/);
    assert.match(src, /['"]Central & Western Africa['"]/);
    assert.match(src, /['"]Northern Africa['"]/);
  });

  it('includes Australia & Oceania in MONITORED_REGIONS', () => {
    assert.match(src, /['"]Australia & Oceania['"]:\s*['"]110,-48,180,-10['"]/);
  });

  it('includes Southeast Asia and South Asia in MONITORED_REGIONS', () => {
    assert.match(src, /['"]Southeast Asia['"]/);
    assert.match(src, /['"]South Asia['"]/);
  });

  it('has getRegionName fallback so no global fire detection is discarded', () => {
    assert.match(src, /function getRegionName\(/);
    assert.doesNotMatch(
      src,
      /if\s*\(\s*matchedRegion\s*\)\s*\{\s*const row/,
      'Should not drop rows if matchedRegion was not in initial dict'
    );
  });

  it('correctly maps VIIRS C2 confidence strings (nominal, high, low)', () => {
    assert.match(src, /lower\s*===\s*['"]h['"]\s*\|\|\s*lower\s*===\s*['"]high['"]/);
    assert.match(src, /lower\s*===\s*['"]n['"]\s*\|\|\s*lower\s*===\s*['"]nominal['"]/);
    assert.match(src, /lower\s*===\s*['"]l['"]\s*\|\|\s*lower\s*===\s*['"]low['"]/);
  });
});

describe('DeckGLMap Fires Layer Tooltip', () => {
  const src = readSrc('src/components/DeckGLMap.ts');

  it('provides rich tooltip for fires-layer hover', () => {
    assert.match(src, /case\s*['"]fires-layer['"]:\s*\{/);
    assert.match(src, /Brightness:/);
    assert.match(src, /FRP:/);
  });
});
