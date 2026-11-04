import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIcaoTypeACallsign,
  isIcaoTypeBCallsign,
  isIcaoTypeCCallsign,
  isCivilianCallsign,
  isMilitaryCallsignFormat,
  shouldFilterOutAircraft,
} from '../src/config/military.ts';
import {
  isCivilianCallsign as isServerCivilianCallsign,
  isMilitaryCallsign,
} from '../server/worldmonitor/military/v1/_shared.ts';

describe('ICAO Annex 10 Vol II Type A - National Registration Marking Detection', () => {
  it('detects hyphenated international civil registrations', () => {
    // UK, Germany, France, Italy, Spain, Netherlands, Austria, Ireland
    assert.equal(isIcaoTypeACallsign('G-ABCD'), true);
    assert.equal(isIcaoTypeACallsign('G-EZYB'), true);
    assert.equal(isIcaoTypeACallsign('D-AICA'), true);
    assert.equal(isIcaoTypeACallsign('F-GXYZ'), true);
    assert.equal(isIcaoTypeACallsign('I-ABCD'), true);
    assert.equal(isIcaoTypeACallsign('EC-MRL'), true);
    assert.equal(isIcaoTypeACallsign('PH-BVA'), true);
    assert.equal(isIcaoTypeACallsign('OE-LPA'), true);
    assert.equal(isIcaoTypeACallsign('EI-DCL'), true);
    assert.equal(isIcaoTypeACallsign('9H-QAB'), true);
    assert.equal(isIcaoTypeACallsign('TC-JND'), true);

    // Americas, Asia, Oceania, Africa
    assert.equal(isIcaoTypeACallsign('VH-OQA'), true);
    assert.equal(isIcaoTypeACallsign('C-FABC'), true);
    assert.equal(isIcaoTypeACallsign('B-2079'), true);
    assert.equal(isIcaoTypeACallsign('B-18601'), true);
    assert.equal(isIcaoTypeACallsign('VT-ABC'), true);
    assert.equal(isIcaoTypeACallsign('RA-76500'), true);
    assert.equal(isIcaoTypeACallsign('PP-XMA'), true);
    assert.equal(isIcaoTypeACallsign('PR-GUO'), true);
    assert.equal(isIcaoTypeACallsign('A6-EEO'), true);
    assert.equal(isIcaoTypeACallsign('A7-BAC'), true);
    assert.equal(isIcaoTypeACallsign('4X-EDF'), true);
  });

  it('detects unhyphenated international civil registrations', () => {
    // UK, Germany, France, Italy, Spain, Netherlands, Austria, Ireland
    assert.equal(isIcaoTypeACallsign('GABCD'), true);
    assert.equal(isIcaoTypeACallsign('GEZYB'), true);
    assert.equal(isIcaoTypeACallsign('DAICA'), true);
    assert.equal(isIcaoTypeACallsign('FGXYZ'), true);
    assert.equal(isIcaoTypeACallsign('IABCD'), true);
    assert.equal(isIcaoTypeACallsign('ECMRL'), true);
    assert.equal(isIcaoTypeACallsign('PHBVA'), true);
    assert.equal(isIcaoTypeACallsign('OELPA'), true);
    assert.equal(isIcaoTypeACallsign('EIDCL'), true);
    assert.equal(isIcaoTypeACallsign('9HQAB'), true);
    assert.equal(isIcaoTypeACallsign('TCJND'), true);

    // Japan, Korea, China, Australia, India, Russia, US
    assert.equal(isIcaoTypeACallsign('JA8088'), true);
    assert.equal(isIcaoTypeACallsign('JA01JJ'), true);
    assert.equal(isIcaoTypeACallsign('HL7788'), true);
    assert.equal(isIcaoTypeACallsign('B2079'), true);
    assert.equal(isIcaoTypeACallsign('VHOQA'), true);
    assert.equal(isIcaoTypeACallsign('VTABC'), true);
    assert.equal(isIcaoTypeACallsign('RA76500'), true);
    assert.equal(isIcaoTypeACallsign('N12345'), true);
    assert.equal(isIcaoTypeACallsign('N123AB'), true);
  });

  it('does NOT misclassify Russian military RF- as civil registration', () => {
    assert.equal(isIcaoTypeACallsign('RF-78762'), false);
    assert.equal(isIcaoTypeACallsign('RFF101'), false);
  });
});

