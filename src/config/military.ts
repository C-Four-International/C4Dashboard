import type { MilitaryAircraftType, MilitaryOperator, MilitaryVesselType } from '@/types';

/**
 * Military callsign prefixes and patterns for aircraft identification
 * These are used to filter ADS-B data for military aircraft
 */
export interface CallsignPattern {
  pattern: string;           // Regex pattern or prefix
  operator: MilitaryOperator;
  aircraftType?: MilitaryAircraftType;
  description?: string;
}

// US Military callsign patterns
export const US_MILITARY_CALLSIGNS: CallsignPattern[] = [
  // USAF
  { pattern: '^RCH', operator: 'usaf', aircraftType: 'transport', description: 'REACH - AMC transport' },
  { pattern: '^REACH', operator: 'usaf', aircraftType: 'transport', description: 'REACH - AMC transport' },
  { pattern: '^DUKE', operator: 'usaf', aircraftType: 'transport', description: 'DUKE - VIP transport' },
  { pattern: '^SAM', operator: 'usaf', aircraftType: 'vip', description: 'Special Air Mission' },
  { pattern: '^AF[12]', operator: 'usaf', aircraftType: 'vip', description: 'Air Force One/Two' },
  { pattern: '^EXEC', operator: 'usaf', aircraftType: 'vip', description: 'Executive transport' },
  { pattern: '^GOLD', operator: 'usaf', aircraftType: 'special_ops', description: 'Special operations' },
  { pattern: '^KING', operator: 'usaf', aircraftType: 'tanker', description: 'KC-135/KC-46 tanker' },
  { pattern: '^SHELL', operator: 'usaf', aircraftType: 'tanker', description: 'Tanker operations' },
  { pattern: '^TEAL', operator: 'usaf', aircraftType: 'tanker', description: 'Tanker operations' },
  { pattern: '^BOLT', operator: 'usaf', aircraftType: 'fighter', description: 'Fighter ops' },
  { pattern: '^VIPER', operator: 'usaf', aircraftType: 'fighter', description: 'F-16 operations' },
  { pattern: '^RAPTOR', operator: 'usaf', aircraftType: 'fighter', description: 'F-22 operations' },
  { pattern: '^BONE', operator: 'usaf', aircraftType: 'bomber', description: 'B-1B operations' },
  { pattern: '^DEATH', operator: 'usaf', aircraftType: 'bomber', description: 'B-2 operations' },
  { pattern: '^DOOM', operator: 'usaf', aircraftType: 'bomber', description: 'B-52 operations' },
  { pattern: '^SNTRY', operator: 'usaf', aircraftType: 'awacs', description: 'E-3 AWACS' },
  { pattern: '^DRAGN', operator: 'usaf', aircraftType: 'reconnaissance', description: 'U-2 operations' },
  { pattern: '^COBRA', operator: 'usaf', aircraftType: 'reconnaissance', description: 'RC-135 SIGINT' },
  { pattern: '^RIVET', operator: 'usaf', aircraftType: 'reconnaissance', description: 'RC-135 variants' },
  { pattern: '^OLIVE', operator: 'usaf', aircraftType: 'reconnaissance', description: 'RC-135 operations' },
  { pattern: '^JAKE', operator: 'usaf', aircraftType: 'reconnaissance', description: 'E-8 JSTARS' },
  { pattern: '^NCHO', operator: 'usaf', aircraftType: 'special_ops', description: 'MC-130 Specops' },
  { pattern: '^SHADOW', operator: 'usaf', aircraftType: 'special_ops', description: 'Special operations' },
  { pattern: '^EVAC', operator: 'usaf', aircraftType: 'transport', description: 'Aeromedical evacuation' },
  { pattern: '^MOOSE', operator: 'usaf', aircraftType: 'transport', description: 'C-17 operations' },
  { pattern: '^HERKY', operator: 'usaf', aircraftType: 'transport', description: 'C-130 operations' },

  // US Navy
  { pattern: '^NAVY', operator: 'usn', description: 'US Navy aircraft' },
  { pattern: '^CNV', operator: 'usn', aircraftType: 'transport', description: 'Navy transport' },
  { pattern: '^VRC', operator: 'usn', aircraftType: 'transport', description: 'Carrier onboard delivery' },
  { pattern: '^TRIDENT', operator: 'usn', aircraftType: 'patrol', description: 'P-8 maritime patrol' },
  { pattern: '^RED', operator: 'usn', aircraftType: 'patrol', description: 'P-8/P-3 operations' },
  { pattern: '^BRONCO', operator: 'usn', aircraftType: 'fighter', description: 'F/A-18 operations' },

  // US Marine Corps
  { pattern: '^MARINE', operator: 'usmc', description: 'USMC aircraft' },
  { pattern: '^HMX', operator: 'usmc', aircraftType: 'vip', description: 'Marine One squadron' },
  { pattern: '^NIGHT', operator: 'usmc', aircraftType: 'vip', description: 'Nighthawk VIP transport' },

  // US Army
  { pattern: '^ARMY', operator: 'usa', description: 'US Army aircraft' },
  { pattern: '^PAT', operator: 'usa', aircraftType: 'transport', description: 'Priority air transport' },
  { pattern: '^DUSTOFF', operator: 'usa', aircraftType: 'helicopter', description: 'Medevac helicopters' },

  // US Coast Guard
  { pattern: '^COAST GUARD', operator: 'other', aircraftType: 'patrol', description: 'USCG aircraft' },
  { pattern: '^CG[0-9]', operator: 'other', aircraftType: 'patrol', description: 'USCG aircraft' },

  // Global Hawk / Drones
  { pattern: '^FORTE', operator: 'usaf', aircraftType: 'drone', description: 'RQ-4 Global Hawk' },
  { pattern: '^HAWK', operator: 'usaf', aircraftType: 'drone', description: 'Global Hawk drone' },
  { pattern: '^REAPER', operator: 'usaf', aircraftType: 'drone', description: 'MQ-9 Reaper' },
];

// NATO/Allied callsign patterns
export const NATO_ALLIED_CALLSIGNS: CallsignPattern[] = [
  // Royal Air Force (UK)
  { pattern: '^RRR', operator: 'raf', description: 'RAF aircraft' },
  { pattern: '^ASCOT', operator: 'raf', aircraftType: 'transport', description: 'RAF transport' },
  { pattern: '^RAFAIR', operator: 'raf', aircraftType: 'transport', description: 'RAF transport' },
  { pattern: '^TARTAN', operator: 'raf', aircraftType: 'tanker', description: 'RAF tanker' },
  { pattern: '^NATO', operator: 'nato', aircraftType: 'awacs', description: 'NATO AWACS' },

  // Royal Navy (UK)
  { pattern: '^RN', operator: 'rn', description: 'Royal Navy aircraft' },
  { pattern: '^NAVY', operator: 'rn', description: 'RN aircraft' },

  // French Air Force
  { pattern: '^FAF', operator: 'faf', description: 'French Air Force' },
  { pattern: '^CTM', operator: 'faf', aircraftType: 'transport', description: 'French AF transport' },
  { pattern: '^FRENCH', operator: 'faf', description: 'French military' },

  // German Air Force
  { pattern: '^GAF', operator: 'gaf', description: 'German Air Force' },
  { pattern: '^GERMAN', operator: 'gaf', description: 'German military' },

  // Israeli Air Force
  { pattern: '^IAF', operator: 'iaf', description: 'Israeli Air Force' },

  // Turkey
  { pattern: '^THK', operator: 'other', description: 'Turkish Air Force' },
  { pattern: '^TUR', operator: 'other', description: 'Turkish military' },

  // Saudi Arabia
  { pattern: '^RSAF', operator: 'other', description: 'Royal Saudi Air Force' },
  { pattern: '^RSF', operator: 'other', description: 'Royal Saudi Air Force' },

  // UAE
  { pattern: '^UAF', operator: 'other', description: 'UAE Air Force' },

  // India
  { pattern: '^AIR INDIA ONE', operator: 'other', aircraftType: 'vip', description: 'Indian Air Force One' },
  { pattern: '^IAM', operator: 'other', description: 'Indian Air Force' },

  // Japan ASDF
  { pattern: '^JPN', operator: 'other', description: 'Japan Self-Defense Force' },
  { pattern: '^JASDF', operator: 'other', description: 'Japan Air Self-Defense Force' },

  // South Korea
  { pattern: '^ROKAF', operator: 'other', description: 'Republic of Korea Air Force' },
  { pattern: '^KAF', operator: 'other', description: 'Korean Air Force' },

  // Australia
  { pattern: '^RAAF', operator: 'other', description: 'Royal Australian Air Force' },
  { pattern: '^AUSSIE', operator: 'other', description: 'Australian military' },

  // Canada
  { pattern: '^CANFORCE', operator: 'other', aircraftType: 'transport', description: 'Canadian Armed Forces' },
  { pattern: '^CFC', operator: 'other', description: 'Canadian Forces' },

  // Italy
  { pattern: '^IAM', operator: 'other', description: 'Italian Air Force' },
  { pattern: '^ITALY', operator: 'other', description: 'Italian military' },

  // Spain
  { pattern: '^AME', operator: 'other', description: 'Spanish Air Force' },

  // Poland
  { pattern: '^PLF', operator: 'other', description: 'Polish Air Force' },

  // Greece
  { pattern: '^HAF', operator: 'other', description: 'Hellenic Air Force' },

  // Egypt
  { pattern: '^EGY', operator: 'other', description: 'Egyptian Air Force' },

  // Pakistan
  { pattern: '^PAF', operator: 'other', description: 'Pakistan Air Force' },
];

// Russian/Chinese callsign patterns (less common due to transponder usage)
export const ADVERSARY_CALLSIGNS: CallsignPattern[] = [
  // Russian Aerospace Forces
  { pattern: '^RF', operator: 'vks', description: 'Russian Federation aircraft' },
  { pattern: '^RFF', operator: 'vks', description: 'Russian AF' },
  { pattern: '^RUSSIAN', operator: 'vks', description: 'Russian military' },

  // Chinese PLA
  { pattern: '^PLAAF', operator: 'plaaf', description: 'PLA Air Force' },
  { pattern: '^PLAN', operator: 'plan', description: 'PLA Navy Air' },
  { pattern: '^CHN', operator: 'plaaf', description: 'Chinese military' },
  { pattern: '^CHINA', operator: 'plaaf', description: 'Chinese military' },
];

// All military callsign patterns combined
export const ALL_MILITARY_CALLSIGNS: CallsignPattern[] = [
  ...US_MILITARY_CALLSIGNS,
  ...NATO_ALLIED_CALLSIGNS,
  ...ADVERSARY_CALLSIGNS,
];

/**
 * Military aircraft type codes (ICAO aircraft type designators)
 * Used to identify military aircraft by their type code
 */
