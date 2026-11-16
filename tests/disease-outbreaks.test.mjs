import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readSrc = (relPath) => readFileSync(resolve(__dirname, '..', relPath), 'utf8');

describe('Disease Outbreaks Layer (WHO DON & CDC Socrata)', () => {
  it('implements backend endpoint api/outbreaks.js with CORS and edge runtime', async () => {
    assert.ok(existsSync(resolve(__dirname, '../api/outbreaks.js')), 'api/outbreaks.js must exist');
    const endpointSrc = readSrc('api/outbreaks.js');
    assert.match(endpointSrc, /runtime:\s*['"]edge['"]/, 'Should declare edge runtime');
    assert.match(endpointSrc, /getCorsHeaders/, 'Must use CORS headers');
    assert.match(endpointSrc, /who\.int\/api\/news\/diseaseoutbreaknews/, 'Must query WHO Disease Outbreak News API');
    assert.match(endpointSrc, /data\.cdc\.gov\/resource\/x9gk-5huc/, 'Must query CDC Socrata NNDSS API');
    assert.match(endpointSrc, /REDIS_KEY\s*=\s*['"]wm:outbreaks:v1['"]/, 'Must declare Redis cache key');
  });

  it('serves valid DiseaseOutbreak objects from api/outbreaks.js', async () => {
    const mod = await import('../api/outbreaks.js');
    const req = new Request('http://localhost:3000/api/outbreaks');
    const res = await mod.default(req);
    assert.equal(res.status, 200, 'Should return HTTP 200');
    assert.equal(res.headers.get('content-type'), 'application/json');

    const body = await res.json();
    assert.ok(body.totalCount > 0, 'Must return at least 1 outbreak');
    assert.ok(body.whoCount > 0, 'Must contain WHO outbreaks');
    assert.ok(body.cdcCount > 0, 'Must contain CDC outbreaks');
    assert.ok(Array.isArray(body.outbreaks), 'Must have outbreaks array');

    const first = body.outbreaks[0];
    assert.ok(first.id, 'Outbreak must have id');
    assert.ok(['WHO', 'CDC'].includes(first.source), 'Source must be WHO or CDC');
    assert.ok(first.disease, 'Must have disease name');
    assert.ok(first.location, 'Must have location');
    assert.ok(typeof first.lat === 'number', 'lat must be numeric');
    assert.ok(typeof first.lon === 'number', 'lon must be numeric');
    assert.ok(['critical', 'high', 'moderate', 'monitoring'].includes(first.severity), 'Must have valid severity tier');
  });

  it('handles OPTIONS preflight and rejects disallowed methods in api/outbreaks.js', async () => {
    const mod = await import('../api/outbreaks.js');
    const optionsReq = new Request('http://localhost:3000/api/outbreaks', { method: 'OPTIONS' });
    const optionsRes = await mod.default(optionsReq);
    assert.equal(optionsRes.status, 204, 'OPTIONS must return 204 No Content');

    const postReq = new Request('http://localhost:3000/api/outbreaks', { method: 'POST' });
    const postRes = await mod.default(postReq);
    assert.equal(postRes.status, 405, 'POST must return 405 Method Not Allowed');
  });

  it('registers layer in MapLayers, urlState, and default panels', () => {
    const typesSrc = readSrc('src/types/index.ts');
    assert.match(typesSrc, /outbreaks:\s*boolean;/, 'MapLayers interface must include outbreaks');

    const urlStateSrc = readSrc('src/utils/urlState.ts');
    assert.match(urlStateSrc, /'outbreaks'/, 'urlState LAYER_KEYS must include outbreaks');

    const panelsSrc = readSrc('src/config/panels.ts');
    assert.match(panelsSrc, /outbreaks:\s*false/, 'FULL_MAP_LAYERS must define outbreaks');

    const commandsSrc = readSrc('src/config/commands.ts');
    assert.match(commandsSrc, /id:\s*'layer:outbreaks'/, 'Commands must have layer:outbreaks toggle');
  });

  it('integrates outbreaks layer into DeckGLMap with biohazard icon, tooltip, and popup', () => {
    const deckSrc = readSrc('src/components/DeckGLMap.ts');
    assert.match(deckSrc, /biohazard:\s*'data:image\/svg\+xml;base64,/, 'MARKER_ICONS must include biohazard icon');
    assert.match(deckSrc, /createOutbreaksLayer/, 'Must implement createOutbreaksLayer()');
    assert.match(deckSrc, /id:\s*['"]outbreaks-layer['"]/, 'Layer ID must be outbreaks-layer');
    assert.match(deckSrc, /case\s*['"]outbreaks-layer['"]:/, 'getTooltip must handle outbreaks-layer');
    assert.match(deckSrc, /'outbreaks-layer':\s*['"]outbreak['"]/, 'layerToPopupType must map outbreaks-layer to outbreak');
    assert.match(deckSrc, /public setOutbreaks\(outbreaks:\s*DiseaseOutbreak\[\]\):/, 'DeckGLMap must have setOutbreaks method');
  });

  it('adds layer info to Legend and Layer Guide in DeckGLMap and Map', () => {
    const deckSrc = readSrc('src/components/DeckGLMap.ts');
    assert.match(deckSrc, /shapes\.biohazard/, 'Legend must render biohazard shape');
    assert.match(deckSrc, /case\s*['"]outbreaks['"]:\s*return\s*['"]outbreaksDesc['"]/, 'getLayerDescriptionKey must map outbreaks to outbreaksDesc');
    assert.match(deckSrc, /Critical \(Ebola, MERS, H5N1\)/, 'Legend must display severity subswatches');

    const enLocale = JSON.parse(readSrc('src/locales/en.json'));
    assert.equal(enLocale.components?.deckgl?.layers?.outbreaks, 'Disease Outbreaks', 'en.json must have layer title');
    assert.match(enLocale.components?.deckgl?.layerHelp?.descriptions?.outbreaksDesc, /WHO Disease Outbreak News.*CDC Socrata/, 'en.json must describe WHO DON & CDC Socrata');
  });

  it('renders rich Outbreak details in MapPopup with cases and official bulletin link', () => {
    const popupSrc = readSrc('src/components/MapPopup.ts');
    assert.match(popupSrc, /case\s*['"]outbreak['"]:/, 'MapPopup must handle outbreak popup type');
    assert.match(popupSrc, /renderOutbreakPopup/, 'MapPopup must implement renderOutbreakPopup');
    assert.match(popupSrc, /WHO Disease Outbreak News \(DON\)/, 'Popup must display WHO DON source label');
    assert.match(popupSrc, /CDC National Notifiable Diseases \(NNDSS\)/, 'Popup must display CDC NNDSS source label');
    assert.match(popupSrc, /View Official Bulletin/, 'Popup must offer link to official report');
  });

  it('loads outbreaks data via DataLoader on startup and layer toggle', () => {
    const loaderSrc = readSrc('src/app/data-loader.ts');
    assert.match(loaderSrc, /loadOutbreaksData/, 'DataLoader must implement loadOutbreaksData');
    assert.match(loaderSrc, /case\s*['"]outbreaks['"]:/, 'loadDataForLayer must handle outbreaks');
    assert.match(loaderSrc, /this\.ctx\.map\?\.setOutbreaks/, 'Must pass data to map');
    assert.match(loaderSrc, /this\.ctx\.map\?\.setLayerReady\('outbreaks',\s*true\)/, 'Must mark layer ready');
  });
});
