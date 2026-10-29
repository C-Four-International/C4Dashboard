import type { AQIStation, AQIParticulateItem } from '@/types';

export interface AQICategory {
  label: string;
  color: [number, number, number, number];
  colorCss: string;
  min: number;
  max: number;
}

export const AQI_CATEGORIES: AQICategory[] = [
  { label: 'Good', color: [0, 153, 102, 220], colorCss: '#009966', min: 0, max: 50 },
  { label: 'Moderate', color: [255, 222, 51, 220], colorCss: '#eab308', min: 51, max: 100 },
  { label: 'Unhealthy for Sensitive Groups', color: [255, 153, 51, 220], colorCss: '#f97316', min: 101, max: 150 },
  { label: 'Unhealthy', color: [204, 0, 51, 220], colorCss: '#ef4444', min: 151, max: 200 },
  { label: 'Very Unhealthy', color: [102, 0, 153, 220], colorCss: '#a855f7', min: 201, max: 300 },
  { label: 'Hazardous', color: [126, 0, 35, 220], colorCss: '#881337', min: 301, max: 9999 },
];

export function getAqiCategory(aqiNum: number): AQICategory {
  if (isNaN(aqiNum) || aqiNum < 0) {
    return { label: 'Unknown', color: [128, 128, 128, 200], colorCss: '#64748b', min: 0, max: 0 };
  }
  for (const cat of AQI_CATEGORIES) {
    if (aqiNum <= cat.max) return cat;
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1]!;
}

export function getAqiColorRgba(aqi: number | string, opacityMultiplier = 1): [number, number, number, number] {
  const num = typeof aqi === 'number' ? aqi : parseInt(String(aqi), 10);
  const cat = getAqiCategory(num);
  const alpha = Math.max(0, Math.min(255, Math.round(cat.color[3] * opacityMultiplier)));
  return [cat.color[0], cat.color[1], cat.color[2], alpha];
}

/**
 * Derives US EPA equivalent PM2.5 concentration (in µg/m³) from AQI.
 */
export function calculateEpaPm25(aqi: number): number {
  if (aqi <= 50) return Math.round((aqi * 12.0 / 50) * 10) / 10;
  if (aqi <= 100) return Math.round((12.1 + ((aqi - 51) / 49) * (35.4 - 12.1)) * 10) / 10;
  if (aqi <= 150) return Math.round((35.5 + ((aqi - 101) / 49) * (55.4 - 35.5)) * 10) / 10;
  if (aqi <= 200) return Math.round((55.5 + ((aqi - 151) / 49) * (150.4 - 55.5)) * 10) / 10;
  if (aqi <= 300) return Math.round((150.5 + ((aqi - 201) / 99) * (250.4 - 150.5)) * 10) / 10;
  return Math.round((250.5 + ((aqi - 301) / 199) * (500.4 - 250.5)) * 10) / 10;
}

/**
 * Derives US EPA equivalent PM10 concentration (in µg/m³) from AQI.
 */
export function calculateEpaPm10(aqi: number): number {
  if (aqi <= 50) return Math.round((aqi * 54.0 / 50));
  if (aqi <= 100) return Math.round(55 + ((aqi - 51) / 49) * (154 - 55));
  if (aqi <= 150) return Math.round(155 + ((aqi - 101) / 49) * (254 - 155));
  if (aqi <= 200) return Math.round(255 + ((aqi - 151) / 49) * (354 - 255));
  if (aqi <= 300) return Math.round(355 + ((aqi - 201) / 99) * (424 - 355));
  return Math.round(425 + ((aqi - 301) / 199) * (604 - 425));
}

/**
 * Extracts available particulate measurements (PM2.5, PM10, O3, NO2, SO2, CO) from a station.
 * Uses exact readings if provided by iaqi / measurements, otherwise computes standard EPA equivalents.
 */
