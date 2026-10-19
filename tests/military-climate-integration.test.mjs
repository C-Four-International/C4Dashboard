/**
 * Tests verifying the fix for Military Activity layer glitching
 * when combined with Climate Anomalies layer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('Military Vessel Pattern & AIS Classification', () => {
  it('does not classify all UK vessels (MMSI 232xxx) as military', () => {
    const src = readSrc('src/config/military.ts');
    assert.doesNotMatch(
      src,
      /mmsiPrefix:\s*['"]232['"]\s*,/,
      'Should not match bare 232 prefix as it matches all UK merchant/civilian vessels'
    );
    assert.match(
      src,
      /mmsiPrefix:\s*['"]2320['"]/,
      'Should maintain specific Royal Navy prefix 2320'
    );
  });

  it('does not classify random vessels with 00/99 suffixes as military in analyzeMmsi', () => {
    const src = readSrc('src/services/military-vessels.ts');
    assert.doesNotMatch(
      src,
      /suffix\.startsWith\(['"]00['"]\)/,
      'Should not flag vessels with suffix 00 as military'
    );
  });

  it('restricts getVesselTypeFromAis to actual military/law enforcement types (35 and 55)', () => {
    const src = readSrc('src/services/military-vessels.ts');
    assert.doesNotMatch(
      src,
      /shipType\s*>=\s*50\s*&&\s*shipType\s*<=\s*59/,
      'Should not map all 50-59 utility/port vessels to special military type'
    );
    assert.match(src, /shipType\s*===\s*35\s*\)\s*return\s*['"]destroyer['"]/);
    assert.match(src, /shipType\s*===\s*55\s*\)\s*return\s*['"]patrol['"]/);
  });

  it('filters candidateReports in ais-relay.cjs to genuine military craft', () => {
    const src = readSrc('scripts/ais-relay.cjs');
    assert.match(
      src,
      /if\s*\(\s*isLikelyMilitaryCandidate\(candidateMeta\)\s*\)\s*\{\s*candidateReports\.set/,
      'candidateReports should only store verified military candidates'
    );
    assert.doesNotMatch(
      src,
      /shipType\s*>=\s*50\s*&&\s*shipType\s*<=\s*59/,
      'ais-relay should not consider all 50-59 utility craft as military'
    );
  });
});

describe('DataLoader Decoupling for Climate and Displacement', () => {
  const src = readSrc('src/app/data-loader.ts');

  it('delegates climate layer toggle to dedicated loadClimate()', () => {
    assert.match(
      src,
      /case\s*['"]climate['"]:\s*await\s+this\.loadClimate\(\);/
    );
  });

  it('delegates displacement layer toggle to dedicated loadDisplacement()', () => {
    assert.match(
      src,
      /case\s*['"]displacement['"]:\s*await\s+this\.loadDisplacement\(\);/
    );
  });

  it('has dedicated loadClimate method that manages climate layer independently', () => {
    assert.match(
      src,
      /async\s+loadClimate\(\):\s*Promise<void>/,
      'DataLoader must have loadClimate method'
    );
    assert.match(
      src,
      /this\.ctx\.map\?\.setClimateAnomalies\(anomalies\)/
    );
  });

  it('has dedicated loadDisplacement method that manages displacement layer independently', () => {
    assert.match(
      src,
      /async\s+loadDisplacement\(\):\s*Promise<void>/,
      'DataLoader must have loadDisplacement method'
    );
    assert.match(
      src,
      /this\.ctx\.map\?\.setDisplacementFlows\(data\.topFlows\)/
    );
  });
});

describe('DeckGLMap Layer Hierarchy & Pulse Animation', () => {
  const src = readSrc('src/components/DeckGLMap.ts');

  it('includes extreme climate anomalies in needsPulseAnimation', () => {
    assert.match(
      src,
      /this\.climateAnomalies\.some\(\s*a\s*=>\s*a\.severity\s*===\s*['"]extreme['"]\s*\)/,
      'Extreme climate anomalies should trigger pulse animation loop'
    );
  });

  it('places climate background layers before military vessels in buildLayers', () => {
    const climateIdx = src.indexOf('layers.push(...this.createClimateLayers());');
    const militaryVesselsIdx = src.indexOf('layers.push(this.createMilitaryVesselsLayer(filteredMilitaryVessels));');
    assert.ok(climateIdx > -1, 'createClimateLayers should be present in buildLayers');
    assert.ok(militaryVesselsIdx > -1, 'createMilitaryVesselsLayer should be present in buildLayers');
    assert.ok(
      climateIdx < militaryVesselsIdx,
      'Climate background heatmaps must be rendered before military vessels to prevent obscuring'
    );
  });
});
