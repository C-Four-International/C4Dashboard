import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

describe('Military Layer Filtering for Unknown Commercial/Civilian Aircraft and Ships', () => {
  const militarySrc = readSrc('src/config/military.ts');
  const flightsSrc = readSrc('src/services/military-flights.ts');
  const vesselsSrc = readSrc('src/services/military-vessels.ts');
  const deckGlSrc = readSrc('src/components/DeckGLMap.ts');
  const svgMapSrc = readSrc('src/components/Map.ts');
  const serverSharedSrc = readSrc('server/worldmonitor/military/v1/_shared.ts');

  it('exports shouldFilterOutAircraft and shouldFilterOutShip from military.ts', () => {
    assert.match(militarySrc, /export function shouldFilterOutAircraft/, 'Must export shouldFilterOutAircraft');
    assert.match(militarySrc, /export function shouldFilterOutShip/, 'Must export shouldFilterOutShip');
    assert.match(militarySrc, /export function isMilitaryCallsignFormat/, 'Must export isMilitaryCallsignFormat');
    assert.match(militarySrc, /export function isMilitaryVesselNameFormat/, 'Must export isMilitaryVesselNameFormat');
  });

  it('purges commercial airline codes (CCA, CHH, ELAL, SVA) from adversary and allied military callsign tables', () => {
    assert.doesNotMatch(militarySrc, /pattern:\s*'\^CCA'/, 'Must not match commercial Air China (CCA) as military');
    assert.doesNotMatch(militarySrc, /pattern:\s*'\^CHH'/, 'Must not match commercial Hainan Airlines (CHH) as military');
    assert.doesNotMatch(militarySrc, /pattern:\s*'\^ELAL'/, 'Must not match commercial El Al (ELAL) as military');
    assert.doesNotMatch(militarySrc, /pattern:\s*'\^SVA'/, 'Must not match commercial Saudia (SVA) as military');
  });

  it('DeckGLMap filters out unknown non-military aircraft and ships before rendering and superclustering', () => {
    assert.match(
      deckGlSrc,
      /filteredMilitaryFlights[\s\S]*?\.filter\(\(flight\)\s*=>\s*!shouldFilterOutAircraft\(flight\)\)/,
      'DeckGLMap must filter out unknown non-military aircraft from filteredMilitaryFlights'
    );
    assert.match(
      deckGlSrc,
      /filteredMilitaryVessels[\s\S]*?\.filter\(\(vessel\)\s*=>\s*!shouldFilterOutShip\(vessel\)\)/,
      'DeckGLMap must filter out unknown non-military vessels from filteredMilitaryVessels'
    );
  });

  it('SVG Map fallback filters out unknown non-military aircraft and ships', () => {
    assert.match(
      svgMapSrc,
      /this\.militaryFlights\.filter\(\(flight\)\s*=>\s*!shouldFilterOutAircraft\(flight\)\)\.forEach/,
      'SVG Map must filter out unknown non-military aircraft before drawing'
    );
    assert.match(
      svgMapSrc,
      /this\.militaryVessels\.filter\(\(vessel\)\s*=>\s*!shouldFilterOutShip\(vessel\)\)\.forEach/,
      'SVG Map must filter out unknown non-military vessels before drawing'
    );
  });

  it('military-flights service filters out unknown non-military aircraft at ingestion and return', () => {
    assert.match(flightsSrc, /shouldFilterOutAircraft/, 'military-flights must use shouldFilterOutAircraft');
    assert.match(flightsSrc, /flights\s*=\s*flights\.filter\(\(f\)\s*=>\s*!shouldFilterOutAircraft\(f\)\)/,
      'military-flights must filter returned flights before clustering');
  });

  it('military-vessels service rejects unknown non-military vessels at stream and return', () => {
    assert.match(vesselsSrc, /shouldFilterOutShip/, 'military-vessels must use shouldFilterOutShip');
    assert.match(vesselsSrc, /!shouldFilterOutShip\(v\)/, 'military-vessels must filter tracked vessels before return');
  });

  it('server-side military shared helper rejects commercial airline callsigns', () => {
    assert.match(serverSharedSrc, /AIRLINE_CODES\.has\(prefix3\)/, 'Server must reject commercial airline callsign prefixes');
  });

  it('US civil hex blocks (A00000-A3FFFF and AF0000-AFFFFF) are purged from MILITARY_HEX_RANGES', () => {
    assert.doesNotMatch(militarySrc, /start:\s*['"]A00000['"]/, 'A00000 must not be in military hex ranges');
    assert.doesNotMatch(militarySrc, /end:\s*['"]AFFFFF['"]/, 'AFFFFF must not be in military hex ranges');
    assert.match(militarySrc, /start:\s*['"]AE0000['"],\s*end:\s*['"]AEFFFF['"]/, 'AE0000-AEFFFF must be DoD block');
  });

  it('filters out unknown-type aircraft matching commercial airlines or lacking military signatures', async () => {
    const { shouldFilterOutAircraft } = await import('../src/config/military.ts');

    // Commercial flights with unknown type -> MUST filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'AAL123', hexCode: 'A00001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'CCA981', hexCode: '780001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'CHH712', hexCode: '780002' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'ELAL315', hexCode: '738000' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'SVA100', hexCode: '710001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'DLH456', hexCode: '3C0001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'BAW284', hexCode: '400001' }), true);

    // Generic unknown aircraft without military callsign or hex -> MUST filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'UNKN-1234', hexCode: 'A00001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: '', hexCode: 'A00001' }), true);

    // Tactical/military flights with unknown aircraft type -> MUST NOT filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'RCH412', hexCode: 'A00001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'FORTE10', hexCode: 'A00001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'VIPER11', hexCode: 'A00001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'BONE01', hexCode: 'A00001' }), false);

    // Confirmed military DoD hex -> MUST NOT filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: '', hexCode: 'AE0123' }), false);

    // Known military aircraft type (fighter, tanker, etc.) -> MUST NOT filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'fighter', callsign: 'UNKNOWN', hexCode: 'A00001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'tanker', callsign: '', hexCode: 'A00001' }), false);

    // Confirmed military enrichment flag -> MUST NOT filter out
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'CIVIL1', hexCode: 'A00001', enrichment: { confirmedMilitary: true } }), false);
  });

  it('filters out unknown-type ships lacking naval formats, prefixes, or confirmed military flags', async () => {
    const { shouldFilterOutShip } = await import('../src/config/military.ts');

    // Civilian commercial vessels with unknown type -> MUST filter out
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'MSC ISABELLA' }), true);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'EVER GIVEN' }), true);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'CARGO EXPRESS' }), true);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'F/V OCEAN STAR' }), true);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'PACIFIC TANKER' }), true);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'VESSEL 12345' }), true);

    // Known naval prefixes -> MUST NOT filter out
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'USS MASON' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'HMS DEFENDER' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'CNS SHANDONG' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'FGS SACHSEN' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'USNS COMFORT' }), false);

    // Naval hull numbers -> MUST NOT filter out
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'DDG-51' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'CVN-78' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'LCS-2' }), false);

    // Confirmed AIS military/law enforcement type -> MUST NOT filter out
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'PATROL 1', shipType: 35 }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'PATROL 1', aisShipType: 'Military Ops' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'COAST GUARD 101', shipType: 55 }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'unknown', name: 'COAST GUARD 101', aisShipType: 'Law Enforcement' }), false);

    // Known warship type -> MUST NOT filter out
    assert.equal(shouldFilterOutShip({ vesselType: 'destroyer', name: 'ANY NAME' }), false);
    assert.equal(shouldFilterOutShip({ vesselType: 'frigate', name: 'ANY NAME' }), false);
  });
});