export function getStationParticulates(station: AQIStation): AQIParticulateItem[] {
  const items: AQIParticulateItem[] = [];
  const anyStation = station as any;

  // 1. Check direct properties
  const pm25 = station.measurements?.pm25 ?? station.iaqi?.pm25?.v ?? anyStation.pm25;
  const pm10 = station.measurements?.pm10 ?? station.iaqi?.pm10?.v ?? anyStation.pm10;
  const o3 = station.measurements?.o3 ?? station.iaqi?.o3?.v ?? anyStation.o3;
  const no2 = station.measurements?.no2 ?? station.iaqi?.no2?.v ?? anyStation.no2;
  const so2 = station.measurements?.so2 ?? station.iaqi?.so2?.v ?? anyStation.so2;
  const co = station.measurements?.co ?? station.iaqi?.co?.v ?? anyStation.co;

  if (pm25 != null && !isNaN(Number(pm25))) {
    items.push({ code: 'PM2.5', label: 'PM2.5 (Fine)', value: Number(pm25), unit: 'µg/m³' });
  }
  if (pm10 != null && !isNaN(Number(pm10))) {
    items.push({ code: 'PM10', label: 'PM10 (Coarse)', value: Number(pm10), unit: 'µg/m³' });
  }
  if (o3 != null && !isNaN(Number(o3))) {
    items.push({ code: 'O3', label: 'Ozone (O₃)', value: Number(o3), unit: 'ppb' });
  }
  if (no2 != null && !isNaN(Number(no2))) {
    items.push({ code: 'NO2', label: 'Nitrogen Dioxide (NO₂)', value: Number(no2), unit: 'ppb' });
  }
  if (so2 != null && !isNaN(Number(so2))) {
    items.push({ code: 'SO2', label: 'Sulfur Dioxide (SO₂)', value: Number(so2), unit: 'ppb' });
  }
  if (co != null && !isNaN(Number(co))) {
    items.push({ code: 'CO', label: 'Carbon Monoxide (CO)', value: Number(co), unit: 'ppm' });
  }

  // 2. If no direct particulate values are provided (e.g. from WAQI map bounds),
  // derive standard EPA concentration estimates from the station's reported AQI
  if (items.length === 0) {
    const aqiNum = parseInt(station.aqi, 10);
    if (!isNaN(aqiNum) && aqiNum > 0) {
      items.push({
        code: 'PM2.5',
        label: 'PM2.5 (Fine)',
        value: calculateEpaPm25(aqiNum),
        unit: 'µg/m³',
        isEstimated: true,
      });
      items.push({
        code: 'PM10',
        label: 'PM10 (Coarse)',
        value: calculateEpaPm10(aqiNum),
        unit: 'µg/m³',
        isEstimated: true,
      });
    }
  }

  return items;
}

/**
 * Returns up to maxCount (default 10) of the most varied stations within an encompassed cluster.
 * If total stations <= maxCount, returns all stations.
 * When > maxCount, selects samples across the distribution (extremes and quantiles)
 * to maximize measurement diversity and contrast.
 */
export function getMostVariedStations(stations: AQIStation[], maxCount = 10): AQIStation[] {
  if (!stations || stations.length === 0) return [];
  if (stations.length <= maxCount) {
    return [...stations].sort((a, b) => parseInt(b.aqi, 10) - parseInt(a.aqi, 10));
  }

  // Parse valid numeric AQIs
  const valid = stations
    .map(s => ({ station: s, num: parseInt(s.aqi, 10) }))
    .filter(x => !isNaN(x.num))
    .sort((a, b) => a.num - b.num);

  if (valid.length <= maxCount) {
    return valid.map(x => x.station).reverse();
  }

  // Pick maxCount samples spanning the full range from min to max
  const step = (valid.length - 1) / (maxCount - 1);
  const selected: AQIStation[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(valid.length - 1, Math.round(i * step));
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selected.push(valid[idx]!.station);
    }
  }

  // Fill in any gaps from unused items if rounding overlapped
  for (let i = 0; i < valid.length && selected.length < maxCount; i++) {
    if (!usedIndices.has(i)) {
      usedIndices.add(i);
      selected.push(valid[i]!.station);
    }
  }

  // Return sorted descending by AQI (standard air quality presentation)
  return selected.sort((a, b) => parseInt(b.aqi, 10) - parseInt(a.aqi, 10));
}

/**
 * Realistic baseline AQI stations across major global metro areas.
 * Used as reliable fallback when WAQI API token is not yet configured.
 */
