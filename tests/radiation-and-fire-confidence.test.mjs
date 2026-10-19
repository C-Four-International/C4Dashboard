import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Fire Confidence Scoring', () => {
  const wildfireServerSrc = readFileSync(
    resolve(__dirname, '../server/worldmonitor/wildfire/v1/list-fire-detections.ts'),
    'utf-8'
  );
  const wildfireServiceSrc = readFileSync(
    resolve(__dirname, '../src/services/wildfires/index.ts'),
    'utf-8'
  );
  const deckGlSrc = readFileSync(
    resolve(__dirname, '../src/components/DeckGLMap.ts'),
    'utf-8'
  );
  const svgMapSrc = readFileSync(
    resolve(__dirname, '../src/components/Map.ts'),
    'utf-8'
  );

  it('server maps string words, letters, and percentages to proper enums', () => {
    assert.ok(
      wildfireServerSrc.includes("s === 'n' || s === 'nominal'"),
      'Server must parse nominal / n'
    );
    assert.ok(
      wildfireServerSrc.includes("s === 'h' || s === 'high'"),
      'Server must parse high / h'
    );
    assert.ok(
      wildfireServerSrc.includes("s === 'l' || s === 'low'"),
      'Server must parse low / l'
    );
    assert.ok(
      wildfireServerSrc.includes('num >= 80'),
      'Server must parse numeric confidence >= 80 as high'
    );
    assert.ok(
      wildfireServerSrc.includes('num >= 40'),
      'Server must parse numeric confidence >= 40 as nominal'
    );
  });

  it('client confidenceToNumber handles enums, numbers, and string values', () => {
    assert.ok(
      wildfireServiceSrc.includes("case 'FIRE_CONFIDENCE_HIGH':"),
      'Client handles FIRE_CONFIDENCE_HIGH'
    );
    assert.ok(
      wildfireServiceSrc.includes('if (c === 3) return 95;'),
      'Client maps numeric enum code 3 to 95'
    );
    assert.ok(
      wildfireServiceSrc.includes("case 'FIRE_CONFIDENCE_NOMINAL':"),
      'Client handles FIRE_CONFIDENCE_NOMINAL'
    );
    assert.ok(
      wildfireServiceSrc.includes('if (c === 2) return 50;'),
      'Client maps numeric enum code 2 to 50'
    );
    assert.ok(
      wildfireServiceSrc.includes("case 'FIRE_CONFIDENCE_LOW':"),
      'Client handles FIRE_CONFIDENCE_LOW'
    );
    assert.ok(
      wildfireServiceSrc.includes('if (c === 1) return 20;'),
      'Client maps numeric enum code 1 to 20'
    );
    assert.ok(
      wildfireServiceSrc.includes("lower === 'high' || lower === 'h'"),
      'Client maps raw high/h to 95'
    );
    assert.ok(
      wildfireServiceSrc.includes("lower === 'nominal' || lower === 'n'"),
      'Client maps raw nominal/n to 50'
    );
    assert.ok(
      wildfireServiceSrc.includes("lower === 'low' || lower === 'l'"),
      'Client maps raw low/l to 20'
    );
  });

  it('tooltips display fire confidence properly formatted', () => {
    assert.ok(
      deckGlSrc.includes('confStr = `${confNum}% (${confLabel})`;'),
      'DeckGLMap tooltip must format confidence percentage and label'
    );
    assert.ok(
      svgMapSrc.includes('confLabel ? `${confNum}% (${confLabel})`'),
      'SVG Map tooltip must format confidence percentage and label'
    );
  });
});

