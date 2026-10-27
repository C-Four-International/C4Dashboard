import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Eagle Intelligence AIS chokepoint tooltip is shortened in DeckGLMap and Map', async (t) => {
  const deckGlSrc = fs.readFileSync('src/components/DeckGLMap.ts', 'utf8');
  const popupSrc = fs.readFileSync('src/components/MapPopup.ts', 'utf8');
  const mapSrc = fs.readFileSync('src/components/Map.ts', 'utf8');

  await t.test('DeckGLMap contains dedicated shortened tooltip for eagleintelmari AIS chokepoints', () => {
    assert.ok(deckGlSrc.includes("case 'ais-disruptions-layer':"), 'DeckGLMap must have case ais-disruptions-layer');
    assert.ok(deckGlSrc.includes('eagleintelmari.com'), 'DeckGLMap must identify eagleintelmari source in ais-disruptions-layer');
    assert.ok(deckGlSrc.includes('<strong>AIS Chokepoint</strong>'), 'Tooltip must show <strong>AIS Chokepoint</strong>');
    assert.ok(deckGlSrc.includes('eagleintelmari.com</small>'), 'Tooltip must show eagleintelmari.com source');
  });

  await t.test('DeckGLMap leaves everything else out of the hover tooltip for eagle chokepoint', () => {
    const aisLayerBlock = deckGlSrc.slice(
      deckGlSrc.indexOf("case 'ais-disruptions-layer':"),
      deckGlSrc.indexOf("case 'cable-advisories-layer':")
    );

    // Ensure the eagle branch returns early without obj.description
    assert.ok(aisLayerBlock.includes('if (isEagle) {'), 'Must check isEagle condition');
    assert.ok(!aisLayerBlock.includes('${text(obj.description)}</div>`\n          };'), 'Eagle branch must not include obj.description');
  });

  await t.test('MapPopup retains full context popup for AIS chokepoints on click', () => {
    assert.ok(popupSrc.includes('renderAisPopup'), 'MapPopup must render AIS popup on click');
    assert.ok(popupSrc.includes('popup-header ais'), 'MapPopup must have ais header');
    assert.ok(popupSrc.includes('popup-stats'), 'MapPopup must show detailed stats');
    assert.ok(popupSrc.includes('View situation report on eagleintelmari.com'), 'MapPopup must show link to situation report');
    assert.ok(popupSrc.includes('Data provided by'), 'MapPopup must show license attribution');
  });

  await t.test('Map.ts SVG fallback includes concise title attribute for eagle chokepoint markers', () => {
    assert.ok(mapSrc.includes("div.title = `AIS Chokepoint"), 'Map.ts must set concise title for eagle chokepoints');
  });
});