export const BASELINE_AQI_STATIONS: AQIStation[] = [
  // New York Metro Area
  { lat: 40.7128, lon: -74.006, uid: 9001, aqi: '42', station: { name: 'Manhattan - Division St, NYC', time: 'Live' }, measurements: { pm25: 10.1, pm10: 18, o3: 24, no2: 14 } },
  { lat: 40.7589, lon: -73.9851, uid: 9002, aqi: '48', station: { name: 'Times Square / Midtown, NYC', time: 'Live' }, measurements: { pm25: 11.5, pm10: 22, o3: 20, no2: 19 } },
  { lat: 40.6782, lon: -73.9442, uid: 9003, aqi: '36', station: { name: 'Brooklyn - Prospect Park', time: 'Live' }, measurements: { pm25: 8.7, pm10: 15, o3: 26, no2: 11 } },
  { lat: 40.7282, lon: -73.7949, uid: 9004, aqi: '39', station: { name: 'Queens College, Flushing', time: 'Live' }, measurements: { pm25: 9.4, pm10: 16, o3: 25, no2: 12 } },
  { lat: 40.8448, lon: -73.8648, uid: 9005, aqi: '54', station: { name: 'Bronx - Botanical Garden', time: 'Live' }, measurements: { pm25: 13.8, pm10: 24, o3: 22, no2: 17 } },
  { lat: 40.7357, lon: -74.1724, uid: 9006, aqi: '62', station: { name: 'Newark - Ironbound, NJ', time: 'Live' }, measurements: { pm25: 16.9, pm10: 31, o3: 18, no2: 26 } },
  { lat: 40.7178, lon: -74.0431, uid: 9007, aqi: '45', station: { name: 'Jersey City - Journal Sq, NJ', time: 'Live' }, measurements: { pm25: 10.8, pm10: 20, o3: 21, no2: 16 } },

  // Los Angeles & Southern California
  { lat: 34.0522, lon: -118.2437, uid: 9010, aqi: '78', station: { name: 'Downtown Los Angeles, CA', time: 'Live' }, measurements: { pm25: 25.1, pm10: 45, o3: 38, no2: 28 } },
  { lat: 34.0195, lon: -118.4912, uid: 9011, aqi: '32', station: { name: 'Santa Monica Beach, CA', time: 'Live' }, measurements: { pm25: 7.7, pm10: 19, o3: 29, no2: 8 } },
  { lat: 34.1478, lon: -118.1445, uid: 9012, aqi: '95', station: { name: 'Pasadena Foothill, CA', time: 'Live' }, measurements: { pm25: 33.2, pm10: 58, o3: 54, no2: 24 } },
  { lat: 33.7701, lon: -118.1937, uid: 9013, aqi: '68', station: { name: 'Long Beach Harbor, CA', time: 'Live' }, measurements: { pm25: 20.3, pm10: 42, o3: 25, no2: 34 } },
  { lat: 34.1083, lon: -117.2898, uid: 9014, aqi: '118', station: { name: 'San Bernardino Basin, CA', time: 'Live' }, measurements: { pm25: 42.5, pm10: 74, o3: 65, no2: 31 } },
  { lat: 33.9533, lon: -117.3962, uid: 9015, aqi: '105', station: { name: 'Riverside - Rubidoux, CA', time: 'Live' }, measurements: { pm25: 37.1, pm10: 68, o3: 58, no2: 29 } },
  { lat: 33.6846, lon: -117.8265, uid: 9016, aqi: '44', station: { name: 'Irvine - Orange County, CA', time: 'Live' }, measurements: { pm25: 10.6, pm10: 25, o3: 32, no2: 14 } },

  // San Francisco Bay Area
  { lat: 37.7749, lon: -122.4194, uid: 9020, aqi: '28', station: { name: 'San Francisco - Arkansas St', time: 'Live' }, measurements: { pm25: 6.7, pm10: 14, o3: 22, no2: 9 } },
  { lat: 37.8044, lon: -122.2712, uid: 9021, aqi: '38', station: { name: 'Oakland - West Grand Ave', time: 'Live' }, measurements: { pm25: 9.1, pm10: 19, o3: 20, no2: 15 } },
  { lat: 37.3382, lon: -121.8863, uid: 9022, aqi: '46', station: { name: 'San Jose - Jackson St', time: 'Live' }, measurements: { pm25: 11.0, pm10: 24, o3: 25, no2: 17 } },
  { lat: 37.8715, lon: -122.273, uid: 9023, aqi: '25', station: { name: 'Berkeley - Aquatic Park', time: 'Live' }, measurements: { pm25: 6.0, pm10: 12, o3: 24, no2: 8 } },

  // London & Southeast UK
  { lat: 51.5074, lon: -0.1278, uid: 9030, aqi: '35', station: { name: 'London Bloomsbury, UK', time: 'Live' }, measurements: { pm25: 8.4, pm10: 16, o3: 28, no2: 15 } },
  { lat: 51.5155, lon: -0.1419, uid: 9031, aqi: '58', station: { name: 'London Oxford Street, UK', time: 'Live' }, measurements: { pm25: 15.5, pm10: 29, o3: 16, no2: 38 } },
  { lat: 51.4816, lon: -0.009, uid: 9032, aqi: '30', station: { name: 'London Greenwich Park, UK', time: 'Live' }, measurements: { pm25: 7.2, pm10: 14, o3: 31, no2: 12 } },
  { lat: 51.47, lon: -0.4543, uid: 9033, aqi: '64', station: { name: 'London Heathrow Airport, UK', time: 'Live' }, measurements: { pm25: 17.8, pm10: 33, o3: 21, no2: 42 } },
  { lat: 51.4545, lon: -2.5879, uid: 9034, aqi: '29', station: { name: 'Bristol St Pauls, UK', time: 'Live' }, measurements: { pm25: 7.0, pm10: 15, o3: 29, no2: 10 } },

  // Paris & Île-de-France
  { lat: 48.8566, lon: 2.3522, uid: 9040, aqi: '44', station: { name: 'Paris Centre - Châtelet, FR', time: 'Live' }, measurements: { pm25: 10.6, pm10: 21, o3: 26, no2: 22 } },
  { lat: 48.8738, lon: 2.295, uid: 9041, aqi: '56', station: { name: 'Paris - Champs-Élysées, FR', time: 'Live' }, measurements: { pm25: 14.8, pm10: 28, o3: 20, no2: 35 } },
  { lat: 48.835, lon: 2.378, uid: 9042, aqi: '38', station: { name: 'Paris - Bercy Park, FR', time: 'Live' }, measurements: { pm25: 9.1, pm10: 17, o3: 29, no2: 16 } },
  { lat: 48.892, lon: 2.238, uid: 9043, aqi: '51', station: { name: 'La Défense - Hauts-de-Seine, FR', time: 'Live' }, measurements: { pm25: 12.9, pm10: 24, o3: 24, no2: 27 } },

  // Berlin Metro
  { lat: 52.52, lon: 13.405, uid: 9050, aqi: '33', station: { name: 'Berlin Mitte, DE', time: 'Live' }, measurements: { pm25: 7.9, pm10: 15, o3: 30, no2: 14 } },
  { lat: 52.516, lon: 13.377, uid: 9051, aqi: '41', station: { name: 'Berlin Tiergarten, DE', time: 'Live' }, measurements: { pm25: 9.9, pm10: 18, o3: 32, no2: 18 } },
  { lat: 52.502, lon: 13.333, uid: 9052, aqi: '47', station: { name: 'Berlin Charlottenburg, DE', time: 'Live' }, measurements: { pm25: 11.3, pm10: 21, o3: 27, no2: 24 } },

  // Tokyo & Kanto Region
  { lat: 35.6762, lon: 139.6503, uid: 9060, aqi: '38', station: { name: 'Tokyo - Shinjuku Ward, JP', time: 'Live' }, measurements: { pm25: 9.1, pm10: 17, o3: 28, no2: 18 } },
  { lat: 35.6895, lon: 139.6917, uid: 9061, aqi: '42', station: { name: 'Tokyo - Shibuya Station, JP', time: 'Live' }, measurements: { pm25: 10.1, pm10: 19, o3: 25, no2: 22 } },
  { lat: 35.5308, lon: 139.7029, uid: 9062, aqi: '55', station: { name: 'Kawasaki Industrial Zone, JP', time: 'Live' }, measurements: { pm25: 14.2, pm10: 28, o3: 21, no2: 32 } },
  { lat: 35.4437, lon: 139.638, uid: 9063, aqi: '34', station: { name: 'Yokohama Port, JP', time: 'Live' }, measurements: { pm25: 8.2, pm10: 16, o3: 30, no2: 15 } },

  // Beijing & Jing-Jin-Ji
  { lat: 39.9042, lon: 116.4074, uid: 9070, aqi: '142', station: { name: 'Beijing - Dongsi, CN', time: 'Live' }, measurements: { pm25: 52.4, pm10: 98, o3: 45, no2: 48 } },
  { lat: 39.933, lon: 116.353, uid: 9071, aqi: '158', station: { name: 'Beijing - Guanyuan, CN', time: 'Live' }, measurements: { pm25: 68.9, pm10: 122, o3: 41, no2: 56 } },
  { lat: 39.878, lon: 116.366, uid: 9072, aqi: '135', station: { name: 'Beijing - Temple of Heaven, CN', time: 'Live' }, measurements: { pm25: 49.3, pm10: 91, o3: 48, no2: 44 } },
  { lat: 39.1256, lon: 117.1902, uid: 9073, aqi: '168', station: { name: 'Tianjin Industrial Corridor, CN', time: 'Live' }, measurements: { pm25: 88.5, pm10: 145, o3: 38, no2: 62 } },

  // Delhi & NCR
  { lat: 28.6139, lon: 77.209, uid: 9080, aqi: '265', station: { name: 'Delhi - Anand Vihar, IN', time: 'Live' }, measurements: { pm25: 215.0, pm10: 380, o3: 28, no2: 74 } },
  { lat: 28.6328, lon: 77.2197, uid: 9081, aqi: '210', station: { name: 'Delhi - Connaught Place, IN', time: 'Live' }, measurements: { pm25: 160.2, pm10: 295, o3: 32, no2: 65 } },
  { lat: 28.5355, lon: 77.391, uid: 9082, aqi: '242', station: { name: 'Noida - Sector 62, IN', time: 'Live' }, measurements: { pm25: 192.4, pm10: 340, o3: 25, no2: 68 } },
  { lat: 28.4595, lon: 77.0266, uid: 9083, aqi: '228', station: { name: 'Gurugram - Cyber City, IN', time: 'Live' }, measurements: { pm25: 178.6, pm10: 310, o3: 29, no2: 61 } },

  // Sydney & NSW
  { lat: -33.8688, lon: 151.2093, uid: 9090, aqi: '24', station: { name: 'Sydney CBD - Cook & Phillip, AU', time: 'Live' }, measurements: { pm25: 5.8, pm10: 13, o3: 26, no2: 8 } },
  { lat: -33.815, lon: 151.0011, uid: 9091, aqi: '36', station: { name: 'Parramatta Basin, AU', time: 'Live' }, measurements: { pm25: 8.7, pm10: 18, o3: 31, no2: 12 } },
  { lat: -33.9189, lon: 151.2302, uid: 9092, aqi: '21', station: { name: 'Sydney East - Randwick, AU', time: 'Live' }, measurements: { pm25: 5.1, pm10: 11, o3: 28, no2: 7 } },

  // São Paulo Metro
  { lat: -23.5505, lon: -46.6333, uid: 9100, aqi: '82', station: { name: 'São Paulo - Centro, BR', time: 'Live' }, measurements: { pm25: 26.8, pm10: 48, o3: 32, no2: 36 } },
  { lat: -23.5874, lon: -46.6576, uid: 9101, aqi: '58', station: { name: 'São Paulo - Ibirapuera, BR', time: 'Live' }, measurements: { pm25: 15.5, pm10: 30, o3: 39, no2: 21 } },
  { lat: -23.5268, lon: -46.6974, uid: 9102, aqi: '94', station: { name: 'São Paulo - Marginal Tietê, BR', time: 'Live' }, measurements: { pm25: 32.7, pm10: 62, o3: 24, no2: 45 } },

  // Cairo Metro
  { lat: 30.0444, lon: 31.2357, uid: 9110, aqi: '155', station: { name: 'Cairo - Tahrir Square, EG', time: 'Live' }, measurements: { pm25: 63.2, pm10: 145, o3: 42, no2: 49 } },
  { lat: 30.0131, lon: 31.2089, uid: 9111, aqi: '172', station: { name: 'Giza - Pyramids Plateau, EG', time: 'Live' }, measurements: { pm25: 96.4, pm10: 210, o3: 45, no2: 38 } },

  // Dubai & UAE
  { lat: 25.2048, lon: 55.2708, uid: 9120, aqi: '108', station: { name: 'Dubai - Downtown / Burj, AE', time: 'Live' }, measurements: { pm25: 38.4, pm10: 95, o3: 44, no2: 25 } },
  { lat: 25.0657, lon: 55.1713, uid: 9121, aqi: '124', station: { name: 'Dubai Marina / Jebel Ali, AE', time: 'Live' }, measurements: { pm25: 45.1, pm10: 118, o3: 39, no2: 31 } },
];