describe('Radiation Monitoring Layer (EPA RadNet + Chernobyl & Fukushima)', () => {
  const radiationApiSrc = readFileSync(
    resolve(__dirname, '../api/radiation.js'),
    'utf-8'
  );
  const deckGlSrc = readFileSync(
    resolve(__dirname, '../src/components/DeckGLMap.ts'),
    'utf-8'
  );
  const popupSrc = readFileSync(
    resolve(__dirname, '../src/components/MapPopup.ts'),
    'utf-8'
  );
  const dataLoaderSrc = readFileSync(
    resolve(__dirname, '../src/app/data-loader.ts'),
    'utf-8'
  );
  const typesSrc = readFileSync(
    resolve(__dirname, '../src/types/index.ts'),
    'utf-8'
  );

  it('EPA RadNet stations list includes major US cities', () => {
    assert.ok(radiationApiSrc.includes("'radnet-dc-washington'"), 'Must include Washington DC');
    assert.ok(radiationApiSrc.includes("'radnet-ma-boston'"), 'Must include Boston');
    assert.ok(radiationApiSrc.includes("'radnet-ny-albany'"), 'Must include Albany/NY');
    assert.ok(radiationApiSrc.includes("'radnet-pa-philadelphia'"), 'Must include Philadelphia');
    assert.ok(radiationApiSrc.includes("'radnet-ga-atlanta'"), 'Must include Atlanta');
    assert.ok(radiationApiSrc.includes("'radnet-fl-miami'"), 'Must include Miami');
    assert.ok(radiationApiSrc.includes("'radnet-il-chicago'"), 'Must include Chicago');
    assert.ok(radiationApiSrc.includes("'radnet-mi-detroit'"), 'Must include Detroit');
    assert.ok(radiationApiSrc.includes("'radnet-tx-houston'"), 'Must include Houston');
    assert.ok(radiationApiSrc.includes("'radnet-ca-losangeles'"), 'Must include Los Angeles');
    assert.ok(radiationApiSrc.includes("'radnet-ca-sanfrancisco'"), 'Must include San Francisco');
    assert.ok(radiationApiSrc.includes("'radnet-wa-seattle'"), 'Must include Seattle');
    assert.ok(radiationApiSrc.includes('radnet.epa.gov/cdx-radnet-rest/api/rest/csv/'), 'Must fetch EPA CSV endpoint');
  });

  it('includes Chernobyl and Fukushima with Safecast source and live coordinates', () => {
    assert.ok(radiationApiSrc.includes("'safecast-chernobyl'"), 'Must include Chernobyl');
    assert.ok(radiationApiSrc.includes('51.389'), 'Chernobyl latitude');
    assert.ok(radiationApiSrc.includes('30.099'), 'Chernobyl longitude');
    assert.ok(radiationApiSrc.includes("'safecast-fukushima'"), 'Must include Fukushima');
    assert.ok(radiationApiSrc.includes('37.4214'), 'Fukushima latitude');
    assert.ok(radiationApiSrc.includes('141.0326'), 'Fukushima longitude');
    assert.ok(radiationApiSrc.includes('api.safecast.org/measurements.json'), 'Must query Safecast API');
  });

  it('registers radiation layer under Infrastructure category in UI and DeckGLMap', () => {
    assert.ok(typesSrc.includes('radiation: boolean;'), 'MapLayers must have radiation');
    assert.ok(deckGlSrc.includes("title: 'Infrastructure'"), 'DeckGLMap must have Infrastructure category');
    assert.ok(deckGlSrc.includes("{ key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '&#9762;' }"), 'DeckGLMap layers must place radiation in infrastructure category');
    assert.ok(deckGlSrc.includes("case 'radiation-layer':"), 'DeckGLMap must have tooltip case for radiation-layer');
    assert.ok(deckGlSrc.includes("'radiation-layer': 'radiation'"), 'DeckGLMap must map radiation-layer to radiation popup');
  });

  it('MapPopup renders radiation popup with CPM and dose metrics', () => {
    assert.ok(popupSrc.includes("case 'radiation':"), 'MapPopup must handle radiation popup type');
    assert.ok(popupSrc.includes('renderRadiationPopup'), 'MapPopup must have renderRadiationPopup method');
    assert.ok(popupSrc.includes('CPM'), 'Popup must show CPM reading');
    assert.ok(popupSrc.includes('Dose Equivalent'), 'Popup must show dose equivalent');
    assert.ok(popupSrc.includes('EPA RadNet'), 'Popup must credit EPA RadNet');
  });

  it('data-loader loads radiation data on startup and on layer toggle', () => {
    assert.ok(dataLoaderSrc.includes('loadRadiationData'), 'data-loader must have loadRadiationData');
    assert.match(dataLoaderSrc, /case 'radiation':\s*await this\.loadRadiationData\(\);/);
  });

  it('supports SAFECAST_API_KEY and caches radiation data for at least 6 hours', () => {
    const radiationServiceSrc = readFileSync(
      resolve(__dirname, '../src/services/radiation/index.ts'),
      'utf-8'
    );
    assert.ok(radiationApiSrc.includes('process.env.SAFECAST_API_KEY'), 'API must check SAFECAST_API_KEY');
    assert.ok(radiationApiSrc.includes('6 * 60 * 60 * 1000'), 'API in-memory cache TTL must be 6 hours');
    assert.ok(radiationApiSrc.includes('max-age=21600'), 'API Cache-Control header must cache for 21600 seconds (6 hours)');
    assert.ok(radiationApiSrc.includes('s-maxage=21600'), 'API Cache-Control s-maxage must cache for 21600 seconds (6 hours)');
    assert.ok(radiationServiceSrc.includes('6 * 60 * 60 * 1000'), 'Client circuit breaker must cache for 6 hours');
  });

  it('includes major cities across Europe, Asia, and Middle East in Safecast stations', () => {
    const radiationServiceSrc = readFileSync(
      resolve(__dirname, '../src/services/radiation/index.ts'),
      'utf-8'
    );
    // Europe
    assert.ok(radiationApiSrc.includes("'safecast-london'"), 'Must include London in API');
    assert.ok(radiationApiSrc.includes("'safecast-paris'"), 'Must include Paris in API');
    assert.ok(radiationApiSrc.includes("'safecast-berlin'"), 'Must include Berlin in API');
    assert.ok(radiationApiSrc.includes("'safecast-rome'"), 'Must include Rome in API');
    assert.ok(radiationApiSrc.includes("'safecast-madrid'"), 'Must include Madrid in API');
    assert.ok(radiationApiSrc.includes("'safecast-kyiv'"), 'Must include Kyiv in API');

    // Asia
    assert.ok(radiationApiSrc.includes("'safecast-tokyo'"), 'Must include Tokyo in API');
    assert.ok(radiationApiSrc.includes("'safecast-seoul'"), 'Must include Seoul in API');
    assert.ok(radiationApiSrc.includes("'safecast-taipei'"), 'Must include Taipei in API');
    assert.ok(radiationApiSrc.includes("'safecast-hongkong'"), 'Must include Hong Kong in API');
    assert.ok(radiationApiSrc.includes("'safecast-singapore'"), 'Must include Singapore in API');

    // Middle East
    assert.ok(radiationApiSrc.includes("'safecast-istanbul'"), 'Must include Istanbul in API');
    assert.ok(radiationApiSrc.includes("'safecast-dubai'"), 'Must include Dubai in API');
    assert.ok(radiationApiSrc.includes("'safecast-telaviv'"), 'Must include Tel Aviv in API');
    assert.ok(radiationApiSrc.includes("'safecast-jerusalem'"), 'Must include Jerusalem in API');
    assert.ok(radiationApiSrc.includes("'safecast-doha'"), 'Must include Doha in API');

    // Baseline coverage in client service
    assert.ok(radiationServiceSrc.includes("'safecast-london'"), 'Must include London in service baseline');
    assert.ok(radiationServiceSrc.includes("'safecast-tokyo'"), 'Must include Tokyo in service baseline');
    assert.ok(radiationServiceSrc.includes("'safecast-dubai'"), 'Must include Dubai in service baseline');
    assert.ok(radiationServiceSrc.includes("'safecast-telaviv'"), 'Must include Tel Aviv in service baseline');
  });

  it('queries Safecast with captured_after to fetch fresh data and avoid stale historical readings', () => {
    assert.ok(radiationApiSrc.includes('captured_after='), 'API query must specify captured_after parameter');
    assert.ok(radiationApiSrc.includes('api_key='), 'API query must append api_key when present');
  });
});

