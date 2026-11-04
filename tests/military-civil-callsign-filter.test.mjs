import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isIcaoTypeACallsign,
  isIcaoTypeBCallsign,
  isIcaoTypeCCallsign,
  isCivilianCallsign,
  isMilitaryCallsignFormat,
  shouldFilterOutAircraft,
  isKnownMilitaryHex,
  isCivilianAircraftType,
  isTrainingOrCivilSupportCallsign,
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

describe('Canadian Airline Contract, Regional Carriers & Flight School Filtering', () => {
  it('correctly classifies Canadian contract and regional airline callsigns as civilian', () => {
    // WestJet Encore
    assert.equal(isCivilianCallsign('WEN3101'), true);
    assert.equal(isCivilianCallsign('WEN3244'), true);
    assert.equal(isMilitaryCallsignFormat('WEN3101'), false);

    // Jazz Aviation / Air Canada Express
    assert.equal(isCivilianCallsign('JZA8951'), true);
    assert.equal(isCivilianCallsign('JZA123'), true);
    assert.equal(isMilitaryCallsignFormat('JZA8951'), false);

    // Air Georgian, Sky Regional, Central Mountain Air, PAL Airlines
    assert.equal(isCivilianCallsign('GGN712'), true);
    assert.equal(isCivilianCallsign('SKV101'), true);
    assert.equal(isCivilianCallsign('GLR456'), true);
    assert.equal(isCivilianCallsign('PVL789'), true);

    // Canadian North, Air Creebec, Air Inuit, Wasaya, Calm Air, Perimeter
    assert.equal(isCivilianCallsign('MPE123'), true);
    assert.equal(isCivilianCallsign('CRQ202'), true);
    assert.equal(isCivilianCallsign('AIE303'), true);
    assert.equal(isCivilianCallsign('WSG404'), true);
    assert.equal(isCivilianCallsign('CAV505'), true);
    assert.equal(isCivilianCallsign('PAG606'), true);
    assert.equal(isCivilianCallsign('KEW707'), true);
    assert.equal(isCivilianCallsign('MAL808'), true);

    // Server-side check
    assert.equal(isServerCivilianCallsign('WEN3101'), true);
    assert.equal(isServerCivilianCallsign('JZA8951'), true);
    assert.equal(isMilitaryCallsign('WEN3101'), false);
    assert.equal(isMilitaryCallsign('JZA8951'), false);
  });

  it('correctly identifies flight academies and university training callsigns as civilian', () => {
    // Canadian flight training centres
    assert.equal(isCivilianCallsign('MFC101'), true); // Moncton Flight College
    assert.equal(isCivilianCallsign('SNC24'), true);  // Seneca College
    assert.equal(isCivilianCallsign('BFC5'), true);   // Brampton Flight Centre
    assert.equal(isCivilianCallsign('SAU12'), true);  // Sault College
    assert.equal(isCivilianCallsign('OAS33'), true);  // Ottawa Aviation Services
    assert.equal(isCivilianCallsign('VFC4'), true);   // Victoria Flying Club
    assert.equal(isCivilianCallsign('WWF9'), true);   // Waterloo Wellington Flight Centre

    // US & Global academies
    assert.equal(isCivilianCallsign('ERU123'), true); // Embry-Riddle
    assert.equal(isCivilianCallsign('NDU45'), true);  // North Dakota
    assert.equal(isCivilianCallsign('PUR8'), true);   // Purdue
    assert.equal(isCivilianCallsign('WMU77'), true);  // Western Michigan
    assert.equal(isCivilianCallsign('ATP99'), true);  // ATP Flight School
    assert.equal(isCivilianCallsign('CAE55'), true);  // CAE
    assert.equal(isCivilianCallsign('OXF12'), true);  // Oxford Aviation
    assert.equal(isCivilianCallsign('LFA88'), true);  // Lufthansa Training

    // Server-side check
    assert.equal(isServerCivilianCallsign('MFC101'), true);
    assert.equal(isServerCivilianCallsign('ERU123'), true);
    assert.equal(isMilitaryCallsign('MFC101'), false);
    assert.equal(isMilitaryCallsign('ERU123'), false);
  });

  it('detects civilian training and utility callsign keywords', () => {
    assert.equal(isTrainingOrCivilSupportCallsign('CADET01'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('STUDENT1'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('SOLO2'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('TRAIN11'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('INSTRUCT4'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('CESSNA1'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('PIPER2'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('DIAMOND3'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('SKYTUG1'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('GLIDER5'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('SURVEY10'), true);
    assert.equal(isTrainingOrCivilSupportCallsign('PHOTO1'), true);

    // Ensure they are marked civilian and not military
    assert.equal(isCivilianCallsign('CADET01'), true);
    assert.equal(isCivilianCallsign('STUDENT1'), true);
    assert.equal(isCivilianCallsign('SOLO2'), true);
    assert.equal(isCivilianCallsign('PIPER2'), true);
    assert.equal(isMilitaryCallsignFormat('CADET01'), false);
    assert.equal(isMilitaryCallsignFormat('SOLO2'), false);

    // Server-side check
    assert.equal(isServerCivilianCallsign('CADET01'), true);
    assert.equal(isServerCivilianCallsign('STUDENT1'), true);
    assert.equal(isMilitaryCallsign('CADET01'), false);
  });

  it('verifies Canadian civil hexes (C00000-C0FFFF) are NOT marked military, while RCAF (C2B000-C2BFFF) are', () => {
    // Canadian civil aircraft hex codes (previously erroneously included in MILITARY_HEX_RANGES)
    assert.equal(isKnownMilitaryHex('C01234'), undefined);
    assert.equal(isKnownMilitaryHex('C089AB'), undefined);
    assert.equal(isKnownMilitaryHex('C0FFFF'), undefined);

    // Verified RCAF Canadian Armed Forces military block
    assert.ok(isKnownMilitaryHex('C2B000'));
    assert.ok(isKnownMilitaryHex('C2B123'));
    assert.ok(isKnownMilitaryHex('C2BFFF'));
    assert.equal(isKnownMilitaryHex('C2B123')?.country, 'Canada');
  });

  it('identifies civilian regional, connecting, and training aircraft typecodes', () => {
    // Regional turboprops & commuter jets
    assert.equal(isCivilianAircraftType('DH8D'), true);
    assert.equal(isCivilianAircraftType('Q400'), true);
    assert.equal(isCivilianAircraftType('CRJ9'), true);
    assert.equal(isCivilianAircraftType('CRJ2'), true);
    assert.equal(isCivilianAircraftType('AT76'), true);
    assert.equal(isCivilianAircraftType('SF34'), true);
    assert.equal(isCivilianAircraftType('B190'), true);
    assert.equal(isCivilianAircraftType('SW4'), true);

    // Training aircraft & light singles
    assert.equal(isCivilianAircraftType('C172'), true);
    assert.equal(isCivilianAircraftType('C152'), true);
    assert.equal(isCivilianAircraftType('PA28'), true);
    assert.equal(isCivilianAircraftType('DA40'), true);
    assert.equal(isCivilianAircraftType('DA20'), true);
    assert.equal(isCivilianAircraftType('SR22'), true);

    // Commercial airliners
    assert.equal(isCivilianAircraftType('A320'), true);
    assert.equal(isCivilianAircraftType('A330'), true);
    assert.equal(isCivilianAircraftType('B738'), true);

    // Military types should not be in civilian typecodes
    assert.equal(isCivilianAircraftType('F16'), false);
    assert.equal(isCivilianAircraftType('C17'), false);
    assert.equal(isCivilianAircraftType('KC135'), false);
  });

  it('shouldFilterOutAircraft filters out contract flights, training flights, and civil typecodes', () => {
    // WestJet Encore Dash 8
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'unknown',
        callsign: 'WEN3101',
        hexCode: 'C01234',
        typeCode: 'DH8D',
      }),
      true
    );

    // Jazz CRJ900
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'unknown',
        callsign: 'JZA8951',
        hexCode: 'C05678',
        typeCode: 'CRJ9',
      }),
      true
    );

    // Seneca College Cessna 172
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'unknown',
        callsign: 'SNC24',
        hexCode: 'C09999',
        typeCode: 'C172',
      }),
      true
    );

    // Flight training cadet callsign
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'unknown',
        callsign: 'CADET01',
        hexCode: 'A00123',
        typeCode: 'PA28',
      }),
      true
    );

    // Unknown aircraft with civil typecode (e.g. Piper Cherokee PA28)
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'unknown',
        callsign: 'UNKNOWN',
        hexCode: 'C02222',
        typeCode: 'PA28',
      }),
      true
    );

    // Confirmed RCAF military flight (CANFORCE01 / CC-130 Hercules) should NOT be filtered out
    assert.equal(
      shouldFilterOutAircraft({
        aircraftType: 'transport',
        callsign: 'CFC3011',
        hexCode: 'C2B011',
        typeCode: 'C130',
      }),
      false
    );
  });
});