describe('ICAO Annex 10 Vol II Type B - Airline Designator + Registration Suffix', () => {
  it('detects operator designator followed by 3-4 registration letters', () => {
    assert.equal(isIcaoTypeBCallsign('BAWABCD'), true);
    assert.equal(isIcaoTypeBCallsign('AFRGXYZ'), true);
    assert.equal(isIcaoTypeBCallsign('DLHAICA'), true);
    assert.equal(isIcaoTypeBCallsign('TAPMRL'), true);
    assert.equal(isIcaoTypeBCallsign('RYRDCL'), true);
    assert.equal(isIcaoTypeBCallsign('KLMBVA'), true);
  });

  it('does not match tactical military callsigns', () => {
    assert.equal(isIcaoTypeBCallsign('FORTE10'), false);
    assert.equal(isIcaoTypeBCallsign('VIPER11'), false);
    assert.equal(isIcaoTypeBCallsign('RCH412'), false);
  });
});

describe('ICAO Annex 10 Vol II Type C - Flight Identification (Numeric and Alphanumeric)', () => {
  it('detects commercial flights with numeric flight numbers', () => {
    assert.equal(isIcaoTypeCCallsign('BAW123'), true);
    assert.equal(isIcaoTypeCCallsign('DLH456'), true);
    assert.equal(isIcaoTypeCCallsign('AFR789'), true);
    assert.equal(isIcaoTypeCCallsign('QTR815'), true);
    assert.equal(isIcaoTypeCCallsign('UAE201'), true);
    assert.equal(isIcaoTypeCCallsign('SIA318'), true);
    assert.equal(isIcaoTypeCCallsign('CCA981'), true);
    assert.equal(isIcaoTypeCCallsign('QFA1'), true);
    assert.equal(isIcaoTypeCCallsign('AIC101'), true);
    assert.equal(isIcaoTypeCCallsign('THY10'), true);
  });

  it('detects Eurocontrol / international alphanumeric callsigns with letter suffixes', () => {
    assert.equal(isIcaoTypeCCallsign('DLH45AB'), true);
    assert.equal(isIcaoTypeCCallsign('BAW25B'), true);
    assert.equal(isIcaoTypeCCallsign('AFR182K'), true);
    assert.equal(isIcaoTypeCCallsign('EZY84TG'), true);
    assert.equal(isIcaoTypeCCallsign('RYR93LP'), true);
    assert.equal(isIcaoTypeCCallsign('THY9Y'), true);
    assert.equal(isIcaoTypeCCallsign('WZZ418A'), true);
    assert.equal(isIcaoTypeCCallsign('FIN72M'), true);
    assert.equal(isIcaoTypeCCallsign('IBE31BZ'), true);
    assert.equal(isIcaoTypeCCallsign('TAP458P'), true);
    assert.equal(isIcaoTypeCCallsign('SWR99K'), true);
    assert.equal(isIcaoTypeCCallsign('AUA62F'), true);
    assert.equal(isIcaoTypeCCallsign('LOT38B'), true);
    assert.equal(isIcaoTypeCCallsign('AZA147C'), true);
    assert.equal(isIcaoTypeCCallsign('EIN24D'), true);
    assert.equal(isIcaoTypeCCallsign('SAS45D'), true);
    assert.equal(isIcaoTypeCCallsign('KLM12A'), true);
  });

  it('detects standard 2-letter IATA flight numbers', () => {
    assert.equal(isIcaoTypeCCallsign('DL123'), true);
    assert.equal(isIcaoTypeCCallsign('AA456'), true);
    assert.equal(isIcaoTypeCCallsign('FR93LP'), true);
    assert.equal(isIcaoTypeCCallsign('U284TG'), true);
  });
});

