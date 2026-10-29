import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MapTiler weather layer hierarchy displays pressure beneath precipitation and radar', () => {
  const deckGlMapTs = fs.readFileSync('src/components/DeckGLMap.ts', 'utf8');

  // Verify syncWeatherLayersOrder helper method exists
  assert.ok(
    deckGlMapTs.includes('syncWeatherLayersOrder(): void'),
    'DeckGLMap must have a dedicated syncWeatherLayersOrder helper'
  );

  // Verify that syncWeatherLayersOrder orders pressure before precipitation/radar
  assert.ok(
    deckGlMapTs.includes("this.maplibreMap.moveLayer('maptiler-pressure', beforePressureId)"),
    'syncWeatherLayersOrder must move maptiler-pressure before precipitation or radar'
  );

  // Verify precipitation is moved before radar
  assert.ok(
    deckGlMapTs.includes("this.maplibreMap.moveLayer('maptiler-precipitation', 'maptiler-radar')"),
    'syncWeatherLayersOrder must move maptiler-precipitation before maptiler-radar'
  );

  // Verify that during initial staggered loading, pressure is placed beneath precipitation/radar
  assert.ok(
    deckGlMapTs.includes("const beforePressureId = this.maplibreMap.getLayer('maptiler-precipitation')"),
    'Staggered loader and updateLayers must calculate beforePressureId using maptiler-precipitation as first choice'
  );

  // Verify that addLayer for pressure receives beforePressureId
  assert.ok(
    deckGlMapTs.includes("this.maplibreMap.addLayer(this.mapTilerPressureLayer as any, beforePressureId)"),
    'Must pass beforePressureId when adding maptiler-pressure layer'
  );

  // Verify that addLayer for precipitation receives beforePrecipId ('maptiler-radar')
  assert.ok(
    deckGlMapTs.includes("this.maplibreMap.addLayer(this.mapTilerPrecipitationLayer as any, beforePrecipId)"),
    'Must pass beforePrecipId when adding maptiler-precipitation layer'
  );
});
