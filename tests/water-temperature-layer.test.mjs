import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Water surface temperature layer configuration in types and configs', () => {
  const typesIndex = fs.readFileSync('src/types/index.ts', 'utf8');
  assert.ok(typesIndex.includes('waterTemperature: boolean;'), 'MapLayers interface must include waterTemperature');

  const panelsTs = fs.readFileSync('src/config/panels.ts', 'utf8');
  assert.ok(panelsTs.includes('waterTemperature: false'), 'panels.ts must define waterTemperature in default layer sets');

  const fullVariantTs = fs.readFileSync('src/config/variants/full.ts', 'utf8');
  assert.ok(fullVariantTs.includes('waterTemperature: false'), 'full.ts variant must include waterTemperature');

  const urlStateTs = fs.readFileSync('src/utils/urlState.ts', 'utf8');
  assert.ok(urlStateTs.includes("'waterTemperature'"), 'urlState.ts must include waterTemperature in LAYER_KEYS');

  const commandsTs = fs.readFileSync('src/config/commands.ts', 'utf8');
  assert.ok(commandsTs.includes('layer:waterTemperature'), 'commands.ts must include layer:waterTemperature');
});

test('DeckGLMap Natural category and NASA GIBS WMTS heatmap implementation', () => {
  const deckGlMapTs = fs.readFileSync('src/components/DeckGLMap.ts', 'utf8');

  // Must construct layer with NASA GIBS Sea Surface Temperature
  assert.ok(deckGlMapTs.includes('createWaterTemperatureLayer'), 'DeckGLMap must have createWaterTemperatureLayer method');
  assert.ok(
    deckGlMapTs.includes('GHRSST_L4_MUR_Sea_Surface_Temperature'),
    'Must use NASA GIBS GHRSST_L4_MUR_Sea_Surface_Temperature layer'
  );
  assert.ok(
    deckGlMapTs.includes('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature'),
    'Must target NASA GIBS EPSG:3857 best WMTS endpoint'
  );
  assert.ok(deckGlMapTs.includes('GoogleMapsCompatible_Level7'), 'Must use GoogleMapsCompatible_Level7 TileMatrixSet');

  // Must be in buildLayers
  assert.ok(
    deckGlMapTs.includes('if (mapLayers.waterTemperature)'),
    'buildLayers must check mapLayers.waterTemperature'
  );

  // Must be in Natural category
  assert.ok(
    deckGlMapTs.includes("{ key: 'waterTemperature', label: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp', icon: '&#127754;' }"),
    'Natural category must include waterTemperature layer toggle'
  );

  // Must have legend
  assert.ok(deckGlMapTs.includes('createWaterTempLegend'), 'DeckGLMap must create water temperature legend');
  assert.ok(deckGlMapTs.includes('water-temp-legend'), 'DeckGLMap must attach water-temp-legend element');
});

test('Styling and i18n localization for water surface temperature layer', () => {
  const mainCss = fs.readFileSync('src/styles/main.css', 'utf8');
  assert.ok(mainCss.includes('.water-temp-legend'), 'main.css must style .water-temp-legend');
  assert.ok(mainCss.includes('.water-temp-gradient'), 'main.css must style .water-temp-gradient');

  const enJson = fs.readFileSync('src/locales/en.json', 'utf8');
  assert.ok(enJson.includes('"waterTemperature": "Water Surface Temp"'), 'en.json must define waterTemperature label');
  assert.ok(enJson.includes('"waterTemperatureDesc"'), 'en.json must define waterTemperatureDesc');
});

test('Proxy allowlists include NASA GIBS Earthdata domain', () => {
  const rssProxyJs = fs.readFileSync('api/rss-proxy.js', 'utf8');
  assert.ok(rssProxyJs.includes("'gibs.earthdata.nasa.gov'"), 'api/rss-proxy.js must allow gibs.earthdata.nasa.gov');

  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  assert.ok(viteConfig.includes("'gibs.earthdata.nasa.gov'"), 'vite.config.ts must allow gibs.earthdata.nasa.gov');
});