describe('Full Civilian vs Military Callsign Classification', () => {
  it('correctly classifies civil aircraft callsigns as civilian', () => {
    // Type a
    assert.equal(isCivilianCallsign('G-ABCD'), true);
    assert.equal(isCivilianCallsign('D-AICA'), true);
    assert.equal(isCivilianCallsign('VHOQA'), true);
    assert.equal(isCivilianCallsign('B-2079'), true);
    assert.equal(isCivilianCallsign('JA8088'), true);
    assert.equal(isCivilianCallsign('HL7788'), true);
    assert.equal(isCivilianCallsign('RA-76500'), true);
    assert.equal(isCivilianCallsign('9H-QAB'), true);

    // Type b
    assert.equal(isCivilianCallsign('BAWABCD'), true);
    assert.equal(isCivilianCallsign('DLHAICA'), true);

    // Type c
    assert.equal(isCivilianCallsign('DLH45AB'), true);
    assert.equal(isCivilianCallsign('EZY84TG'), true);
    assert.equal(isCivilianCallsign('RYR93LP'), true);
    assert.equal(isCivilianCallsign('AFR182K'), true);
    assert.equal(isCivilianCallsign('THY9Y'), true);
    assert.equal(isCivilianCallsign('QTR815'), true);
    assert.equal(isCivilianCallsign('UAE201'), true);
  });

  it('never classifies genuine military flights as civilian', () => {
    assert.equal(isCivilianCallsign('RCH412'), false);
    assert.equal(isCivilianCallsign('FORTE10'), false);
    assert.equal(isCivilianCallsign('VIPER11'), false);
    assert.equal(isCivilianCallsign('BONE01'), false);
    assert.equal(isCivilianCallsign('DEATH21'), false);
    assert.equal(isCivilianCallsign('DOOM31'), false);
    assert.equal(isCivilianCallsign('REAPER01'), false);
    assert.equal(isCivilianCallsign('ASCOT22'), false);
    assert.equal(isCivilianCallsign('CANFORCE01'), false);
    assert.equal(isCivilianCallsign('PLAAF01'), false);
    assert.equal(isCivilianCallsign('PLAN02'), false);
    assert.equal(isCivilianCallsign('RF-78762'), false);
    assert.equal(isCivilianCallsign('NATO01'), false);
  });

  it('rejects civilian callsigns from isMilitaryCallsignFormat', () => {
    assert.equal(isMilitaryCallsignFormat('DLH45AB'), false);
    assert.equal(isMilitaryCallsignFormat('EZY84TG'), false);
    assert.equal(isMilitaryCallsignFormat('RYR93LP'), false);
    assert.equal(isMilitaryCallsignFormat('BAW25B'), false);
    assert.equal(isMilitaryCallsignFormat('G-ABCD'), false);
    assert.equal(isMilitaryCallsignFormat('D-AICA'), false);
    assert.equal(isMilitaryCallsignFormat('VHOQA'), false);
    assert.equal(isMilitaryCallsignFormat('B-2079'), false);
    assert.equal(isMilitaryCallsignFormat('JA8088'), false);
    assert.equal(isMilitaryCallsignFormat('RA-76500'), false);
  });

  it('accepts genuine military callsigns in isMilitaryCallsignFormat', () => {
    assert.equal(isMilitaryCallsignFormat('RCH412'), true);
    assert.equal(isMilitaryCallsignFormat('FORTE10'), true);
    assert.equal(isMilitaryCallsignFormat('VIPER11'), true);
    assert.equal(isMilitaryCallsignFormat('BONE01'), true);
    assert.equal(isMilitaryCallsignFormat('ASCOT22'), true);
    assert.equal(isMilitaryCallsignFormat('CANFORCE01'), true);
  });
});

describe('shouldFilterOutAircraft End-to-End Filtering', () => {
  it('filters out non-US civilian flights matching Type A, B, and C', () => {
    // Type a registrations
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'G-EZYB', hexCode: '400001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'D-AICA', hexCode: '3C0001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'OE-LPA', hexCode: '440001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'VH-OQA', hexCode: '7C0001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'B-2079', hexCode: '780001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'JA8088', hexCode: '840001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'HL7788', hexCode: '710001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'RA-76500', hexCode: '140001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: '9H-QAB', hexCode: '4D0001' }), true);

    // Type b
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'BAWABCD', hexCode: '400002' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'DLHAICA', hexCode: '3C0002' }), true);

    // Type c alphanumeric
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'DLH45AB', hexCode: '3C0003' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'EZY84TG', hexCode: '400003' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'RYR93LP', hexCode: '4CA001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'THY9Y', hexCode: '4B8001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'AFR182K', hexCode: '380001' }), true);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'WZZ418A', hexCode: '478001' }), true);
  });

  it('keeps genuine military flights', () => {
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'RCH412', hexCode: 'AE0001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'FORTE10', hexCode: 'AE0002' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'VIPER11', hexCode: 'AE0003' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'BONE01', hexCode: 'AE0004' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'ASCOT22', hexCode: '43C001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'CANFORCE01', hexCode: 'C2B001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'unknown', callsign: 'RF-78762', hexCode: '150001' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'fighter', callsign: 'UNKNOWN', hexCode: 'AE0005' }), false);
    assert.equal(shouldFilterOutAircraft({ aircraftType: 'tanker', callsign: '', hexCode: 'AE0006' }), false);
  });

  it('server-side shared filter also rejects Type A, B, and C callsigns', () => {
    assert.equal(isServerCivilianCallsign('DLH45AB'), true);
    assert.equal(isServerCivilianCallsign('EZY84TG'), true);
    assert.equal(isServerCivilianCallsign('G-ABCD'), true);
    assert.equal(isServerCivilianCallsign('VHOQA'), true);
    assert.equal(isServerCivilianCallsign('BAWABCD'), true);

    assert.equal(isMilitaryCallsign('DLH45AB'), false);
    assert.equal(isMilitaryCallsign('EZY84TG'), false);
    assert.equal(isMilitaryCallsign('G-ABCD'), false);
    assert.equal(isMilitaryCallsign('RCH412'), true);
    assert.equal(isMilitaryCallsign('FORTE10'), true);
  });
});

