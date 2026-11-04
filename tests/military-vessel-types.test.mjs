import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNavalVessel,
  extractNavalHullAndType,
  KNOWN_NAVAL_VESSELS,
  isMilitaryVesselNameFormat,
} from '../src/config/military.ts';

describe('Naval Vessel Classification & Actual Type Categorization', () => {
  it('correctly categorizes aircraft carriers (carrier)', () => {
    const carriers = [
      { name: 'USS Gerald R. Ford', expType: 'carrier' },
      { name: 'USS Dwight D. Eisenhower (CVN 69)', expType: 'carrier', expHull: 'CVN-69' },
      { name: 'HMS Queen Elizabeth (R08)', expType: 'carrier', expHull: 'R08' },
      { name: 'FS Charles de Gaulle (R91)', expType: 'carrier', expHull: 'R91' },
      { name: 'Liaoning (CV-16)', expType: 'carrier', expHull: 'CV-16' },
      { name: 'Admiral Kuznetsov', expType: 'carrier' },
      { name: 'JS Izumo (DDH 183)', expType: 'carrier', expHull: 'DDH-183' },
      { name: 'TCG Anadolu (L400)', expType: 'carrier', expHull: 'L400' },
      { name: 'INS Vikrant (R11)', expType: 'carrier', expHull: 'R11' },
    ];

    for (const c of carriers) {
      const res = classifyNavalVessel(c.name);
      assert.ok(res, `Failed to classify ${c.name}`);
      assert.equal(res.vesselType, c.expType, `${c.name} expected ${c.expType}, got ${res.vesselType}`);
      if (c.expHull) {
        assert.equal(res.hullNumber, c.expHull, `${c.name} expected hull ${c.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes amphibious assault ships (amphibious)', () => {
    const amphibious = [
      { name: 'USS Bataan (LHD 5)', expHull: 'LHD-5' },
      { name: 'USS America (LHA 6)', expHull: 'LHA-6' },
      { name: 'USS San Antonio (LPD 17)', expHull: 'LPD-17' },
      { name: 'USS Harpers Ferry (LSD 49)', expHull: 'LSD-49' },
      { name: 'USS Mount Whitney (LCC 20)', expHull: 'LCC-20' },
      { name: 'HMS Albion (L14)', expHull: 'L14' },
      { name: 'HMAS Canberra (L02)', expHull: 'L02' },
      { name: 'FS Mistral (L9013)', expHull: 'L9013' },
      { name: 'Hainan 31', expHull: '31' },
      { name: 'Kunlun Shan (998)', expHull: '998' },
      { name: 'Ivan Gren' },
      { name: 'SPS Galicia (L51)', expHull: 'L51' },
    ];

    for (const a of amphibious) {
      const res = classifyNavalVessel(a.name);
      assert.ok(res, `Failed to classify ${a.name}`);
      assert.equal(res.vesselType, 'amphibious', `${a.name} must be amphibious, got ${res.vesselType}`);
      if (a.expHull) {
        assert.equal(res.hullNumber, a.expHull, `${a.name} expected hull ${a.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes destroyers and cruisers (destroyer)', () => {
    const destroyers = [
      { name: 'USS Mason (DDG 87)', expHull: 'DDG-87' },
      { name: 'USS Zumwalt (DDG 1000)', expHull: 'DDG-1000' },
      { name: 'USS Philippine Sea (CG 58)', expHull: 'CG-58' },
      { name: 'USS Carney', expHull: 'DDG-64' },
      { name: 'HMS Defender (D36)', expHull: 'D36' },
      { name: 'HMAS Hobart (DDG 39)', expHull: 'DDG-39' },
      { name: 'Nanchang 101', expHull: '101' },
      { name: 'Kunming (172)', expHull: '172' },
      { name: 'Pyotr Velikiy' },
      { name: 'FS Forbin (D620)', expHull: 'D620' },
      { name: 'JS Maya (DDG-179)', expHull: 'DDG-179' },
      { name: 'INS Visakhapatnam (D66)', expHull: 'D66' },
    ];

    for (const d of destroyers) {
      const res = classifyNavalVessel(d.name);
      assert.ok(res, `Failed to classify ${d.name}`);
      assert.equal(res.vesselType, 'destroyer', `${d.name} must be destroyer, got ${res.vesselType}`);
      if (d.expHull) {
        assert.equal(res.hullNumber, d.expHull, `${d.name} expected hull ${d.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes frigates and corvettes (frigate)', () => {
    const frigates = [
      { name: 'USS Gabrielle Giffords (LCS 10)', expHull: 'LCS-10' },
      { name: 'USS Constellation (FFG 62)', expHull: 'FFG-62' },
      { name: 'HMS Lancaster (F229)', expHull: 'F229' },
      { name: 'HMCS Halifax (FFH 330)', expHull: 'FFH-330' },
      { name: 'HMCS Fredericton (FFH 337)', expHull: 'FFH-337' },
      { name: 'HMAS Anzac (FFH 150)', expHull: 'FFH-150' },
      { name: 'FGS Sachsen (F219)', expHull: 'F219' },
      { name: 'FGS Hessen (F221)', expHull: 'F221' },
      { name: 'FS Aquitaine (D650)', expHull: 'D650' },
      { name: 'TCG Istanbul (F515)', expHull: 'F515' },
      { name: 'Zhoushan 529', expHull: '529' },
      { name: 'Admiral Gorshkov' },
      { name: 'JS Mogami (FFM-1)', expHull: 'FFM-1' },
    ];

    for (const f of frigates) {
      const res = classifyNavalVessel(f.name);
      assert.ok(res, `Failed to classify ${f.name}`);
      assert.equal(res.vesselType, 'frigate', `${f.name} must be frigate, got ${res.vesselType}`);
      if (f.expHull) {
        assert.equal(res.hullNumber, f.expHull, `${f.name} expected hull ${f.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes submarines (submarine)', () => {
    const subs = [
      { name: 'USS Virginia (SSN 774)', expHull: 'SSN-774' },
      { name: 'USS Ohio (SSGN 726)', expHull: 'SSGN-726' },
      { name: 'HMS Astute (S119)', expHull: 'S119' },
      { name: 'FS Suffren (S635)', expHull: 'S635' },
      { name: 'Severodvinsk' },
      { name: 'FGS U31 (S181)', expHull: 'S181' },
      { name: 'HMAS Collins (SSG 73)', expHull: 'SSG-73' },
      { name: 'HMCS Victoria (SSK 876)', expHull: 'SSK-876' },
    ];

    for (const s of subs) {
      const res = classifyNavalVessel(s.name);
      assert.ok(res, `Failed to classify ${s.name}`);
      assert.equal(res.vesselType, 'submarine', `${s.name} must be submarine, got ${res.vesselType}`);
      if (s.expHull) {
        assert.equal(res.hullNumber, s.expHull, `${s.name} expected hull ${s.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes icebreakers (icebreaker)', () => {
    const icebreakers = [
      { name: 'USCGC Healy (WAGB 20)', expHull: 'WAGB-20' },
      { name: 'USCGC Polar Star (WAGB 10)', expHull: 'WAGB-10' },
      { name: 'HMCS Harry DeWolf (AOPV 430)', expHull: 'AOPV-430' },
      { name: 'CCGS Louis S. St-Laurent' },
      { name: 'Arktika' },
      { name: '50 Let Pobedy' },
      { name: 'Xue Long' },
      { name: 'HMS Protector (A173)', expHull: 'A173' },
    ];

    for (const ib of icebreakers) {
      const res = classifyNavalVessel(ib.name);
      assert.ok(res, `Failed to classify ${ib.name}`);
      assert.equal(res.vesselType, 'icebreaker', `${ib.name} must be icebreaker, got ${res.vesselType}`);
      if (ib.expHull) {
        assert.equal(res.hullNumber, ib.expHull, `${ib.name} expected hull ${ib.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes patrol craft and cutters (patrol)', () => {
    const patrolCraft = [
      { name: 'USCGC Bertholf (WMSL 750)', expHull: 'WMSL-750' },
      { name: 'USCGC Stratton (WMSL 752)', expHull: 'WMSL-752' },
      { name: 'HMS Severn (P282)', expHull: 'P282' },
      { name: 'PATROL 45', aisShipType: 55, expType: 'patrol' },
    ];

    for (const p of patrolCraft) {
      const res = classifyNavalVessel(p.name, undefined, p.aisShipType);
      assert.ok(res, `Failed to classify ${p.name}`);
      assert.equal(res.vesselType, 'patrol', `${p.name} must be patrol, got ${res.vesselType}`);
      if (p.expHull) {
        assert.equal(res.hullNumber, p.expHull, `${p.name} expected hull ${p.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes auxiliary, hospital, and supply ships (auxiliary)', () => {
    const auxiliaries = [
      { name: 'USNS Comfort (T-AH 20)', expHull: 'T-AH-20' },
      { name: 'USNS Mercy (T-AH 19)', expHull: 'T-AH-19' },
      { name: 'USNS Lewis and Clark (T-AKE 1)', expHull: 'T-AKE-1' },
      { name: 'USNS Henry J. Kaiser (T-AO 187)', expHull: 'T-AO-187' },
      { name: 'USNS Spearhead (T-EPF 1)', expHull: 'T-EPF-1' },
      { name: 'RFA Fort Victoria (A387)', expHull: 'A387' },
      { name: 'FGS Berlin (A1411)', expHull: 'A1411' },
      { name: 'Hulun Lake 901', expHull: '901' },
    ];

    for (const aux of auxiliaries) {
      const res = classifyNavalVessel(aux.name);
      assert.ok(res, `Failed to classify ${aux.name}`);
      assert.equal(res.vesselType, 'auxiliary', `${aux.name} must be auxiliary, got ${res.vesselType}`);
      if (aux.expHull) {
        assert.equal(res.hullNumber, aux.expHull, `${aux.name} expected hull ${aux.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('correctly categorizes research and ocean surveillance vessels (research)', () => {
    const research = [
      { name: 'USNS Victorious (T-AGOS 19)', expHull: 'T-AGOS-19' },
      { name: 'USNS Impeccable (T-AGOS 23)', expHull: 'T-AGOS-23' },
      { name: 'USNS Bowditch (T-AGS 62)', expHull: 'T-AGS-62' },
      { name: 'HMS Scott (H131)', expHull: 'H131' },
      { name: 'Yuan Wang 5' },
      { name: 'Yantar' },
    ];

    for (const r of research) {
      const res = classifyNavalVessel(r.name);
      assert.ok(res, `Failed to classify ${r.name}`);
      assert.equal(res.vesselType, 'research', `${r.name} must be research, got ${res.vesselType}`);
      if (r.expHull) {
        assert.equal(res.hullNumber, r.expHull, `${r.name} expected hull ${r.expHull}, got ${res.hullNumber}`);
      }
    }
  });

  it('does not classify commercial vessels as warships', () => {
    assert.equal(classifyNavalVessel('MAERSK MC-KINNEY MOLLER'), undefined);
    assert.equal(classifyNavalVessel('MSC ISABELLA'), undefined);
    assert.equal(classifyNavalVessel('EVER GIVEN'), undefined);
    assert.equal(classifyNavalVessel('F/V PACIFIC STAR'), undefined);
    assert.equal(classifyNavalVessel('CARGO EXPRESS'), undefined);
  });
});

