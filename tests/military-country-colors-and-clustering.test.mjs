import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const militaryPath = join(process.cwd(), 'src', 'config', 'military.ts');
const deckGlMapPath = join(process.cwd(), 'src', 'components', 'DeckGLMap.ts');

test('Military Country Color Coding and Shapes', async (t) => {
  await t.test('military.ts exports getMilitaryCountryColor and MILITARY_COUNTRY_LEGEND', async () => {
    const code = readFileSync(militaryPath, 'utf8');
    assert.match(code, /export function getMilitaryCountryColor/);
    assert.match(code, /export const MILITARY_COUNTRY_LEGEND/);
  });

  await t.test('DeckGLMap defines distinct warship icon in MARKER_ICONS', async () => {
    const code = readFileSync(deckGlMapPath, 'utf8');
    assert.match(code, /delta:\s*'data:image\/svg\+xml;base64/);
    assert.match(code, /warship:\s*'data:image\/svg\+xml;base64/);
    // Warship hull has pointed bow, beam flanks, and transom stern
    assert.ok(code.includes('M16 2 L26 11 L25 28 L7 28 L6 11 Z'));
  });

  await t.test('DeckGLMap uses warship icon and country colors for naval vessels', async () => {
    const code = readFileSync(deckGlMapPath, 'utf8');
    assert.match(code, /createMilitaryVesselsLayer/);
    assert.match(code, /getIcon:\s*\(\)\s*=>\s*'warship'/);
    assert.match(code, /iconAtlas:\s*MARKER_ICONS\.warship/);
    assert.match(code, /getColor:\s*\(d:\s*MilitaryVessel\)\s*=>\s*getMilitaryCountryColor\(d\.operatorCountry,\s*d\.operator\)/);
  });

  await t.test('DeckGLMap uses delta arrow and country colors for military flights', async () => {
    const code = readFileSync(deckGlMapPath, 'utf8');
    assert.match(code, /createMilitaryFlightsLayer/);
    assert.match(code, /getIcon:\s*\(\)\s*=>\s*'delta'/);
    assert.match(code, /iconAtlas:\s*MARKER_ICONS\.delta/);
    assert.match(code, /getColor:\s*\(d:\s*MilitaryFlight\)\s*=>\s*getMilitaryCountryColor\(d\.operatorCountry,\s*d\.operator\)/);
  });

  await t.test('DeckGLMap groups military assets into translucent circles at wide zoom with seamless transition', async () => {
    const code = readFileSync(deckGlMapPath, 'utf8');
    assert.match(code, /rebuildMilitaryFlightSupercluster/);
    assert.match(code, /rebuildMilitaryVesselSupercluster/);
    assert.match(code, /getDynamicMilitaryFlightClusters/);
    assert.match(code, /getDynamicMilitaryVesselClusters/);
    assert.match(code, /createMilitaryClusterLayers/);
    // Check zoom-based opacity cross-fade
    assert.match(code, /clusterOpacity\s*=\s*Math\.max\(0,\s*Math\.min\(1,\s*\(5\.2\s*-\s*currentZoom\)\s*\/\s*1\.2\)\)/);
    assert.match(code, /assetOpacity\s*=\s*Math\.max\(0,\s*Math\.min\(1,\s*\(currentZoom\s*-\s*4\.0\)\s*\/\s*1\.2\)\)/);
    // Realtime 60fps zoom hook
    assert.match(code, /this\.maplibreMap\.on\('zoom',\s*\(\)\s*=>\s*\{\s*this\.rafUpdateLayers\(\);/);
  });

  await t.test('Legend displays distinct air delta and naval warship shapes with country colors', async () => {
    const code = readFileSync(deckGlMapPath, 'utf8');
    assert.match(code, /warship:\s*\(color:\s*string\)/);
    assert.match(code, /tacticalCircle:\s*\(color:\s*string\)/);
    assert.match(code, /name:\s*'Military Aircraft'/);
    assert.match(code, /name:\s*'Naval Combatants'/);
    assert.match(code, /name:\s*'Tactical Grouping \(Wide Zoom\)'/);
    assert.match(code, /badge:\s*'Warship Hull'/);
    assert.match(code, /badge:\s*'Delta Arrow'/);
  });
});