export const MILITARY_AIRCRAFT_TYPES: Record<string, { type: MilitaryAircraftType; name: string }> = {
  // Fighters
  'F15': { type: 'fighter', name: 'F-15 Eagle' },
  'F16': { type: 'fighter', name: 'F-16 Fighting Falcon' },
  'F18': { type: 'fighter', name: 'F/A-18 Hornet' },
  'FA18': { type: 'fighter', name: 'F/A-18 Hornet' },
  'F22': { type: 'fighter', name: 'F-22 Raptor' },
  'F35': { type: 'fighter', name: 'F-35 Lightning II' },
  'F117': { type: 'fighter', name: 'F-117 Nighthawk' },
  'SU27': { type: 'fighter', name: 'Su-27 Flanker' },
  'SU30': { type: 'fighter', name: 'Su-30 Flanker' },
  'SU35': { type: 'fighter', name: 'Su-35 Flanker-E' },
  'MIG29': { type: 'fighter', name: 'MiG-29 Fulcrum' },
  'MIG31': { type: 'fighter', name: 'MiG-31 Foxhound' },
  'EUFI': { type: 'fighter', name: 'Eurofighter Typhoon' },
  'EF2K': { type: 'fighter', name: 'Eurofighter Typhoon' },
  'RFAL': { type: 'fighter', name: 'Dassault Rafale' },
  'J10': { type: 'fighter', name: 'J-10 Vigorous Dragon' },
  'J11': { type: 'fighter', name: 'J-11 Flanker' },
  'J20': { type: 'fighter', name: 'J-20 Mighty Dragon' },

  // Bombers
  'B52': { type: 'bomber', name: 'B-52 Stratofortress' },
  'B1': { type: 'bomber', name: 'B-1B Lancer' },
  'B1B': { type: 'bomber', name: 'B-1B Lancer' },
  'B2': { type: 'bomber', name: 'B-2 Spirit' },
  'TU95': { type: 'bomber', name: 'Tu-95 Bear' },
  'TU160': { type: 'bomber', name: 'Tu-160 Blackjack' },
  'TU22': { type: 'bomber', name: 'Tu-22M Backfire' },
  'H6': { type: 'bomber', name: 'H-6 Badger' },

  // Transports
  'C130': { type: 'transport', name: 'C-130 Hercules' },
  'C17': { type: 'transport', name: 'C-17 Globemaster III' },
  'C5': { type: 'transport', name: 'C-5 Galaxy' },
  'C5M': { type: 'transport', name: 'C-5M Super Galaxy' },
  'C40': { type: 'transport', name: 'C-40 Clipper' },
  'C32': { type: 'transport', name: 'C-32 (757)' },
  'VC25': { type: 'vip', name: 'VC-25 Air Force One' },
  'A400': { type: 'transport', name: 'A400M Atlas' },
  'IL76': { type: 'transport', name: 'Il-76 Candid' },
  'AN124': { type: 'transport', name: 'An-124 Ruslan' },
  'AN225': { type: 'transport', name: 'An-225 Mriya' },
  'Y20': { type: 'transport', name: 'Y-20 Kunpeng' },

  // Tankers
  'KC135': { type: 'tanker', name: 'KC-135 Stratotanker' },
  'K35R': { type: 'tanker', name: 'KC-135R Stratotanker' },
  'KC10': { type: 'tanker', name: 'KC-10 Extender' },
  'KC46': { type: 'tanker', name: 'KC-46 Pegasus' },
  'A330': { type: 'tanker', name: 'A330 MRTT' },
  'A332': { type: 'tanker', name: 'A330 MRTT' },

  // AWACS/AEW
  'E3': { type: 'awacs', name: 'E-3 Sentry AWACS' },
  'E3TF': { type: 'awacs', name: 'E-3 Sentry AWACS' },
  'E7': { type: 'awacs', name: 'E-7 Wedgetail' },
  'E2': { type: 'awacs', name: 'E-2 Hawkeye' },
  'A50': { type: 'awacs', name: 'A-50 Mainstay' },
  'KJ2000': { type: 'awacs', name: 'KJ-2000' },

  // Reconnaissance
  'RC135': { type: 'reconnaissance', name: 'RC-135 Rivet Joint' },
  'R135': { type: 'reconnaissance', name: 'RC-135' },
  'U2': { type: 'reconnaissance', name: 'U-2 Dragon Lady' },
  'U2S': { type: 'reconnaissance', name: 'U-2S Dragon Lady' },
  'EP3': { type: 'reconnaissance', name: 'EP-3 Aries' },
  'E8': { type: 'reconnaissance', name: 'E-8 JSTARS' },
  'WC135': { type: 'reconnaissance', name: 'WC-135 Constant Phoenix' },
  'OC135': { type: 'reconnaissance', name: 'OC-135 Open Skies' },

  // Maritime Patrol
  'P8': { type: 'patrol', name: 'P-8 Poseidon' },
  'P3': { type: 'patrol', name: 'P-3 Orion' },
  'P1': { type: 'patrol', name: 'Kawasaki P-1' },

  // Drones/UAV
  'RQ4': { type: 'drone', name: 'RQ-4 Global Hawk' },
  'GLHK': { type: 'drone', name: 'RQ-4 Global Hawk' },
  'MQ9': { type: 'drone', name: 'MQ-9 Reaper' },
  'MQ1': { type: 'drone', name: 'MQ-1 Predator' },
  'RQ170': { type: 'drone', name: 'RQ-170 Sentinel' },
  'MQ4C': { type: 'drone', name: 'MQ-4C Triton' },

  // Special Operations
  'MC130': { type: 'special_ops', name: 'MC-130 Combat Talon' },
  'AC130': { type: 'special_ops', name: 'AC-130 Gunship' },
  'CV22': { type: 'special_ops', name: 'CV-22 Osprey' },
  'MV22': { type: 'special_ops', name: 'MV-22 Osprey' },

  // Helicopters
  'H60': { type: 'helicopter', name: 'UH-60 Black Hawk' },
  'S70': { type: 'helicopter', name: 'UH-60 Black Hawk' },
  'H47': { type: 'helicopter', name: 'CH-47 Chinook' },
  'CH47': { type: 'helicopter', name: 'CH-47 Chinook' },
  'AH64': { type: 'helicopter', name: 'AH-64 Apache' },
  'H64': { type: 'helicopter', name: 'AH-64 Apache' },
  'H1': { type: 'helicopter', name: 'AH-1 Cobra/Viper' },
  'MI8': { type: 'helicopter', name: 'Mi-8 Hip' },
  'MI24': { type: 'helicopter', name: 'Mi-24 Hind' },
  'MI28': { type: 'helicopter', name: 'Mi-28 Havoc' },
  'KA52': { type: 'helicopter', name: 'Ka-52 Alligator' },
};

/**
 * ICAO 24-bit hex code ranges for military aircraft
 * These help identify military aircraft even without callsigns
 * Reference: https://www.ads-b.nl/icao.php
 */
export const MILITARY_HEX_RANGES: { start: string; end: string; operator: MilitaryOperator; country: string }[] = [
  // United States Military (strictly DoD blocks: AE0000-AEFFFF and VIP tankers ADF7C0-ADF7DF)
  { start: 'ADF7C0', end: 'ADF7DF', operator: 'usaf', country: 'USA' }, // USAF VIP / special transport / tankers
  { start: 'AE0000', end: 'AEFFFF', operator: 'usaf', country: 'USA' }, // Main US DoD military block

  // UK Military
  { start: '43C000', end: '43CFFF', operator: 'raf', country: 'UK' },

  // France Military
  { start: '3A0000', end: '3AFFFF', operator: 'faf', country: 'France' },
  { start: '3B0000', end: '3BFFFF', operator: 'faf', country: 'France' },

  // Germany Military
  { start: '3F0000', end: '3FFFFF', operator: 'gaf', country: 'Germany' },

  // Israel Military (critical for Middle East)
  { start: '738000', end: '73FFFF', operator: 'iaf', country: 'Israel' },

  // NATO AWACS (Luxembourg registration but NATO operated)
  { start: '4D0000', end: '4D03FF', operator: 'nato', country: 'NATO' },

  // Italy Military
  { start: '300000', end: '33FFFF', operator: 'other', country: 'Italy' },

  // Spain Military
  { start: '340000', end: '37FFFF', operator: 'other', country: 'Spain' },

  // Netherlands Military
  { start: '480000', end: '480FFF', operator: 'other', country: 'Netherlands' },

  // Turkey Military (important for Middle East)
  { start: '4BA000', end: '4BCFFF', operator: 'other', country: 'Turkey' },

  // Saudi Arabia Military
  { start: '710000', end: '717FFF', operator: 'other', country: 'Saudi Arabia' },

  // UAE Military
  { start: '896000', end: '896FFF', operator: 'other', country: 'UAE' },

  // Qatar Military
  { start: '06A000', end: '06AFFF', operator: 'other', country: 'Qatar' },

  // Kuwait Military
  { start: '706000', end: '706FFF', operator: 'other', country: 'Kuwait' },

  // Japan Self-Defense Forces
  { start: '840000', end: '87FFFF', operator: 'other', country: 'Japan' },

  // South Korea Military
  { start: '718000', end: '71FFFF', operator: 'other', country: 'South Korea' },

  // Australia Military
  { start: '7CF800', end: '7CFFFF', operator: 'other', country: 'Australia' },

  // Canada Military
  { start: 'C00000', end: 'C0FFFF', operator: 'other', country: 'Canada' },

  // India Military
  { start: '800000', end: '83FFFF', operator: 'other', country: 'India' },

  // Pakistan Military
  { start: '760000', end: '767FFF', operator: 'other', country: 'Pakistan' },

  // Egypt Military
  { start: '500000', end: '5003FF', operator: 'other', country: 'Egypt' },

  // Poland Military
  { start: '488000', end: '48FFFF', operator: 'other', country: 'Poland' },

  // Greece Military
  { start: '468000', end: '46FFFF', operator: 'other', country: 'Greece' },

  // Sweden Military
  { start: '4A8000', end: '4AFFFF', operator: 'other', country: 'Sweden' },

  // Norway Military
  { start: '478000', end: '47FFFF', operator: 'other', country: 'Norway' },

  // Belgium Military
  { start: '448000', end: '44FFFF', operator: 'other', country: 'Belgium' },

  // Denmark Military
  { start: '458000', end: '45FFFF', operator: 'other', country: 'Denmark' },

  // Finland Military
  { start: '460000', end: '467FFF', operator: 'other', country: 'Finland' },

  // Portugal Military
  { start: '490000', end: '497FFF', operator: 'other', country: 'Portugal' },

  // Czechia Military
  { start: '498000', end: '49FFFF', operator: 'other', country: 'Czechia' },

  // Switzerland Military
  { start: '4B0000', end: '4B7FFF', operator: 'other', country: 'Switzerland' },

  // Singapore Military
  { start: '768000', end: '76FFFF', operator: 'other', country: 'Singapore' },
];

/**
 * Known military vessel MMSI patterns and ranges
 * MMSI format: MIDxxxxxx where MID is the Maritime Identification Digits
 */
export interface VesselPattern {
  mmsiPrefix?: string;        // MMSI prefix to match
  mmsiRange?: { start: number; end: number };
  operator: MilitaryOperator | 'other';
  country: string;
  vesselType?: MilitaryVesselType;
}

// Military vessel MMSI patterns
export const MILITARY_VESSEL_PATTERNS: VesselPattern[] = [
  // US Navy / Coast Guard verified blocks
  { mmsiPrefix: '369970', operator: 'usn', country: 'USA' },
  { mmsiPrefix: '369971', operator: 'usn', country: 'USA' },
  { mmsiPrefix: '366970', operator: 'usn', country: 'USA' },
  { mmsiPrefix: '366971', operator: 'usn', country: 'USA' },
  { mmsiPrefix: '367970', operator: 'usn', country: 'USA' },

  // UK Royal Navy
  { mmsiPrefix: '2320', operator: 'rn', country: 'UK' },
];

/**
 * Known naval vessel names and hull numbers for identification
 */
export interface KnownNavalVessel {
  name: string;
  hullNumber?: string;
  mmsi?: string;
  operator: MilitaryOperator | 'other';
  country: string;
  vesselType: MilitaryVesselType;
  homePort?: string;
}

