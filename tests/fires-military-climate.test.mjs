import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Fires layer is expanded across all continents and has continent fallback classifier', () => {
  const src = fs.readFileSync('server/worldmonitor/wildfire/v1/list-fire-detections.ts', 'utf8');

  // Verify all continents are represented in regional bounding boxes
  assert.ok(src.includes('North America'), 'Must contain North America region definitions');
  assert.ok(src.includes('South America'), 'Must contain South America region definitions');
  assert.ok(src.includes('Europe'), 'Must contain Europe region definitions');
  assert.ok(src.includes('Africa'), 'Must contain Africa region definitions');
  assert.ok(src.includes('Asia'), 'Must contain Asia region definitions');
  assert.ok(src.includes('Australia'), 'Must contain Australia region definitions');
  assert.ok(src.includes('Antarctica'), 'Must contain Antarctica region definitions');

  // Verify continent fallback classifier
  assert.ok(src.includes('function classifyContinent'), 'Must have classifyContinent fallback classifier');
  assert.ok(src.includes('classifyContinent(lat, lon)'), 'Must invoke classifyContinent fallback in parseAndFilterCSV');
});

test('DeckGLMap and SVG Map implement hover tooltip for fires layer', () => {
  const deckGlSrc = fs.readFileSync('src/components/DeckGLMap.ts', 'utf8');

  // Must have case 'fires-layer': in getTooltip
  assert.ok(deckGlSrc.includes("case 'fires-layer':"), 'DeckGLMap getTooltip must have case fires-layer');
  assert.ok(deckGlSrc.includes('🔥'), 'fires-layer tooltip must include fire icon');
  assert.ok(deckGlSrc.includes('Math.round(fire.brightness)'), 'fires-layer tooltip must format brightness');
  assert.ok(deckGlSrc.includes('fire.frp'), 'fires-layer tooltip must format FRP');

  const svgMapSrc = fs.readFileSync('src/components/Map.ts', 'utf8');
  assert.ok(svgMapSrc.includes('🔥'), 'SVG Map must format fire tooltip with fire icon');
  assert.ok(svgMapSrc.includes('conf'), 'SVG Map must include confidence in fire tooltip');
});

test('Military Activity layer is isolated from Climate Anomalies toggle in data-loader', () => {
  const loaderSrc = fs.readFileSync('src/app/data-loader.ts', 'utf8');

  // loadDataForLayer('climate') must call dedicated loadClimate, NOT loadIntelligenceSignals
  assert.match(
    loaderSrc,
    /case 'climate':\s*await this\.loadClimate\(\);\s*break;/,
    "loadDataForLayer('climate') must call loadClimate()"
  );

  assert.ok(loaderSrc.includes('async loadClimate(): Promise<void>'), 'data-loader must have loadClimate method');
  assert.ok(loaderSrc.includes('async loadDisplacement(): Promise<void>'), 'data-loader must have loadDisplacement method');

  // loadIntelligenceSignals must not overwrite military tracking if already cached
  assert.ok(
    loaderSrc.includes('if (this.ctx.intelligenceCache.military)'),
    'loadIntelligenceSignals must check intelligenceCache.military before re-initiating military fetch'
  );
});

test('Military vessel classification guards against false-positive AIS signals', () => {
  const militaryConfig = fs.readFileSync('src/config/military.ts', 'utf8');

  // Should NOT contain overly broad UK country MID '232'
  assert.ok(
    !militaryConfig.includes("{ mmsiPrefix: '232',"),
    "MILITARY_VESSEL_PATTERNS must not match generic UK MID '232'"
  );
  assert.ok(
    militaryConfig.includes("{ mmsiPrefix: '2320',"),
    "MILITARY_VESSEL_PATTERNS should match specific UK military prefix '2320'"
  );

  // Chinese carrier hull numbers should not be loose 2-digit numbers
  assert.ok(militaryConfig.includes("hullNumber: 'CV-16'"), 'Liaoning hullNumber must be specific CV-16');
  assert.ok(militaryConfig.includes("hullNumber: 'CV-17'"), 'Shandong hullNumber must be specific CV-17');
  assert.ok(militaryConfig.includes("hullNumber: 'CV-18'"), 'Fujian hullNumber must be specific CV-18');

  const vesselsSrc = fs.readFileSync('src/services/military-vessels.ts', 'utf8');

  // Should NOT treat all 50-59 (tugs, pilot boats, port tenders) as military
  assert.ok(
    !vesselsSrc.includes("shipType >= 50 && shipType <= 59"),
    'getVesselTypeFromAis must not classify harbor service craft 50-59 as military'
  );

  // Should NOT treat arbitrary suffix 00/99 as military warships
  assert.ok(
    !vesselsSrc.includes("suffix.startsWith('00')"),
    'analyzeMmsi must not treat arbitrary suffix 00 as military warships'
  );
});