export const KNOWN_NAVAL_VESSELS: KnownNavalVessel[] = [
  // ==========================================
  // AIRCRAFT CARRIERS (carrier)
  // ==========================================
  // US Navy Supercarriers (Nimitz & Ford classes)
  { name: 'USS Gerald R. Ford', hullNumber: 'CVN-78', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS George H.W. Bush', hullNumber: 'CVN-77', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Ronald Reagan', hullNumber: 'CVN-76', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Harry S. Truman', hullNumber: 'CVN-75', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS John C. Stennis', hullNumber: 'CVN-74', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS George Washington', hullNumber: 'CVN-73', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Abraham Lincoln', hullNumber: 'CVN-72', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Theodore Roosevelt', hullNumber: 'CVN-71', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Carl Vinson', hullNumber: 'CVN-70', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Dwight D. Eisenhower', hullNumber: 'CVN-69', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Nimitz', hullNumber: 'CVN-68', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS John F. Kennedy', hullNumber: 'CVN-79', operator: 'usn', country: 'USA', vesselType: 'carrier' },
  { name: 'USS Enterprise', hullNumber: 'CVN-80', operator: 'usn', country: 'USA', vesselType: 'carrier' },

  // UK Royal Navy Queen Elizabeth class
  { name: 'HMS Queen Elizabeth', hullNumber: 'R08', operator: 'rn', country: 'UK', vesselType: 'carrier' },
  { name: 'HMS Prince of Wales', hullNumber: 'R09', operator: 'rn', country: 'UK', vesselType: 'carrier' },

  // French Marine Nationale
  { name: 'FS Charles de Gaulle', hullNumber: 'R91', operator: 'faf', country: 'France', vesselType: 'carrier' },

  // Italian Navy
  { name: 'ITS Cavour', hullNumber: 'C550', operator: 'other', country: 'Italy', vesselType: 'carrier' },
  { name: 'ITS Giuseppe Garibaldi', hullNumber: 'C551', operator: 'other', country: 'Italy', vesselType: 'carrier' },
  { name: 'ITS Trieste', hullNumber: 'L9890', operator: 'other', country: 'Italy', vesselType: 'carrier' },

  // Spanish Armada
  { name: 'SPS Juan Carlos I', hullNumber: 'L61', operator: 'other', country: 'Spain', vesselType: 'carrier' },

  // Turkish Navy (Drone / light carrier)
  { name: 'TCG Anadolu', hullNumber: 'L400', operator: 'other', country: 'Turkey', vesselType: 'carrier' },

  // Japan Maritime Self-Defense Force (Izumo/Hyuga class light carriers)
  { name: 'JS Izumo', hullNumber: 'DDH-183', operator: 'other', country: 'Japan', vesselType: 'carrier' },
  { name: 'JS Kaga', hullNumber: 'DDH-184', operator: 'other', country: 'Japan', vesselType: 'carrier' },
  { name: 'JS Hyuga', hullNumber: 'DDH-181', operator: 'other', country: 'Japan', vesselType: 'carrier' },
  { name: 'JS Ise', hullNumber: 'DDH-182', operator: 'other', country: 'Japan', vesselType: 'carrier' },

  // Chinese PLA Navy
  { name: 'Liaoning', hullNumber: 'CV-16', operator: 'plan', country: 'China', vesselType: 'carrier' },
  { name: 'Shandong', hullNumber: 'CV-17', operator: 'plan', country: 'China', vesselType: 'carrier' },
  { name: 'Fujian', hullNumber: 'CV-18', operator: 'plan', country: 'China', vesselType: 'carrier' },

  // Russian Navy
  { name: 'Admiral Kuznetsov', operator: 'vks', country: 'Russia', vesselType: 'carrier' },

  // Indian Navy
  { name: 'INS Vikramaditya', hullNumber: 'R33', operator: 'other', country: 'India', vesselType: 'carrier' },
  { name: 'INS Vikrant', hullNumber: 'R11', operator: 'other', country: 'India', vesselType: 'carrier' },

  // ==========================================
  // AMPHIBIOUS ASSAULT SHIPS (amphibious)
  // ==========================================
  // US Navy America & Wasp class (LHA / LHD)
  { name: 'USS America', hullNumber: 'LHA-6', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Tripoli', hullNumber: 'LHA-7', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Wasp', hullNumber: 'LHD-1', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Essex', hullNumber: 'LHD-2', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Kearsarge', hullNumber: 'LHD-3', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Boxer', hullNumber: 'LHD-4', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Bataan', hullNumber: 'LHD-5', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Iwo Jima', hullNumber: 'LHD-7', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Makin Island', hullNumber: 'LHD-8', operator: 'usn', country: 'USA', vesselType: 'amphibious' },

  // US Navy San Antonio & Harpers Ferry / Whidbey Island class (LPD / LSD / LCC)
  { name: 'USS San Antonio', hullNumber: 'LPD-17', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS New Orleans', hullNumber: 'LPD-18', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Mesa Verde', hullNumber: 'LPD-19', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Green Bay', hullNumber: 'LPD-20', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS New York', hullNumber: 'LPD-21', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS San Diego', hullNumber: 'LPD-22', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Anchorage', hullNumber: 'LPD-23', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Arlington', hullNumber: 'LPD-24', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Somerset', hullNumber: 'LPD-25', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS John P. Murtha', hullNumber: 'LPD-26', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Portland', hullNumber: 'LPD-27', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Fort Lauderdale', hullNumber: 'LPD-28', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Richard M. McCool Jr.', hullNumber: 'LPD-29', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Harpers Ferry', hullNumber: 'LSD-49', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Carter Hall', hullNumber: 'LSD-50', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Oak Hill', hullNumber: 'LSD-51', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Pearl Harbor', hullNumber: 'LSD-52', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Germantown', hullNumber: 'LSD-42', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Gunston Hall', hullNumber: 'LSD-44', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Comstock', hullNumber: 'LSD-45', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Tortuga', hullNumber: 'LSD-46', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Rushmore', hullNumber: 'LSD-47', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Blue Ridge', hullNumber: 'LCC-19', operator: 'usn', country: 'USA', vesselType: 'amphibious' },
  { name: 'USS Mount Whitney', hullNumber: 'LCC-20', operator: 'usn', country: 'USA', vesselType: 'amphibious' },

  // International Amphibious Warfare
  { name: 'HMS Albion', hullNumber: 'L14', operator: 'rn', country: 'UK', vesselType: 'amphibious' },
  { name: 'HMS Bulwark', hullNumber: 'L15', operator: 'rn', country: 'UK', vesselType: 'amphibious' },
  { name: 'RFA Mounts Bay', hullNumber: 'L3008', operator: 'rn', country: 'UK', vesselType: 'amphibious' },
  { name: 'RFA Cardigan Bay', hullNumber: 'L3009', operator: 'rn', country: 'UK', vesselType: 'amphibious' },
  { name: 'RFA Lyme Bay', hullNumber: 'L3007', operator: 'rn', country: 'UK', vesselType: 'amphibious' },
  { name: 'FS Mistral', hullNumber: 'L9013', operator: 'faf', country: 'France', vesselType: 'amphibious' },
  { name: 'FS Tonnerre', hullNumber: 'L9014', operator: 'faf', country: 'France', vesselType: 'amphibious' },
  { name: 'FS Dixmude', hullNumber: 'L9015', operator: 'faf', country: 'France', vesselType: 'amphibious' },
  { name: 'HMAS Canberra', hullNumber: 'L02', operator: 'other', country: 'Australia', vesselType: 'amphibious' },
  { name: 'HMAS Adelaide', hullNumber: 'L01', operator: 'other', country: 'Australia', vesselType: 'amphibious' },
  { name: 'HMAS Choules', hullNumber: 'L100', operator: 'other', country: 'Australia', vesselType: 'amphibious' },
  { name: 'Hainan', hullNumber: '31', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Guangxi', hullNumber: '32', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Anhui', hullNumber: '33', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Jiangxi', hullNumber: '34', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Kunlun Shan', hullNumber: '998', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Jinggang Shan', hullNumber: '999', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Changbai Shan', hullNumber: '989', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Yimeng Shan', hullNumber: '988', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Wuzhi Shan', hullNumber: '987', operator: 'plan', country: 'China', vesselType: 'amphibious' },
  { name: 'Ivan Gren', operator: 'vks', country: 'Russia', vesselType: 'amphibious' },
  { name: 'Petr Morgunov', operator: 'vks', country: 'Russia', vesselType: 'amphibious' },
  { name: 'SPS Galicia', hullNumber: 'L51', operator: 'other', country: 'Spain', vesselType: 'amphibious' },
  { name: 'SPS Castilla', hullNumber: 'L52', operator: 'other', country: 'Spain', vesselType: 'amphibious' },
  { name: 'ROKS Dokdo', hullNumber: 'LPH-6111', operator: 'other', country: 'South Korea', vesselType: 'amphibious' },
  { name: 'ROKS Marado', hullNumber: 'LPH-6112', operator: 'other', country: 'South Korea', vesselType: 'amphibious' },
  { name: 'TCG Bayraktar', hullNumber: 'L402', operator: 'other', country: 'Turkey', vesselType: 'amphibious' },
  { name: 'TCG Sancaktar', hullNumber: 'L403', operator: 'other', country: 'Turkey', vesselType: 'amphibious' },

  // ==========================================
  // CRUISERS & DESTROYERS (destroyer)
  // ==========================================
  // US Navy Cruisers (Ticonderoga class)
  { name: 'USS Philippine Sea', hullNumber: 'CG-58', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Normandy', hullNumber: 'CG-60', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Monterey', hullNumber: 'CG-61', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Robert Smalls', hullNumber: 'CG-62', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Chancellorsville', hullNumber: 'CG-62', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Gettysburg', hullNumber: 'CG-64', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Chosin', hullNumber: 'CG-65', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Shiloh', hullNumber: 'CG-67', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Lake Erie', hullNumber: 'CG-70', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Cape St. George', hullNumber: 'CG-71', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Princeton', hullNumber: 'CG-59', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Antietam', hullNumber: 'CG-54', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Leyte Gulf', hullNumber: 'CG-55', operator: 'usn', country: 'USA', vesselType: 'destroyer' },

  // US Navy Destroyers (Arleigh Burke & Zumwalt classes)
  { name: 'USS Arleigh Burke', hullNumber: 'DDG-51', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Barry', hullNumber: 'DDG-52', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS John Paul Jones', hullNumber: 'DDG-53', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Curtis Wilbur', hullNumber: 'DDG-54', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Stout', hullNumber: 'DDG-55', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS John S. McCain', hullNumber: 'DDG-56', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Mitscher', hullNumber: 'DDG-57', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Laboon', hullNumber: 'DDG-58', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Russell', hullNumber: 'DDG-59', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Paul Hamilton', hullNumber: 'DDG-60', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Ramage', hullNumber: 'DDG-61', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Fitzgerald', hullNumber: 'DDG-62', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Stethem', hullNumber: 'DDG-63', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Carney', hullNumber: 'DDG-64', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Benfold', hullNumber: 'DDG-65', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Gonzalez', hullNumber: 'DDG-66', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Cole', hullNumber: 'DDG-67', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS The Sullivans', hullNumber: 'DDG-68', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Milius', hullNumber: 'DDG-69', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Hopper', hullNumber: 'DDG-70', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Ross', hullNumber: 'DDG-71', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Mahan', hullNumber: 'DDG-72', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Decatur', hullNumber: 'DDG-73', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS McFaul', hullNumber: 'DDG-74', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Donald Cook', hullNumber: 'DDG-75', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Higgins', hullNumber: 'DDG-76', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: "USS O'Kane", hullNumber: 'DDG-77', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Porter', hullNumber: 'DDG-78', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Oscar Austin', hullNumber: 'DDG-79', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Roosevelt', hullNumber: 'DDG-80', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Winston S. Churchill', hullNumber: 'DDG-81', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Lassen', hullNumber: 'DDG-82', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Howard', hullNumber: 'DDG-83', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Bulkeley', hullNumber: 'DDG-84', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS McCampbell', hullNumber: 'DDG-85', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Shoup', hullNumber: 'DDG-86', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Mason', hullNumber: 'DDG-87', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Preble', hullNumber: 'DDG-88', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Mustin', hullNumber: 'DDG-89', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Chafee', hullNumber: 'DDG-90', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Pinckney', hullNumber: 'DDG-91', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Momsen', hullNumber: 'DDG-92', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Chung-Hoon', hullNumber: 'DDG-93', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Nitze', hullNumber: 'DDG-94', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS James E. Williams', hullNumber: 'DDG-95', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Bainbridge', hullNumber: 'DDG-96', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Forrest Sherman', hullNumber: 'DDG-97', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Farragut', hullNumber: 'DDG-98', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Kidd', hullNumber: 'DDG-100', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Gridley', hullNumber: 'DDG-101', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Sampson', hullNumber: 'DDG-102', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Truxtun', hullNumber: 'DDG-103', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Sterett', hullNumber: 'DDG-104', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Dewey', hullNumber: 'DDG-105', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Stockdale', hullNumber: 'DDG-106', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Gravely', hullNumber: 'DDG-107', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Wayne E. Meyer', hullNumber: 'DDG-108', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Jason Dunham', hullNumber: 'DDG-109', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS William P. Lawrence', hullNumber: 'DDG-110', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Spruance', hullNumber: 'DDG-111', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Michael Murphy', hullNumber: 'DDG-112', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS John Finn', hullNumber: 'DDG-113', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Ralph Johnson', hullNumber: 'DDG-114', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Rafael Peralta', hullNumber: 'DDG-115', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Thomas Hudner', hullNumber: 'DDG-116', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Paul Ignatius', hullNumber: 'DDG-117', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Daniel Inouye', hullNumber: 'DDG-118', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Delbert D. Black', hullNumber: 'DDG-119', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Carl M. Levin', hullNumber: 'DDG-120', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Frank E. Petersen Jr.', hullNumber: 'DDG-121', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS John Basilone', hullNumber: 'DDG-122', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Lenah Sutcliffe Higbee', hullNumber: 'DDG-123', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Jack H. Lucas', hullNumber: 'DDG-125', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Zumwalt', hullNumber: 'DDG-1000', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Michael Monsoor', hullNumber: 'DDG-1001', operator: 'usn', country: 'USA', vesselType: 'destroyer' },
  { name: 'USS Lyndon B. Johnson', hullNumber: 'DDG-1002', operator: 'usn', country: 'USA', vesselType: 'destroyer' },

  // UK Type 45 Destroyers
  { name: 'HMS Daring', hullNumber: 'D32', operator: 'rn', country: 'UK', vesselType: 'destroyer' },
  { name: 'HMS Dauntless', hullNumber: 'D33', operator: 'rn', country: 'UK', vesselType: 'destroyer' },
  { name: 'HMS Diamond', hullNumber: 'D34', operator: 'rn', country: 'UK', vesselType: 'destroyer' },
  { name: 'HMS Dragon', hullNumber: 'D35', operator: 'rn', country: 'UK', vesselType: 'destroyer' },
  { name: 'HMS Defender', hullNumber: 'D36', operator: 'rn', country: 'UK', vesselType: 'destroyer' },
  { name: 'HMS Duncan', hullNumber: 'D37', operator: 'rn', country: 'UK', vesselType: 'destroyer' },

  // Australian Hobart class Destroyers
  { name: 'HMAS Hobart', hullNumber: 'DDG-39', operator: 'other', country: 'Australia', vesselType: 'destroyer' },
  { name: 'HMAS Brisbane', hullNumber: 'DDG-41', operator: 'other', country: 'Australia', vesselType: 'destroyer' },
  { name: 'HMAS Sydney', hullNumber: 'DDG-42', operator: 'other', country: 'Australia', vesselType: 'destroyer' },

  // Chinese Type 055 & 052D Destroyers
  { name: 'Nanchang', hullNumber: '101', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Lhasa', hullNumber: '102', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Anshan', hullNumber: '103', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Wuxi', hullNumber: '104', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Dalian', hullNumber: '105', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: "Yan'an", hullNumber: '106', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Zunyi', hullNumber: '107', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Xianyang', hullNumber: '108', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Kunming', hullNumber: '172', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Changsha', hullNumber: '173', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Hefei', hullNumber: '174', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Yinchuan', hullNumber: '175', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Xining', hullNumber: '117', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Urumqi', hullNumber: '118', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Guiyang', hullNumber: '119', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Chengdu', hullNumber: '120', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Qiqihar', hullNumber: '121', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Tangshan', hullNumber: '122', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Zhanjiang', hullNumber: '165', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Nanning', hullNumber: '162', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Suzhou', hullNumber: '132', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Zibo', hullNumber: '156', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Taiyuan', hullNumber: '131', operator: 'plan', country: 'China', vesselType: 'destroyer' },
  { name: 'Nanjing', hullNumber: '155', operator: 'plan', country: 'China', vesselType: 'destroyer' },

  // Russian Cruisers & Destroyers
  { name: 'Pyotr Velikiy', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Admiral Nakhimov', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Marshal Ustinov', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Varyag', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Severomorsk', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Vice-Admiral Kulakov', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Admiral Panteleyev', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Admiral Tributs', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Admiral Levchenko', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },
  { name: 'Admiral Chabanenko', operator: 'vks', country: 'Russia', vesselType: 'destroyer' },

  // French Horizon Destroyers
  { name: 'FS Forbin', hullNumber: 'D620', operator: 'faf', country: 'France', vesselType: 'destroyer' },
  { name: 'FS Chevalier Paul', hullNumber: 'D621', operator: 'faf', country: 'France', vesselType: 'destroyer' },

  // Japanese Destroyers (Aegis Kongo/Atago/Maya)
  { name: 'JS Maya', hullNumber: 'DDG-179', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Haguro', hullNumber: 'DDG-180', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Atago', hullNumber: 'DDG-177', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Ashigara', hullNumber: 'DDG-178', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Kongo', hullNumber: 'DDG-173', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Kirishima', hullNumber: 'DDG-174', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Myoko', hullNumber: 'DDG-175', operator: 'other', country: 'Japan', vesselType: 'destroyer' },
  { name: 'JS Chokai', hullNumber: 'DDG-176', operator: 'other', country: 'Japan', vesselType: 'destroyer' },

  // South Korean Destroyers (Sejong the Great class)
  { name: 'ROKS Sejong the Great', hullNumber: 'DDG-991', operator: 'other', country: 'South Korea', vesselType: 'destroyer' },
  { name: 'ROKS Yulgok Yi I', hullNumber: 'DDG-992', operator: 'other', country: 'South Korea', vesselType: 'destroyer' },
  { name: 'ROKS Seoae Ryu Seong-ryong', hullNumber: 'DDG-993', operator: 'other', country: 'South Korea', vesselType: 'destroyer' },
  { name: 'ROKS Jeongjo the Great', hullNumber: 'DDG-995', operator: 'other', country: 'South Korea', vesselType: 'destroyer' },

  // Indian Destroyers (Visakhapatnam & Kolkata class)
  { name: 'INS Visakhapatnam', hullNumber: 'D66', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Mormugao', hullNumber: 'D67', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Imphal', hullNumber: 'D68', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Surat', hullNumber: 'D69', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Kolkata', hullNumber: 'D63', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Kochi', hullNumber: 'D64', operator: 'other', country: 'India', vesselType: 'destroyer' },
  { name: 'INS Chennai', hullNumber: 'D65', operator: 'other', country: 'India', vesselType: 'destroyer' },

  // ==========================================
  // FRIGATES & CORVETTES (frigate)
  // ==========================================
  // US Navy Frigates & Littoral Combat Ships
  { name: 'USS Constellation', hullNumber: 'FFG-62', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Freedom', hullNumber: 'LCS-1', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Independence', hullNumber: 'LCS-2', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Jackson', hullNumber: 'LCS-6', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Montgomery', hullNumber: 'LCS-8', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Gabrielle Giffords', hullNumber: 'LCS-10', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Omaha', hullNumber: 'LCS-12', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Manchester', hullNumber: 'LCS-14', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Tulsa', hullNumber: 'LCS-16', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Charleston', hullNumber: 'LCS-18', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Cincinnati', hullNumber: 'LCS-20', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Kansas City', hullNumber: 'LCS-22', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Oakland', hullNumber: 'LCS-24', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Mobile', hullNumber: 'LCS-26', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Savannah', hullNumber: 'LCS-28', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Canberra', hullNumber: 'LCS-30', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Santa Barbara', hullNumber: 'LCS-32', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Augusta', hullNumber: 'LCS-34', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Kingsville', hullNumber: 'LCS-36', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Pierre', hullNumber: 'LCS-38', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Billings', hullNumber: 'LCS-15', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Indianapolis', hullNumber: 'LCS-17', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS St. Louis', hullNumber: 'LCS-19', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Minneapolis-Saint Paul', hullNumber: 'LCS-21', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Cooperstown', hullNumber: 'LCS-23', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Marinette', hullNumber: 'LCS-25', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Nantucket', hullNumber: 'LCS-27', operator: 'usn', country: 'USA', vesselType: 'frigate' },
  { name: 'USS Beloit', hullNumber: 'LCS-29', operator: 'usn', country: 'USA', vesselType: 'frigate' },

  // UK Royal Navy Type 23 Frigates
  { name: 'HMS Lancaster', hullNumber: 'F229', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Iron Duke', hullNumber: 'F234', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Richmond', hullNumber: 'F239', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Somerset', hullNumber: 'F82', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Kent', hullNumber: 'F78', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Portland', hullNumber: 'F79', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS St Albans', hullNumber: 'F83', operator: 'rn', country: 'UK', vesselType: 'frigate' },
  { name: 'HMS Northumberland', hullNumber: 'F238', operator: 'rn', country: 'UK', vesselType: 'frigate' },

  // Royal Canadian Navy Halifax class
  { name: 'HMCS Halifax', hullNumber: 'FFH-330', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Ville de Quebec', hullNumber: 'FFH-332', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Toronto', hullNumber: 'FFH-333', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Fredericton', hullNumber: 'FFH-337', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Montreal', hullNumber: 'FFH-336', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Charlottetown', hullNumber: 'FFH-339', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: "HMCS St. John's", hullNumber: 'FFH-340', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Ottawa', hullNumber: 'FFH-341', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Calgary', hullNumber: 'FFH-335', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Vancouver', hullNumber: 'FFH-331', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Regina', hullNumber: 'FFH-334', operator: 'other', country: 'Canada', vesselType: 'frigate' },
  { name: 'HMCS Winnipeg', hullNumber: 'FFH-338', operator: 'other', country: 'Canada', vesselType: 'frigate' },

  // Royal Australian Navy Anzac class
  { name: 'HMAS Anzac', hullNumber: 'FFH-150', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Arunta', hullNumber: 'FFH-151', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Warramunga', hullNumber: 'FFH-152', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Stuart', hullNumber: 'FFH-153', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Parramatta', hullNumber: 'FFH-154', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Ballarat', hullNumber: 'FFH-155', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Toowoomba', hullNumber: 'FFH-156', operator: 'other', country: 'Australia', vesselType: 'frigate' },
  { name: 'HMAS Perth', hullNumber: 'FFH-157', operator: 'other', country: 'Australia', vesselType: 'frigate' },

  // German Navy Frigates (Sachsen & Baden-Württemberg classes)
  { name: 'FGS Sachsen', hullNumber: 'F219', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Hamburg', hullNumber: 'F220', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Hessen', hullNumber: 'F221', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Baden-Württemberg', hullNumber: 'F222', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Nordrhein-Westfalen', hullNumber: 'F223', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Sachsen-Anhalt', hullNumber: 'F224', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Rheinland-Pfalz', hullNumber: 'F225', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Brandenburg', hullNumber: 'F215', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Schleswig-Holstein', hullNumber: 'F216', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Bayern', hullNumber: 'F217', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Mecklenburg-Vorpommern', hullNumber: 'F218', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Braunschweig', hullNumber: 'F260', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Magdeburg', hullNumber: 'F261', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Erfurt', hullNumber: 'F262', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Oldenburg', hullNumber: 'F263', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },
  { name: 'FGS Ludwigshafen am Rhein', hullNumber: 'F264', operator: 'gaf', country: 'Germany', vesselType: 'frigate' },

  // French Marine Nationale FREMM & La Fayette
  { name: 'FS Aquitaine', hullNumber: 'D650', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Normandie', hullNumber: 'D651', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Provence', hullNumber: 'D652', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Languedoc', hullNumber: 'D653', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Auvergne', hullNumber: 'D654', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Bretagne', hullNumber: 'D655', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Alsace', hullNumber: 'D656', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Lorraine', hullNumber: 'D657', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS La Fayette', hullNumber: 'F710', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Courbet', hullNumber: 'F712', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Surcouf', hullNumber: 'F711', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Guepratte', hullNumber: 'F714', operator: 'faf', country: 'France', vesselType: 'frigate' },
  { name: 'FS Aconit', hullNumber: 'F713', operator: 'faf', country: 'France', vesselType: 'frigate' },

  // Italian Navy FREMM
  { name: 'ITS Carlo Bergamini', hullNumber: 'F590', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Virginio Fasan', hullNumber: 'F591', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Carlo Margottini', hullNumber: 'F592', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Carabiniere', hullNumber: 'F593', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Alpino', hullNumber: 'F594', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Luigi Rizzo', hullNumber: 'F595', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Federico Martinengo', hullNumber: 'F596', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Antonio Marceglia', hullNumber: 'F597', operator: 'other', country: 'Italy', vesselType: 'frigate' },
  { name: 'ITS Paolo Thaon di Revel', hullNumber: 'P430', operator: 'other', country: 'Italy', vesselType: 'frigate' },

  // Spanish Alvaro de Bazan class
  { name: 'SPS Alvaro de Bazan', hullNumber: 'F101', operator: 'other', country: 'Spain', vesselType: 'frigate' },
  { name: 'SPS Almirante Juan de Borbon', hullNumber: 'F102', operator: 'other', country: 'Spain', vesselType: 'frigate' },
  { name: 'SPS Blas de Lezo', hullNumber: 'F103', operator: 'other', country: 'Spain', vesselType: 'frigate' },
  { name: 'SPS Mendez Nunez', hullNumber: 'F104', operator: 'other', country: 'Spain', vesselType: 'frigate' },
  { name: 'SPS Cristobal Colon', hullNumber: 'F105', operator: 'other', country: 'Spain', vesselType: 'frigate' },

  // Turkish Navy Frigates & Corvettes (MILGEM / Barbaros)
  { name: 'TCG Istanbul', hullNumber: 'F515', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Heybeliada', hullNumber: 'F511', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Buyukada', hullNumber: 'F512', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Burgazada', hullNumber: 'F513', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Kinaliada', hullNumber: 'F514', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Barbaros', hullNumber: 'F244', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Orucreis', hullNumber: 'F245', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Salihreis', hullNumber: 'F246', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Kemalreis', hullNumber: 'F247', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Gaziantep', hullNumber: 'F490', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Giresun', hullNumber: 'F491', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Gemlik', hullNumber: 'F492', operator: 'other', country: 'Turkey', vesselType: 'frigate' },
  { name: 'TCG Gelibolu', hullNumber: 'F493', operator: 'other', country: 'Turkey', vesselType: 'frigate' },

  // Russian Frigates & Corvettes
  { name: 'Admiral Gorshkov', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Admiral Kasatonov', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Admiral Golovko', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Admiral Grigorovich', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Admiral Essen', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Admiral Makarov', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Yaroslav Mudry', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Neustrashimy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Steregushchiy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Soobrazitelny', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Boykiy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Stoikiy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Gromkiy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },
  { name: 'Gremyashchiy', operator: 'vks', country: 'Russia', vesselType: 'frigate' },

  // Chinese Type 054A/B Frigates
  { name: 'Zhoushan', hullNumber: '529', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Xuzhou', hullNumber: '530', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Yiyang', hullNumber: '548', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Changzhou', hullNumber: '549', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Yantai', hullNumber: '538', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Linyi', hullNumber: '547', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Weifang', hullNumber: '550', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Liuzhou', hullNumber: '573', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Yueyang', hullNumber: '575', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Daqing', hullNumber: '576', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Huanggang', hullNumber: '577', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Binzhou', hullNumber: '515', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Wuhu', hullNumber: '539', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Rizhao', hullNumber: '598', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Anyang', hullNumber: '599', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Nantong', hullNumber: '601', operator: 'plan', country: 'China', vesselType: 'frigate' },
  { name: 'Zaozhuang', hullNumber: '542', operator: 'plan', country: 'China', vesselType: 'frigate' },

  // Japan Mogami class Frigates
  { name: 'JS Mogami', hullNumber: 'FFM-1', operator: 'other', country: 'Japan', vesselType: 'frigate' },
  { name: 'JS Kumano', hullNumber: 'FFM-2', operator: 'other', country: 'Japan', vesselType: 'frigate' },
  { name: 'JS Noshiro', hullNumber: 'FFM-3', operator: 'other', country: 'Japan', vesselType: 'frigate' },
  { name: 'JS Mikuma', hullNumber: 'FFM-4', operator: 'other', country: 'Japan', vesselType: 'frigate' },
  { name: 'JS Yahagi', hullNumber: 'FFM-5', operator: 'other', country: 'Japan', vesselType: 'frigate' },
  { name: 'JS Agano', hullNumber: 'FFM-6', operator: 'other', country: 'Japan', vesselType: 'frigate' },

  // ==========================================
  // SUBMARINES (submarine)
  // ==========================================
  // US Navy Virginia, Seawolf, Los Angeles & Ohio classes
  { name: 'USS Ohio', hullNumber: 'SSGN-726', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Michigan', hullNumber: 'SSGN-727', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Florida', hullNumber: 'SSGN-728', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Georgia', hullNumber: 'SSGN-729', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Seawolf', hullNumber: 'SSN-21', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Connecticut', hullNumber: 'SSN-22', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Jimmy Carter', hullNumber: 'SSN-23', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Virginia', hullNumber: 'SSN-774', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Texas', hullNumber: 'SSN-775', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Hawaii', hullNumber: 'SSN-776', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS North Carolina', hullNumber: 'SSN-777', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Missouri', hullNumber: 'SSN-780', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS California', hullNumber: 'SSN-781', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Mississippi', hullNumber: 'SSN-782', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Minnesota', hullNumber: 'SSN-783', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS North Dakota', hullNumber: 'SSN-784', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS John Warner', hullNumber: 'SSN-785', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Illinois', hullNumber: 'SSN-786', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Washington', hullNumber: 'SSN-787', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Colorado', hullNumber: 'SSN-788', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Indiana', hullNumber: 'SSN-789', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS South Dakota', hullNumber: 'SSN-790', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Delaware', hullNumber: 'SSN-791', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Vermont', hullNumber: 'SSN-792', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Oregon', hullNumber: 'SSN-793', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Montana', hullNumber: 'SSN-794', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Hyman G. Rickover', hullNumber: 'SSN-795', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS New Jersey', hullNumber: 'SSN-796', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Iowa', hullNumber: 'SSN-797', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Los Angeles', hullNumber: 'SSN-688', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Annapolis', hullNumber: 'SSN-760', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Springfield', hullNumber: 'SSN-761', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Columbus', hullNumber: 'SSN-762', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Santa Fe', hullNumber: 'SSN-763', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Henry M. Jackson', hullNumber: 'SSBN-730', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Alabama', hullNumber: 'SSBN-731', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Alaska', hullNumber: 'SSBN-732', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Nevada', hullNumber: 'SSBN-733', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Tennessee', hullNumber: 'SSBN-734', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Pennsylvania', hullNumber: 'SSBN-735', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS West Virginia', hullNumber: 'SSBN-736', operator: 'usn', country: 'USA', vesselType: 'submarine' },
  { name: 'USS Kentucky', hullNumber: 'SSBN-737', operator: 'usn', country: 'USA', vesselType: 'submarine' },

  // UK Royal Navy Astute & Vanguard classes
  { name: 'HMS Astute', hullNumber: 'S119', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Ambush', hullNumber: 'S120', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Artful', hullNumber: 'S121', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Audacious', hullNumber: 'S122', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Anson', hullNumber: 'S123', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Vanguard', hullNumber: 'S28', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Victorious', hullNumber: 'S29', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Vigilant', hullNumber: 'S30', operator: 'rn', country: 'UK', vesselType: 'submarine' },
  { name: 'HMS Vengeance', hullNumber: 'S31', operator: 'rn', country: 'UK', vesselType: 'submarine' },

  // French Marine Nationale Suffren & Triomphant
  { name: 'FS Suffren', hullNumber: 'S635', operator: 'faf', country: 'France', vesselType: 'submarine' },
  { name: 'FS Duguay-Trouin', hullNumber: 'S636', operator: 'faf', country: 'France', vesselType: 'submarine' },
  { name: 'FS Tourville', hullNumber: 'S637', operator: 'faf', country: 'France', vesselType: 'submarine' },
  { name: 'FS Triomphant', hullNumber: 'S616', operator: 'faf', country: 'France', vesselType: 'submarine' },
  { name: 'FS Temeraire', hullNumber: 'S617', operator: 'faf', country: 'France', vesselType: 'submarine' },

  // Russian Navy Yasen, Borei & Kilo
  { name: 'Severodvinsk', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Kazan', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Novosibirsk', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Krasnoyarsk', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Knyaz Vladimir', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Generalissimus Suvorov', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Imperator Aleksandr III', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Belgorod', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Rostov-na-Donu', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Krasnodar', operator: 'vks', country: 'Russia', vesselType: 'submarine' },
  { name: 'Veliky Novgorod', operator: 'vks', country: 'Russia', vesselType: 'submarine' },

  // German Navy Type 212A
  { name: 'FGS U31', hullNumber: 'S181', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },
  { name: 'FGS U32', hullNumber: 'S182', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },
  { name: 'FGS U33', hullNumber: 'S183', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },
  { name: 'FGS U34', hullNumber: 'S184', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },
  { name: 'FGS U35', hullNumber: 'S185', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },
  { name: 'FGS U36', hullNumber: 'S186', operator: 'gaf', country: 'Germany', vesselType: 'submarine' },

  // Australian Collins class
  { name: 'HMAS Collins', hullNumber: 'SSG-73', operator: 'other', country: 'Australia', vesselType: 'submarine' },
  { name: 'HMAS Farncomb', hullNumber: 'SSG-74', operator: 'other', country: 'Australia', vesselType: 'submarine' },
  { name: 'HMAS Waller', hullNumber: 'SSG-75', operator: 'other', country: 'Australia', vesselType: 'submarine' },
  { name: 'HMAS Dechaineux', hullNumber: 'SSG-76', operator: 'other', country: 'Australia', vesselType: 'submarine' },
  { name: 'HMAS Sheean', hullNumber: 'SSG-77', operator: 'other', country: 'Australia', vesselType: 'submarine' },
  { name: 'HMAS Rankin', hullNumber: 'SSG-78', operator: 'other', country: 'Australia', vesselType: 'submarine' },

  // Canadian Victoria class
  { name: 'HMCS Victoria', hullNumber: 'SSK-876', operator: 'other', country: 'Canada', vesselType: 'submarine' },
  { name: 'HMCS Corner Brook', hullNumber: 'SSK-878', operator: 'other', country: 'Canada', vesselType: 'submarine' },
  { name: 'HMCS Chicoutimi', hullNumber: 'SSK-879', operator: 'other', country: 'Canada', vesselType: 'submarine' },
  { name: 'HMCS Windsor', hullNumber: 'SSK-877', operator: 'other', country: 'Canada', vesselType: 'submarine' },

  // ==========================================
  // ICEBREAKERS (icebreaker)
  // ==========================================
  // US Coast Guard Polar & Great Lakes Icebreakers
  { name: 'USCGC Healy', hullNumber: 'WAGB-20', operator: 'usn', country: 'USA', vesselType: 'icebreaker' },
  { name: 'USCGC Polar Star', hullNumber: 'WAGB-10', operator: 'usn', country: 'USA', vesselType: 'icebreaker' },
  { name: 'USCGC Polar Sea', hullNumber: 'WAGB-11', operator: 'usn', country: 'USA', vesselType: 'icebreaker' },
  { name: 'USCGC Mackinaw', hullNumber: 'WLBB-30', operator: 'usn', country: 'USA', vesselType: 'icebreaker' },

  // Canadian Navy AOPS & Coast Guard Heavy Icebreakers
  { name: 'HMCS Harry DeWolf', hullNumber: 'AOPV-430', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'HMCS Margaret Brooke', hullNumber: 'AOPV-431', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'HMCS Max Bernays', hullNumber: 'AOPV-432', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'HMCS William Hall', hullNumber: 'AOPV-433', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Louis S. St-Laurent', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Terry Fox', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Amundsen', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Des Groseilliers', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Pierre Radisson', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },
  { name: 'CCGS Henry Larsen', operator: 'other', country: 'Canada', vesselType: 'icebreaker' },

  // Russian Nuclear & Patrol Icebreakers
  { name: 'Arktika', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Sibir', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Ural', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: '50 Let Pobedy', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Yamal', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Taymyr', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Vaygach', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Ilya Muromets', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Yevpaty Kolovrat', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },
  { name: 'Ivan Papanin', operator: 'vks', country: 'Russia', vesselType: 'icebreaker' },

  // Chinese Polar Icebreakers
  { name: 'Xue Long', operator: 'plan', country: 'China', vesselType: 'icebreaker' },
  { name: 'Xue Long 2', operator: 'plan', country: 'China', vesselType: 'icebreaker' },
  { name: 'Haibing 722', operator: 'plan', country: 'China', vesselType: 'icebreaker' },
  { name: 'Haibing 723', operator: 'plan', country: 'China', vesselType: 'icebreaker' },

  // UK Antarctic Patrol Icebreaker
  { name: 'HMS Protector', hullNumber: 'A173', operator: 'rn', country: 'UK', vesselType: 'icebreaker' },

  // ==========================================
  // PATROL & CUTTERS (patrol)
  // ==========================================
  // US Coast Guard Legend-class National Security Cutters (WMSL)
  { name: 'USCGC Bertholf', hullNumber: 'WMSL-750', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Waesche', hullNumber: 'WMSL-751', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Stratton', hullNumber: 'WMSL-752', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Hamilton', hullNumber: 'WMSL-753', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC James', hullNumber: 'WMSL-754', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Munro', hullNumber: 'WMSL-755', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Kimball', hullNumber: 'WMSL-756', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Midgett', hullNumber: 'WMSL-757', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Stone', hullNumber: 'WMSL-758', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Calhoun', hullNumber: 'WMSL-759', operator: 'usn', country: 'USA', vesselType: 'patrol' },
  { name: 'USCGC Friedman', hullNumber: 'WMSL-760', operator: 'usn', country: 'USA', vesselType: 'patrol' },

  // UK Royal Navy River class Patrol
  { name: 'HMS Severn', hullNumber: 'P282', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Tyne', hullNumber: 'P281', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Mersey', hullNumber: 'P283', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Tamar', hullNumber: 'P233', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Spey', hullNumber: 'P234', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Medway', hullNumber: 'P223', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Trent', hullNumber: 'P224', operator: 'rn', country: 'UK', vesselType: 'patrol' },
  { name: 'HMS Forth', hullNumber: 'P222', operator: 'rn', country: 'UK', vesselType: 'patrol' },

  // ==========================================
  // AUXILIARY & LOGISTICS (auxiliary)
  // ==========================================
  // US Navy / MSC Hospital Ships
  { name: 'USNS Comfort', hullNumber: 'T-AH-20', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Mercy', hullNumber: 'T-AH-19', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },

  // US Navy Replenishment Oilers & Dry Cargo (T-AO / T-AKE / T-EPF / T-ESB)
  { name: 'USNS Lewis and Clark', hullNumber: 'T-AKE-1', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Alan Shepard', hullNumber: 'T-AKE-3', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Wally Schirra', hullNumber: 'T-AKE-8', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Henry J. Kaiser', hullNumber: 'T-AO-187', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Pecos', hullNumber: 'T-AO-197', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Big Horn', hullNumber: 'T-AO-198', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS John Lewis', hullNumber: 'T-AO-205', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Harvey Milk', hullNumber: 'T-AO-206', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Supply', hullNumber: 'T-AOE-6', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Arctic', hullNumber: 'T-AOE-8', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Lewis B. Puller', hullNumber: 'T-ESB-3', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Hershel "Woody" Williams', hullNumber: 'T-ESB-4', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USNS Spearhead', hullNumber: 'T-EPF-1', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USS Emory S. Land', hullNumber: 'AS-39', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },
  { name: 'USS Frank Cable', hullNumber: 'AS-40', operator: 'usn', country: 'USA', vesselType: 'auxiliary' },

  // UK Royal Fleet Auxiliary (RFA)
  { name: 'RFA Fort Victoria', hullNumber: 'A387', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },
  { name: 'RFA Tidespring', hullNumber: 'A136', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },
  { name: 'RFA Tiderace', hullNumber: 'A137', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },
  { name: 'RFA Tidesurge', hullNumber: 'A138', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },
  { name: 'RFA Tideforce', hullNumber: 'A139', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },
  { name: 'RFA Argus', hullNumber: 'A135', operator: 'rn', country: 'UK', vesselType: 'auxiliary' },

  // French & German Auxiliaries
  { name: 'FS Jacques Chevalier', hullNumber: 'A725', operator: 'faf', country: 'France', vesselType: 'auxiliary' },
  { name: 'FS Somme', hullNumber: 'A631', operator: 'faf', country: 'France', vesselType: 'auxiliary' },
  { name: 'FGS Berlin', hullNumber: 'A1411', operator: 'gaf', country: 'Germany', vesselType: 'auxiliary' },
  { name: 'FGS Frankfurt am Main', hullNumber: 'A1412', operator: 'gaf', country: 'Germany', vesselType: 'auxiliary' },
  { name: 'FGS Bonn', hullNumber: 'A1413', operator: 'gaf', country: 'Germany', vesselType: 'auxiliary' },

  // Chinese Fast Combat Support Ships
  { name: 'Hulun Lake', hullNumber: '901', operator: 'plan', country: 'China', vesselType: 'auxiliary' },
  { name: 'Chagan Lake', hullNumber: '905', operator: 'plan', country: 'China', vesselType: 'auxiliary' },
  { name: 'Weishan Lake', hullNumber: '887', operator: 'plan', country: 'China', vesselType: 'auxiliary' },
  { name: 'Tai Lake', hullNumber: '889', operator: 'plan', country: 'China', vesselType: 'auxiliary' },

  // Australian & Canadian Auxiliaries
  { name: 'HMAS Supply', hullNumber: 'A195', operator: 'other', country: 'Australia', vesselType: 'auxiliary' },
  { name: 'HMAS Stalwart', hullNumber: 'A304', operator: 'other', country: 'Australia', vesselType: 'auxiliary' },
  { name: 'Asterix', operator: 'other', country: 'Canada', vesselType: 'auxiliary' },

  // ==========================================
  // RESEARCH & SURVEILLANCE (research)
  // ==========================================
  // US Navy Ocean Surveillance & Survey (T-AGOS / T-AGS)
  { name: 'USNS Victorious', hullNumber: 'T-AGOS-19', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Able', hullNumber: 'T-AGOS-20', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Effective', hullNumber: 'T-AGOS-21', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Loyal', hullNumber: 'T-AGOS-22', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Impeccable', hullNumber: 'T-AGOS-23', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Bowditch', hullNumber: 'T-AGS-62', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Howard O. Lorenzen', hullNumber: 'T-AGM-25', operator: 'usn', country: 'USA', vesselType: 'research' },
  { name: 'USNS Invincible', hullNumber: 'T-AGM-24', operator: 'usn', country: 'USA', vesselType: 'research' },

  // UK Royal Navy Survey
  { name: 'HMS Scott', hullNumber: 'H131', operator: 'rn', country: 'UK', vesselType: 'research' },

  // Chinese Space Tracking & Electronic Spy Ships
  { name: 'Yuan Wang 3', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Yuan Wang 5', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Yuan Wang 6', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Yuan Wang 7', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Haiwangxing', hullNumber: '792', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Tianwangxing', hullNumber: '791', operator: 'plan', country: 'China', vesselType: 'research' },
  { name: 'Beijixing', hullNumber: '793', operator: 'plan', country: 'China', vesselType: 'research' },

  // Russian Intelligence & Oceanographic Ships
  { name: 'Yantar', operator: 'vks', country: 'Russia', vesselType: 'research' },
  { name: 'Sibiryakov', operator: 'vks', country: 'Russia', vesselType: 'research' },
  { name: 'Akademik Aleksandrov', operator: 'vks', country: 'Russia', vesselType: 'research' },
];

export interface ClassifiedNavalVessel {
  name: string;
  vesselType: MilitaryVesselType;
  hullNumber?: string;
  operator: MilitaryOperator | 'other';
  country: string;
}

/**
 * Extract naval hull designation and deduce vessel type from text
 */
export function extractNavalHullAndType(text: string): { hull?: string; type?: MilitaryVesselType } | undefined {
  if (!text) return undefined;
  const t = text.toUpperCase();

  // 1. Aircraft Carriers
  let m = t.match(/\b(CVN|CV|CVA|CVH)[-\s]?(\d+)\b/);
  if (m) return { type: 'carrier', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(R0[89]|R11|R33|R91|C550|C551)\b/);
  if (m) return { type: 'carrier', hull: m[1] };
  m = t.match(/\bDDH[-\s]?(18[1-4])\b/);
  if (m) return { type: 'carrier', hull: `DDH-${m[1]}` };

  // 2. Amphibious Warfare
  m = t.match(/\b(LHA|LHD|LPH|LPD|LSD|LST|LCC|LCAC)[-\s]?(\d+)\b/);
  if (m) return { type: 'amphibious', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(L0[12]|L1[45]|L40[023]|L100|L5[12]|L901[345]|L9890|L300[789])\b/);
  if (m) return { type: 'amphibious', hull: m[1] };

  // 3. Submarines
  m = t.match(/\b(SSN|SSBN|SSGN|SSK|SSC|SS)[-\s]?(\d+)\b/);
  if (m) return { type: 'submarine', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(S119|S12[0-4]|S2[89]|S3[01]|S63[5-7]|S61[6-9]|S52[6-9]|S330|S0[23]|S2[1-6]|S5[5-9]|S6[0-2]|S4[5-7]|U3[1-6]|SS-5\d{2})\b/);
  if (m) return { type: 'submarine', hull: m[1] };

  // 4. Cruisers & Destroyers
  m = t.match(/\b(DDG|DD|DDH|DLG|DL|CG|CGN)[-\s]?(\d+)\b/);
  if (m) return { type: 'destroyer', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(D3[2-7]|D62[01]|D55[34]|D6[0-9])\b/);
  if (m) return { type: 'destroyer', hull: m[1] };

  // 5. Frigates & Corvettes
  m = t.match(/\b(FFG|FF|FFH|FFL|FFM|DE|LCS)[-\s]?(\d+)\b/);
  if (m) return { type: 'frigate', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(F21[5-9]|F22[0-5]|F26[0-4]|F229|F23[489]|F8[23]|F7[89]|F71[0-4]|F59[0-9]|F10[1-5]|F49[0-7]|F51[1-5])\b/);
  if (m) return { type: 'frigate', hull: m[1] };
  m = t.match(/\b(K130|K60)\b/);
  if (m) return { type: 'frigate', hull: m[1] };

  // 6. Icebreakers
  m = t.match(/\b(WAGB|WLBB|AOPV)[-\s]?(\d+)\b/);
  if (m) return { type: 'icebreaker', hull: `${m[1]}-${m[2]}` };

  // 7. Patrol & Cutters
  m = t.match(/\b(WMSL|WPC|WPB|WMEC|WLB|WLM|MCM|MCO|MSO|PC|PB|OPV|IPV)[-\s]?(\d+)\b/);
  if (m) return { type: 'patrol', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(P22[2-4]|P23[34]|P28[1-3]|P43[0-4])\b/);
  if (m) return { type: 'patrol', hull: m[1] };

  // 8. Auxiliary & Logistics
  m = t.match(/\b(T-AO|T-AKE|T-AOE|T-ARS|T-EPF|T-ESB|T-ESD|T-AH|T-ATF|AO|AOR|AOE|AKE|AE|AFS|AS|AD|ARS|ATF)[-\s]?(\d+)\b/);
  if (m) return { type: 'auxiliary', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(A13[5-9]|A141[1-3]|A1443|A725|A631|A195|A304|A1[45]|A532[679]|A5335|A5[0789]|A1590|A580)\b/);
  if (m) return { type: 'auxiliary', hull: m[1] };

  // 9. Research & Ocean Surveillance
  m = t.match(/\b(T-AGOS|T-AGS|T-AGM|AGOS|AGS|AGM|AGOR|AGI)[-\s]?(\d+)\b/);
  if (m) return { type: 'research', hull: `${m[1]}-${m[2]}` };
  m = t.match(/\b(H13[01])\b/);
  if (m) return { type: 'research', hull: m[1] };

  return undefined;
}

/**
 * Accurately classify a naval vessel based on its actual type, hull number, operator, and country.
 */
export function classifyNavalVessel(
  name?: string | null,
  explicitHull?: string | null,
  aisShipType?: number | string | null
): ClassifiedNavalVessel | undefined {
  const rawName = (name || '').trim();
  const rawHull = (explicitHull || '').trim();
  if (!rawName && !rawHull) return undefined;

  const normalized = rawName.toUpperCase();

  // Commercial / Civilian vessels must never be classified as warships
  // (unless they start with an explicit naval prefix like "USS Harpers Ferry")
  const hasNavalPrefix = /^(?:USS|USNS|USCGC|HMS|HMCS|HMAS|FGS|FS|TCG|ROKS|JS|INS|RFS|CNS|PLAN|PLANS|ITS|SPS|CCGS|RFA)\s+/i.test(rawName);
  if (!hasNavalPrefix) {
    const commercialKeywords = [
      /\b(?:CARGO|CONTAINER|BULKER|BULK|TANKER|FEEDER|EXPRESS|FREIGHTER|BARGE|TUG|TUGBOAT|TRAWLER|FISHER|FISHING|FERRY|CRUISE|YACHT|PILOT|DREDGER|DREDGING)\b/,
      /\b(?:MAERSK|MSC\b|CMA\s+CGM|COSCO|EVERGREEN|HAPAG|OOCL|WAN\s+HAI|YANG\s+MING|ZIM\b)/,
      /\b(?:YU|HUO|HAI)\s*\d+/,
      /\b(?:F\/V|M\/V|M\/T|S\/V)\b/,
    ];
    if (commercialKeywords.some(pattern => pattern.test(normalized))) return undefined;
  }

  // 1. Direct registry lookup in KNOWN_NAVAL_VESSELS
  for (const vessel of KNOWN_NAVAL_VESSELS) {
    const vName = vessel.name.toUpperCase();
    const isSingleWord = !vName.includes(' ') && !vName.includes('.');

    if (isSingleWord) {
      const singleWordRegex = new RegExp(`^(?:CNS|PLAN|PLANS|RFS)?\\s*${vName}(?:\\s*(?:${vessel.hullNumber || ''}|CV-\\d+|\\d+))?$`, 'i');
      if (singleWordRegex.test(normalized)) {
        return {
          name: vessel.name,
          vesselType: vessel.vesselType,
          hullNumber: rawHull || vessel.hullNumber,
          operator: vessel.operator,
          country: vessel.country,
        };
      }
    } else {
      if (normalized === vName || normalized.startsWith(vName) || normalized.includes(vName)) {
        return {
          name: vessel.name,
          vesselType: vessel.vesselType,
          hullNumber: rawHull || vessel.hullNumber,
          operator: vessel.operator,
          country: vessel.country,
        };
      }
    }

    if (vessel.hullNumber) {
      const hull = vessel.hullNumber.toUpperCase();
      const escaped = hull.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^A-Z0-9])(?:CV-)?${escaped}(?:[^A-Z0-9]|$)`, 'i');
      if (regex.test(normalized) || (rawHull && rawHull.toUpperCase() === hull)) {
        return {
          name: vessel.name,
          vesselType: vessel.vesselType,
          hullNumber: vessel.hullNumber,
          operator: vessel.operator,
          country: vessel.country,
        };
      }
    }
  }

  // 2. Extract hull classification and vessel type from explicit hull or name
  const hullMatch = (rawHull && extractNavalHullAndType(rawHull)) || extractNavalHullAndType(normalized);

  // 3. Name keywords check
  let keywordType: MilitaryVesselType | undefined;
  if (/\b(?:CARRIER|SUPERCARRIER)\b/.test(normalized)) keywordType = 'carrier';
  else if (/\b(?:SUBMARINE|SUBMERSIBLE|U-BOAT)\b/.test(normalized)) keywordType = 'submarine';
  else if (/\b(?:AMPHIBIOUS|ASSAULT\s+SHIP|LANDING\s+SHIP|LANDING\s+DOCK|EXPEDITIONARY)\b/.test(normalized)) keywordType = 'amphibious';
  else if (/\b(?:ICEBREAKER|ICE\s+BREAKER)\b/.test(normalized)) keywordType = 'icebreaker';
  else if (/\b(?:CRUISER|BATTLECRUISER|DESTROYER)\b/.test(normalized)) keywordType = 'destroyer';
  else if (/\b(?:FRIGATE|CORVETTE|LITTORAL\s+COMBAT)\b/.test(normalized)) keywordType = 'frigate';
  else if (/\b(?:CUTTER|PATROL|COAST\s+GUARD|MINESWEEPER|MINEHUNTER)\b/.test(normalized)) keywordType = 'patrol';
  else if (/\b(?:HOSPITAL\s+SHIP|REPLENISHMENT|OILER|SUPPLY\s+SHIP|TENDER)\b/.test(normalized)) keywordType = 'auxiliary';
  else if (/\b(?:SURVEY\s+SHIP|OCEANOGRAPHIC|INTELLIGENCE\s+SHIP|SPY\s+SHIP)\b/.test(normalized)) keywordType = 'research';

  // 4. Operator and country from naval prefix
  let operator: MilitaryOperator | 'other' = 'other';
  let country = 'Unknown';
  let prefixDefaultType: MilitaryVesselType | undefined;

  const prefixRules: Array<{
    prefix: string;
    operator: MilitaryOperator | 'other';
    country: string;
    defaultType: MilitaryVesselType;
  }> = [
    { prefix: 'USCGC ', operator: 'usn', country: 'USA', defaultType: 'patrol' },
    { prefix: 'USNS ', operator: 'usn', country: 'USA', defaultType: 'auxiliary' },
    { prefix: 'USS ', operator: 'usn', country: 'USA', defaultType: 'destroyer' },
    { prefix: 'HMS ', operator: 'rn', country: 'UK', defaultType: 'frigate' },
    { prefix: 'RFA ', operator: 'rn', country: 'UK', defaultType: 'auxiliary' },
    { prefix: 'HMCS ', operator: 'other', country: 'Canada', defaultType: 'frigate' },
    { prefix: 'CCGS ', operator: 'other', country: 'Canada', defaultType: 'patrol' },
    { prefix: 'HMAS ', operator: 'other', country: 'Australia', defaultType: 'frigate' },
    { prefix: 'FGS ', operator: 'gaf', country: 'Germany', defaultType: 'frigate' },
    { prefix: 'FS ', operator: 'faf', country: 'France', defaultType: 'frigate' },
    { prefix: 'ROKS ', operator: 'other', country: 'South Korea', defaultType: 'destroyer' },
    { prefix: 'JS ', operator: 'other', country: 'Japan', defaultType: 'destroyer' },
    { prefix: 'TCG ', operator: 'other', country: 'Turkey', defaultType: 'frigate' },
    { prefix: 'INS ', operator: 'other', country: 'India', defaultType: 'destroyer' },
    { prefix: 'RFS ', operator: 'vks', country: 'Russia', defaultType: 'frigate' },
    { prefix: 'CNS ', operator: 'plan', country: 'China', defaultType: 'destroyer' },
    { prefix: 'PLAN ', operator: 'plan', country: 'China', defaultType: 'destroyer' },
    { prefix: 'PLANS ', operator: 'plan', country: 'China', defaultType: 'destroyer' },
    { prefix: 'ITS ', operator: 'other', country: 'Italy', defaultType: 'frigate' },
    { prefix: 'SPS ', operator: 'other', country: 'Spain', defaultType: 'frigate' },
  ];

  let matchedPrefix = false;
  for (const rule of prefixRules) {
    if (normalized.startsWith(rule.prefix)) {
      operator = rule.operator;
      country = rule.country;
      prefixDefaultType = rule.defaultType;
      matchedPrefix = true;
      break;
    }
  }

  // 5. Check AIS ship type
  let aisType: MilitaryVesselType | undefined;
  const numType = typeof aisShipType === 'number' ? aisShipType : Number.parseInt(String(aisShipType || ''), 10);
  if (numType === 55 || aisShipType === 'Law Enforcement') aisType = 'patrol';
  else if (numType === 51 || aisShipType === 'Search & Rescue') aisType = 'patrol';
  else if (numType === 58 || aisShipType === 'Medical Transport') aisType = 'auxiliary';

  // 6. Resolve final vesselType
  const resolvedType = hullMatch?.type || keywordType || aisType || (matchedPrefix ? prefixDefaultType : undefined);
  if (!resolvedType && !matchedPrefix && numType !== 35) {
    return undefined;
  }

  return {
    name: rawName,
    vesselType: resolvedType || 'unknown',
    hullNumber: hullMatch?.hull || (rawHull || undefined),
    operator,
    country,
  };
}

/**
 * Regions of interest for military activity monitoring
 */
// Consolidated regions to reduce API calls (max 4 queries)
// Names kept short for map cluster labels
export const MILITARY_HOTSPOTS = [
  // East Asia: Taiwan + SCS + Korea + Japan Sea (combined)
  { name: 'INDO-PACIFIC', lat: 28.0, lon: 125.0, radius: 18, priority: 'high' },
  // Middle East: Persian Gulf + Aden + Mediterranean (combined)
  { name: 'CENTCOM', lat: 28.0, lon: 42.0, radius: 15, priority: 'high' },
  // Europe: Black Sea + Baltic (combined)
  { name: 'EUCOM', lat: 52.0, lon: 28.0, radius: 15, priority: 'medium' },
  // Keep Arctic separate (large but low activity)
  { name: 'ARCTIC', lat: 75.0, lon: 0.0, radius: 10, priority: 'low' },
  // North America
  { name: 'NORTHCOM', lat: 38.0, lon: -97.0, radius: 20, priority: 'low' },
] as const;

export interface QueryRegion {
  name: string;
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

export const MILITARY_QUERY_REGIONS: QueryRegion[] = [
  { name: 'PACIFIC', lamin: 10, lamax: 46, lomin: 107, lomax: 143 },
  { name: 'WESTERN', lamin: 13, lamax: 85, lomin: -10, lomax: 57 },
  { name: 'AMERICAS', lamin: 15, lamax: 65, lomin: -130, lomax: -65 },
];

if (import.meta.env?.DEV) {
  for (const h of MILITARY_HOTSPOTS) {
    const hbox = { lamin: h.lat - h.radius, lamax: h.lat + h.radius, lomin: h.lon - h.radius, lomax: h.lon + h.radius };
    const covered = MILITARY_QUERY_REGIONS.some(r =>
      r.lamin <= hbox.lamin && r.lamax >= hbox.lamax && r.lomin <= hbox.lomin && r.lomax >= hbox.lomax
    );
    if (!covered) console.error(`[Military] HOTSPOT ${h.name} bbox not covered by any QUERY_REGION`);
  }
}

export const USNI_REGION_COORDINATES: Record<string, { lat: number; lon: number }> = {
  // Seas & Oceans
  'Philippine Sea': { lat: 18.0, lon: 130.0 },
  'South China Sea': { lat: 14.0, lon: 115.0 },
  'East China Sea': { lat: 28.0, lon: 125.0 },
  'Sea of Japan': { lat: 40.0, lon: 135.0 },
  'Arabian Sea': { lat: 18.0, lon: 63.0 },
  'Red Sea': { lat: 20.0, lon: 38.0 },
  'Mediterranean Sea': { lat: 35.0, lon: 18.0 },
  'Eastern Mediterranean': { lat: 34.5, lon: 33.0 },
  'Western Mediterranean': { lat: 37.0, lon: 3.0 },
  'Persian Gulf': { lat: 26.5, lon: 52.0 },
  'Gulf of Oman': { lat: 24.5, lon: 58.5 },
  'Gulf of Aden': { lat: 12.0, lon: 47.0 },
  'Caribbean Sea': { lat: 15.0, lon: -73.0 },
  'North Atlantic': { lat: 45.0, lon: -30.0 },
  'Atlantic Ocean': { lat: 30.0, lon: -40.0 },
  'Western Atlantic': { lat: 30.0, lon: -60.0 },
  'Pacific Ocean': { lat: 20.0, lon: -150.0 },
  'Eastern Pacific': { lat: 18.0, lon: -125.0 },
  'Western Pacific': { lat: 20.0, lon: 140.0 },
  'Indian Ocean': { lat: -5.0, lon: 75.0 },
  'Antarctic': { lat: -70.0, lon: 20.0 },
  'Baltic Sea': { lat: 58.0, lon: 20.0 },
  'Black Sea': { lat: 43.5, lon: 34.0 },
  'Bay of Bengal': { lat: 14.0, lon: 87.0 },
  'Bab el-Mandeb Strait': { lat: 12.5, lon: 43.5 },
  'Strait of Hormuz': { lat: 26.5, lon: 56.5 },
  'Taiwan Strait': { lat: 24.5, lon: 119.5 },
  'Suez Canal': { lat: 30.0, lon: 32.5 },
  // Ports & Bases
  'Yokosuka': { lat: 35.29, lon: 139.67 },
  'Japan': { lat: 35.29, lon: 139.67 },
  'Sasebo': { lat: 33.16, lon: 129.72 },
  'Guam': { lat: 13.45, lon: 144.79 },
  'Pearl Harbor': { lat: 21.35, lon: -157.95 },
  'San Diego': { lat: 32.68, lon: -117.15 },
  'Norfolk': { lat: 36.95, lon: -76.30 },
  'Mayport': { lat: 30.39, lon: -81.40 },
  'Bahrain': { lat: 26.23, lon: 50.55 },
  'Rota': { lat: 36.63, lon: -6.35 },
  'Rota Spain': { lat: 36.63, lon: -6.35 },
  'Diego Garcia': { lat: -7.32, lon: 72.42 },
  'Souda Bay': { lat: 35.49, lon: 24.08 },
  'Naples': { lat: 40.84, lon: 14.25 },
  'Bremerton': { lat: 47.57, lon: -122.63 },
  'Everett': { lat: 47.97, lon: -122.22 },
  'Kings Bay': { lat: 30.80, lon: -81.56 },
  'Bangor': { lat: 47.73, lon: -122.71 },
  'Djibouti': { lat: 11.55, lon: 43.15 },
  'Singapore': { lat: 1.35, lon: 103.82 },
};

export function normalizeUSNIRegion(regionText: string): string {
  return regionText
    .replace(/^(In the|In|The)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getUSNIRegionCoords(regionText: string): { lat: number; lon: number } | undefined {
  const normalized = normalizeUSNIRegion(regionText);
  if (USNI_REGION_COORDINATES[normalized]) return USNI_REGION_COORDINATES[normalized];
  const lower = normalized.toLowerCase();
  for (const [key, coords] of Object.entries(USNI_REGION_COORDINATES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return coords;
    }
  }
  return undefined;
}

export function getUSNIRegionApproxCoords(regionText: string): { lat: number; lon: number } {
  const direct = getUSNIRegionCoords(regionText);
  if (direct) return direct;

  const normalized = normalizeUSNIRegion(regionText).toLowerCase();
  if (normalized.includes('eastern pacific')) return { lat: 18.0, lon: -125.0 };
  if (normalized.includes('western atlantic')) return { lat: 30.0, lon: -60.0 };
  if (normalized.includes('pacific')) return { lat: 15.0, lon: -150.0 };
  if (normalized.includes('atlantic')) return { lat: 30.0, lon: -40.0 };
  if (normalized.includes('indian')) return { lat: -5.0, lon: 75.0 };
  if (normalized.includes('mediterranean')) return { lat: 35.0, lon: 18.0 };
  if (normalized.includes('antarctic') || normalized.includes('southern')) return { lat: -70.0, lon: 20.0 };
  if (normalized.includes('arctic')) return { lat: 75.0, lon: 0.0 };

  // Deterministic fallback so previously unseen regions are still rendered.
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  const lat = ((Math.abs(hash) % 120) - 60);
  const lon = ((Math.abs(hash * 31) % 300) - 150);
  return { lat, lon };
}

/**
 * Helper function to identify aircraft by callsign
 */
export function identifyByCallsign(callsign: string, originCountry?: string): CallsignPattern | undefined {
  const normalized = callsign.toUpperCase().trim();
  const origin = originCountry?.toLowerCase().trim();

  // Prefer country-specific operators to disambiguate (e.g. NAVY → USN vs RN)
  const preferred: MilitaryOperator[] = [];
  if (origin === 'united kingdom' || origin === 'uk') preferred.push('rn', 'raf');
  if (origin === 'united states' || origin === 'usa') preferred.push('usn', 'usaf', 'usa', 'usmc');

  if (preferred.length > 0) {
    for (const pattern of ALL_MILITARY_CALLSIGNS) {
      if (!preferred.includes(pattern.operator)) continue;
      if (new RegExp(pattern.pattern, 'i').test(normalized)) return pattern;
    }
  }

  for (const pattern of ALL_MILITARY_CALLSIGNS) {
    if (new RegExp(pattern.pattern, 'i').test(normalized)) return pattern;
  }

  return undefined;
}

/**
 * Helper function to identify aircraft by type code
 */
export function identifyByAircraftType(typeCode: string): { type: MilitaryAircraftType; name: string } | undefined {
  const normalized = typeCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return MILITARY_AIRCRAFT_TYPES[normalized];
}

/**
 * Helper to check if a hex code is in known military range
 */
export function isKnownMilitaryHex(hexCode: string): { operator: MilitaryOperator; country: string } | undefined {
  const hex = hexCode.toUpperCase();
  for (const range of MILITARY_HEX_RANGES) {
    if (hex >= range.start && hex <= range.end) {
      return { operator: range.operator, country: range.country };
    }
  }
  return undefined;
}

/**
 * Check if vessel is near a military hotspot
 */
export function getNearbyHotspot(lat: number, lon: number): typeof MILITARY_HOTSPOTS[number] | undefined {
  for (const hotspot of MILITARY_HOTSPOTS) {
    const distance = Math.sqrt(Math.pow(lat - hotspot.lat, 2) + Math.pow(lon - hotspot.lon, 2));
    if (distance <= hotspot.radius) {
      return hotspot;
    }
  }
  return undefined;
}

/**
 * Return RGBA color for military aircraft / vessels based on country and operator.
 * Curated, high-contrast modern colors for military assets on both dark and light map styles.
 */
export function getMilitaryCountryColor(country?: string, operator?: string): [number, number, number, number] {
  const c = country?.toLowerCase().trim() || '';
  const op = operator?.toLowerCase().trim() || '';

  // United States
  if (c.includes('united states') || c === 'usa' || c === 'us' || ['usaf', 'usn', 'usa', 'usmc', 'uscg'].includes(op)) {
    return [59, 130, 246, 230]; // Royal blue #3b82f6
  }
  // United Kingdom
  if (c.includes('united kingdom') || c === 'uk' || c === 'gb' || ['raf', 'rn'].includes(op)) {
    return [56, 189, 248, 230]; // Sky blue #38bdf8
  }
  // France
  if (c.includes('france') || op === 'faf') {
    return [37, 99, 235, 230]; // Deep blue #2563eb
  }
  // Germany
  if (c.includes('germany') || op === 'gaf') {
    return [234, 179, 8, 230]; // Gold #eab308
  }
  // Israel
  if (c.includes('israel') || op === 'iaf') {
    return [6, 182, 212, 230]; // Cyan #06b6d4
  }
  // Australia
  if (c.includes('australia')) {
    return [16, 185, 129, 230]; // Emerald #10b981
  }
  // Japan
  if (c.includes('japan')) {
    return [225, 29, 72, 230]; // Rose red #e11d48
  }
  // Canada
  if (c.includes('canada')) {
    return [239, 68, 68, 230]; // Red #ef4444
  }
  // Italy
  if (c.includes('italy')) {
    return [34, 197, 94, 230]; // Green #22c55e
  }
  // Spain
  if (c.includes('spain')) {
    return [249, 115, 22, 230]; // Orange #f97316
  }
  // Netherlands
  if (c.includes('netherlands')) {
    return [245, 158, 11, 230]; // Amber #f59e0b
  }
  // Turkey
  if (c.includes('turkey') || c.includes('türkiye')) {
    return [220, 38, 38, 230]; // Crimson #dc2626
  }
  // Gulf Allies (Saudi Arabia, UAE, Qatar, Kuwait)
  if (c.includes('saudi') || c.includes('uae') || c.includes('emirates') || c.includes('qatar') || c.includes('kuwait')) {
    return [217, 119, 6, 230]; // Sand amber #d97706
  }
  // NATO
  if (c.includes('nato') || op === 'nato') {
    return [99, 102, 241, 230]; // Indigo #6366f1
  }
  // Russia
  if (c.includes('russia') || op === 'vks') {
    return [185, 28, 28, 230]; // Dark red #b91c1c
  }
  // China
  if (c.includes('china') || op === 'plaaf' || op === 'plan') {
    return [255, 59, 48, 230]; // Scarlet red #ff3b30
  }
  // Default / Other Allied
  return [148, 163, 184, 230]; // Slate blue #94a3b8
}

export const MILITARY_COUNTRY_LEGEND = [
  { name: 'United States', color: '#3b82f6' },
  { name: 'United Kingdom', color: '#38bdf8' },
  { name: 'France', color: '#2563eb' },
  { name: 'Germany', color: '#eab308' },
  { name: 'Israel', color: '#06b6d4' },
  { name: 'Australia / Allies', color: '#10b981' },
  { name: 'China', color: '#ff3b30' },
  { name: 'Other Allied / International', color: '#94a3b8' },
];

/**
 * Known commercial airline prefixes (3-letter ICAO and common 2-letter IATA).
 * Used to positively identify commercial flights and reject them from the military activity layer.
 */
export const COMMERCIAL_AIRLINE_CODES = new Set([
  'AAL', 'DAL', 'UAL', 'SWA', 'JBU', 'FFT', 'ASA', 'NKS', 'WJA', 'ACA',
  'BAW', 'AFR', 'DLH', 'KLM', 'AUA', 'SAS', 'FIN', 'LOT', 'AZA', 'TAP', 'IBE',
  'VLG', 'RYR', 'EZY', 'WZZ', 'NOZ', 'BEL', 'AEE', 'ROT', 'SWR', 'EIN', 'TAR',
  'AIC', 'CPA', 'SIA', 'MAS', 'THA', 'VNM', 'JAL', 'ANA', 'KAL', 'AAR', 'EVA',
  'CAL', 'CCA', 'CES', 'CSN', 'HDA', 'CHH', 'CXA', 'GIA', 'PAL', 'SLK', 'CGH',
  'FDX', 'UPS', 'GTI', 'ABW', 'CLX', 'MPH', 'ATN', 'PAC',
  'SVA', 'QTR', 'THY', 'UAE', 'ETD', 'GFA', 'MEA', 'RJA', 'KAC', 'ELY', 'ELAL',
  'IAW', 'IRA', 'MSR', 'SYR', 'PGT', 'AXB', 'FDB', 'KNE', 'FAD', 'ADY', 'OMA',
  'VOZ', 'QFA', 'JST', 'ANZ',
  'TAM', 'GLO', 'AZU', 'LAN', 'LPE', 'ARE', 'AVA', 'CMP', 'AMX', 'VOI', 'VIV',
  'RAM', 'ETH', 'SAA', 'KQY',
  'AIR', 'SKY', 'JET',
]);

/**
 * Check if a callsign matches military formats/tactical patterns
 */
export function isMilitaryCallsignFormat(callsign: string | null | undefined): boolean {
  if (!callsign) return false;
  const cs = callsign.toUpperCase().trim();
  if (!cs || cs.startsWith('UNKN-')) return false;

  // If it starts with a known commercial airline code followed by digits, it's commercial
  if (/^[A-Z]{3}\d{1,4}[A-Z]?$/.test(cs)) {
    const prefix = cs.slice(0, 3);
    if (COMMERCIAL_AIRLINE_CODES.has(prefix)) return false;
  }
  if (/^[A-Z]{2}\d{1,4}[A-Z]?$/.test(cs)) {
    return false; // Standard 2-letter IATA flight number (e.g. DL123, AA456)
  }

  // Check known military callsign patterns (from config)
  if (identifyByCallsign(cs)) return true;

  // Specific military tactical prefixes
  const militaryPrefixes = [
    'RCH', 'REACH', 'MOOSE', 'EVAC', 'DUSTOFF', 'PEDRO',
    'DUKE', 'HAVOC', 'KNIFE', 'WARHAWK', 'VIPER', 'RAGE', 'FURY',
    'SHELL', 'TEXACO', 'ARCO', 'ESSO', 'PETRO',
    'SENTRY', 'AWACS', 'MAGIC', 'DISCO', 'DARKSTAR',
    'COBRA', 'PYTHON', 'RAPTOR', 'EAGLE', 'HAWK', 'TALON',
    'BOXER', 'OMNI', 'TOPCAT', 'SKULL', 'REAPER', 'HUNTER',
    'ARMY', 'NAVY', 'USAF', 'USMC', 'USCG',
    'AE', 'CNV', 'PAT', 'SAM', 'EXEC',
    'NATO', 'GAF', 'RRF', 'RAF', 'FAF', 'IAF', 'RNLAF', 'BAF', 'DAF', 'HAF', 'PAF',
    'RSAF', 'EMIRI', 'UAEAF', 'KAF', 'QAF', 'BAHAF', 'OMAAF',
    'IRIAF', 'IRG', 'IRGC', 'TAF', 'TUAF', 'RSD', 'RF', 'RFF', 'VKS',
    'CHN', 'PLAAF', 'PLAN', 'CANFORCE', 'CFC', 'ASCOT', 'TARTAN', 'FORTE', 'TRIDENT',
    'BONE', 'DEATH', 'DOOM', 'HERKY', 'JASDF', 'ROKAF', 'RAAF', 'AUSSIE',
  ];

  for (const prefix of militaryPrefixes) {
    if (cs.startsWith(prefix)) return true;
  }

  // Tactical military callsign format (e.g. 4+ letters followed by 1-3 digits: VIPER1, GHOST99)
  if (/^[A-Z]{4,}\d{1,3}$/.test(cs)) return true;

  return false;
}

/**
 * Check if a vessel name matches military formats / naval conventions
 */
export function isMilitaryVesselNameFormat(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toUpperCase().trim();
  if (!n || n.startsWith('VESSEL ')) return false;

  const hasNavalPrefix = /^(?:USS|USNS|USCGC|HMS|HMCS|HMAS|FGS|FS|TCG|ROKS|JS|INS|RFS|CNS|PLAN|PLANS|ITS|SPS|CCGS|RFA)\s+/i.test(n);
  if (!hasNavalPrefix) {
    const commercialKeywords = [
      /\b(?:CARGO|CONTAINER|BULKER|BULK|TANKER|FEEDER|EXPRESS|FREIGHTER|BARGE|TUG|TUGBOAT|TRAWLER|FISHER|FISHING|FERRY|CRUISE|YACHT|PILOT|DREDGER|DREDGING)\b/,
      /\b(?:MAERSK|MSC\b|CMA\s+CGM|COSCO|EVERGREEN|HAPAG|OOCL|WAN\s+HAI|YANG\s+MING|ZIM\b)/,
      /\b(?:YU|HUO|HAI)\s*\d+/,
      /\b(?:F\/V|M\/V|M\/T|S\/V)\b/,
    ];
    if (commercialKeywords.some(pattern => pattern.test(n))) return false;
  }

  // Recognized naval ship prefixes
  const navalPrefixes = [
    'USS ', 'USNS ', 'USCGC ', 'CCGS ', 'RFA ', 'HMS ', 'HMCS ', 'HMAS ', 'FGS ', 'FS ', 'ROKS ',
    'JS ', 'TCG ', 'INS ', 'RFS ', 'CNS ', 'PLAN ', 'PLANS ', 'BNS ',
    'PNS ', 'KDM ', 'HNLMS ', 'NRP ', 'ITS ', 'SPS ', 'KD ', 'RSS ',
  ];

  for (const prefix of navalPrefixes) {
    if (n.startsWith(prefix)) return true;
  }

  // Naval hull designations (e.g., CVN-78, DDG-51, FFG-62, LCS-2, SSN-774, LHD-1, LPD-17, CG-47, MCM-1)
  if (/\b(?:CVN|CV|DDG|DD|FFG|FF|LHD|LHA|LPD|LSD|LCS|SSN|SSBN|SSGN|CG|MCM|PC|AOR|AOE|T-AO|T-AKE|T-EPF)[-\s]?\d+/i.test(n)) {
    return true;
  }

  // Check if classified as a naval vessel
  if (classifyNavalVessel(n)) {
    return true;
  }

  // Match known naval vessel names
  for (const vessel of KNOWN_NAVAL_VESSELS) {
    const vName = vessel.name.toUpperCase();
    if (n === vName || n.startsWith(vName) || n.includes(vName)) {
      return true;
    }
    if (vessel.hullNumber && n.includes(vessel.hullNumber.toUpperCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Filter out aircraft with the type listed as Unknown that also have callsigns
 * that don't match military formats, and are not known military.
 */
export function shouldFilterOutAircraft(flight: {
  aircraftType?: string;
  callsign?: string;
  hexCode?: string;
  enrichment?: { confirmedMilitary?: boolean };
  operator?: string;
}): boolean {
  const type = (flight.aircraftType || '').toLowerCase().trim();
  const isTypeUnknown = !type || type === 'unknown' || type === 'military_aircraft_type_unknown';

  if (!isTypeUnknown) {
    return false; // Known military type (fighter, bomber, transport, tanker, awacs, drone, etc.)
  }

  // If callsign matches commercial airline patterns, reject unless explicitly confirmed military
  const cs = (flight.callsign || '').toUpperCase().trim();
  if (cs) {
    const prefix3 = cs.slice(0, 3);
    const prefix4 = cs.slice(0, 4);
    if (COMMERCIAL_AIRLINE_CODES.has(prefix3) || COMMERCIAL_AIRLINE_CODES.has(prefix4)) {
      if (!flight.enrichment?.confirmedMilitary) {
        return true;
      }
    }
    // Reject standard IATA 2-letter airline flight numbers (e.g., AA123, DL456)
    if (/^[A-Z]{2}\d{1,4}[A-Z]?$/.test(cs) && !flight.enrichment?.confirmedMilitary) {
      return true;
    }
  }

  const isConfirmedMil = Boolean(
    flight.enrichment?.confirmedMilitary ||
    (flight.hexCode && isKnownMilitaryHex(flight.hexCode)) ||
    (flight.operator && flight.operator !== 'other' && flight.operator !== 'MILITARY_OPERATOR_OTHER')
  );

  if (isConfirmedMil) {
    return false;
  }

  const matchesMilCallsign = isMilitaryCallsignFormat(flight.callsign);
  if (matchesMilCallsign) {
    return false;
  }

  return true;
}

/**
 * Filter out ships with the type listed as Unknown that also have names
 * that don't match military formats, and are not known military.
 */
export function shouldFilterOutShip(vessel: {
  name?: string;
  vesselType?: string;
  aisShipType?: string;
  shipType?: number | string;
  operator?: string;
}): boolean {
  const type = (vessel.vesselType || '').toLowerCase().trim();
  const isTypeUnknown = !type || type === 'unknown' || type === 'military_vessel_type_unknown';

  if (!isTypeUnknown) {
    return false; // Known naval type (carrier, destroyer, submarine, patrol, frigate, cruiser, amphibious, auxiliary)
  }

  const isConfirmedMil = Boolean(
    vessel.aisShipType === 'Military Ops' ||
    vessel.aisShipType === 'Law Enforcement' ||
    vessel.shipType === 35 ||
    vessel.shipType === 55 ||
    vessel.shipType === '35' ||
    vessel.shipType === '55' ||
    (vessel.operator && vessel.operator !== 'other' && vessel.operator !== 'MILITARY_OPERATOR_OTHER')
  );

  if (isConfirmedMil) {
    return false;
  }

  const matchesMilName = isMilitaryVesselNameFormat(vessel.name);
  if (matchesMilName) {
    return false;
  }

  return true;
}
