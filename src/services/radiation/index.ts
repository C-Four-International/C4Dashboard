import { createCircuitBreaker } from '@/utils/circuit-breaker';

export interface RadiationStation {
  id: string;
  name: string;
  city: string;
  state?: string;
  country: string;
  lat: number;
  lon: number;
  cpm: number; // Standard Geiger-Müller (Safecast-equivalent) CPM
  rawCpm?: number; // Raw sensor counts (e.g. EPA RadNet NaI scintillator counts)
  doseRate?: number; // Ambient dose equivalent rate in nSv/h
  unit: string;
  status: 'normal' | 'elevated' | 'high';
  time: string;
  source: string;
  detectorType?: string;
}

export const BASELINE_RADIATION_STATIONS: RadiationStation[] = [
  // US Major Cities (EPA RadNet - Normalized to standard Geiger-Müller CPM, preserving raw NaI scintillator counts)
  { id: 'radnet-dc-washington', name: 'Washington, DC', city: 'Washington', state: 'DC', country: 'United States', lat: 38.9072, lon: -77.0369, cpm: 9, rawCpm: 887, doseRate: 27, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ma-boston', name: 'Boston, MA', city: 'Boston', state: 'MA', country: 'United States', lat: 42.3601, lon: -71.0589, cpm: 21, rawCpm: 2322, doseRate: 63, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ny-albany', name: 'Albany, NY', city: 'Albany', state: 'NY', country: 'United States', lat: 42.6526, lon: -73.7562, cpm: 16, rawCpm: 1315, doseRate: 47, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ny-buffalo', name: 'Buffalo, NY', city: 'Buffalo', state: 'NY', country: 'United States', lat: 42.8864, lon: -78.8784, cpm: 15, rawCpm: 1579, doseRate: 44, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ny-rochester', name: 'Rochester, NY', city: 'Rochester', state: 'NY', country: 'United States', lat: 43.1566, lon: -77.6088, cpm: 21, rawCpm: 2145, doseRate: 62, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ny-syracuse', name: 'Syracuse, NY', city: 'Syracuse', state: 'NY', country: 'United States', lat: 43.0481, lon: -76.1474, cpm: 13, rawCpm: 1203, doseRate: 39, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-pa-philadelphia', name: 'Philadelphia, PA', city: 'Philadelphia', state: 'PA', country: 'United States', lat: 39.9526, lon: -75.1652, cpm: 14, rawCpm: 1529, doseRate: 42, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-pa-pittsburgh', name: 'Pittsburgh, PA', city: 'Pittsburgh', state: 'PA', country: 'United States', lat: 40.4406, lon: -79.9959, cpm: 21, rawCpm: 2124, doseRate: 62, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ct-hartford', name: 'Hartford, CT', city: 'Hartford', state: 'CT', country: 'United States', lat: 41.7658, lon: -72.6734, cpm: 18, rawCpm: 2339, doseRate: 55, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ri-providence', name: 'Providence, RI', city: 'Providence', state: 'RI', country: 'United States', lat: 41.8240, lon: -71.4128, cpm: 19, rawCpm: 2481, doseRate: 58, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-md-baltimore', name: 'Baltimore, MD', city: 'Baltimore', state: 'MD', country: 'United States', lat: 39.2904, lon: -76.6122, cpm: 11, rawCpm: 1042, doseRate: 32, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ga-atlanta', name: 'Atlanta, GA', city: 'Atlanta', state: 'GA', country: 'United States', lat: 33.7490, lon: -84.3880, cpm: 24, rawCpm: 2781, doseRate: 71, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-fl-miami', name: 'Miami, FL', city: 'Miami', state: 'FL', country: 'United States', lat: 25.7617, lon: -80.1918, cpm: 16, rawCpm: 1479, doseRate: 49, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-fl-orlando', name: 'Orlando, FL', city: 'Orlando', state: 'FL', country: 'United States', lat: 28.5383, lon: -81.3792, cpm: 10, rawCpm: 990, doseRate: 29, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-fl-tampa', name: 'Tampa, FL', city: 'Tampa', state: 'FL', country: 'United States', lat: 27.9506, lon: -82.4572, cpm: 10, rawCpm: 923, doseRate: 31, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-fl-jacksonville', name: 'Jacksonville, FL', city: 'Jacksonville', state: 'FL', country: 'United States', lat: 30.3322, lon: -81.6557, cpm: 12, rawCpm: 1127, doseRate: 35, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-nc-charlotte', name: 'Charlotte, NC', city: 'Charlotte', state: 'NC', country: 'United States', lat: 35.2271, lon: -80.8431, cpm: 12, rawCpm: 940, doseRate: 37, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-nc-raleigh', name: 'Raleigh, NC', city: 'Raleigh', state: 'NC', country: 'United States', lat: 35.7796, lon: -78.6382, cpm: 33, rawCpm: 3855, doseRate: 98, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tn-memphis', name: 'Memphis, TN', city: 'Memphis', state: 'TN', country: 'United States', lat: 35.1495, lon: -90.0490, cpm: 20, rawCpm: 2343, doseRate: 60, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tn-knoxville', name: 'Knoxville, TN', city: 'Knoxville', state: 'TN', country: 'United States', lat: 35.9606, lon: -83.9207, cpm: 16, rawCpm: 1649, doseRate: 49, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tn-nashville', name: 'Nashville, TN', city: 'Nashville', state: 'TN', country: 'United States', lat: 36.1627, lon: -86.7816, cpm: 21, rawCpm: 983, doseRate: 62, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-la-batonrouge', name: 'Baton Rouge, LA', city: 'Baton Rouge', state: 'LA', country: 'United States', lat: 30.4515, lon: -91.1871, cpm: 14, rawCpm: 1514, doseRate: 43, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-il-chicago', name: 'Chicago, IL', city: 'Chicago', state: 'IL', country: 'United States', lat: 41.8781, lon: -87.6298, cpm: 13, rawCpm: 1154, doseRate: 40, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-mi-detroit', name: 'Detroit, MI', city: 'Detroit', state: 'MI', country: 'United States', lat: 42.3314, lon: -83.0458, cpm: 17, rawCpm: 1637, doseRate: 50, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-in-indianapolis', name: 'Indianapolis, IN', city: 'Indianapolis', state: 'IN', country: 'United States', lat: 39.7684, lon: -86.1581, cpm: 16, rawCpm: 1792, doseRate: 47, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-oh-columbus', name: 'Columbus, OH', city: 'Columbus', state: 'OH', country: 'United States', lat: 39.9612, lon: -82.9988, cpm: 15, rawCpm: 1776, doseRate: 45, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-oh-cleveland', name: 'Cleveland, OH', city: 'Cleveland', state: 'OH', country: 'United States', lat: 41.4993, lon: -81.6944, cpm: 13, rawCpm: 1388, doseRate: 40, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-oh-cincinnati', name: 'Cincinnati, OH', city: 'Cincinnati', state: 'OH', country: 'United States', lat: 39.1031, lon: -84.5120, cpm: 14, rawCpm: 1393, doseRate: 43, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-wi-milwaukee', name: 'Milwaukee, WI', city: 'Milwaukee', state: 'WI', country: 'United States', lat: 43.0389, lon: -87.9065, cpm: 14, rawCpm: 1236, doseRate: 43, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-wi-madison', name: 'Madison, WI', city: 'Madison', state: 'WI', country: 'United States', lat: 43.0731, lon: -89.4012, cpm: 17, rawCpm: 1519, doseRate: 50, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-mn-stpaul', name: 'St. Paul, MN', city: 'St. Paul', state: 'MN', country: 'United States', lat: 44.9537, lon: -93.0900, cpm: 18, rawCpm: 2064, doseRate: 54, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-mn-duluth', name: 'Duluth, MN', city: 'Duluth', state: 'MN', country: 'United States', lat: 46.7867, lon: -92.1005, cpm: 20, rawCpm: 2196, doseRate: 59, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-mo-stlouis', name: 'St. Louis, MO', city: 'St. Louis', state: 'MO', country: 'United States', lat: 38.6270, lon: -90.1994, cpm: 14, rawCpm: 1326, doseRate: 43, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ia-desmoines', name: 'Des Moines, IA', city: 'Des Moines', state: 'IA', country: 'United States', lat: 41.5868, lon: -93.6250, cpm: 16, rawCpm: 1727, doseRate: 49, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ne-omaha', name: 'Omaha, NE', city: 'Omaha', state: 'NE', country: 'United States', lat: 41.2565, lon: -95.9345, cpm: 19, rawCpm: 1955, doseRate: 57, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tx-houston', name: 'Houston, TX', city: 'Houston', state: 'TX', country: 'United States', lat: 29.7604, lon: -95.3698, cpm: 14, rawCpm: 1473, doseRate: 41, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tx-austin', name: 'Austin, TX', city: 'Austin', state: 'TX', country: 'United States', lat: 30.2672, lon: -97.7431, cpm: 14, rawCpm: 1336, doseRate: 43, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-tx-elpaso', name: 'El Paso, TX', city: 'El Paso', state: 'TX', country: 'United States', lat: 31.7619, lon: -106.4850, cpm: 25, rawCpm: 2182, doseRate: 74, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-az-phoenix', name: 'Phoenix, AZ', city: 'Phoenix', state: 'AZ', country: 'United States', lat: 33.4484, lon: -112.0740, cpm: 29, rawCpm: 2857, doseRate: 86, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-nv-lasvegas', name: 'Las Vegas, NV', city: 'Las Vegas', state: 'NV', country: 'United States', lat: 36.1699, lon: -115.1398, cpm: 17, rawCpm: 1524, doseRate: 52, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-nm-albuquerque', name: 'Albuquerque, NM', city: 'Albuquerque', state: 'NM', country: 'United States', lat: 35.0844, lon: -106.6504, cpm: 27, rawCpm: 2275, doseRate: 82, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ok-oklahomacity', name: 'Oklahoma City, OK', city: 'Oklahoma City', state: 'OK', country: 'United States', lat: 35.4676, lon: -97.5164, cpm: 21, rawCpm: 2406, doseRate: 63, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ok-tulsa', name: 'Tulsa, OK', city: 'Tulsa', state: 'OK', country: 'United States', lat: 36.1540, lon: -95.9928, cpm: 19, rawCpm: 1961, doseRate: 56, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ar-littlerock', name: 'Little Rock, AR', city: 'Little Rock', state: 'AR', country: 'United States', lat: 34.7465, lon: -92.2896, cpm: 28, rawCpm: 3650, doseRate: 83, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ca-losangeles', name: 'Los Angeles, CA', city: 'Los Angeles', state: 'CA', country: 'United States', lat: 34.0522, lon: -118.2437, cpm: 25, rawCpm: 3012, doseRate: 74, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ca-sanfrancisco', name: 'San Francisco, CA', city: 'San Francisco', state: 'CA', country: 'United States', lat: 37.7749, lon: -122.4194, cpm: 9, rawCpm: 774, doseRate: 28, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ca-sandiego', name: 'San Diego, CA', city: 'San Diego', state: 'CA', country: 'United States', lat: 32.7157, lon: -117.1611, cpm: 31, rawCpm: 3726, doseRate: 94, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ca-sacramento', name: 'Sacramento, CA', city: 'Sacramento', state: 'CA', country: 'United States', lat: 38.5816, lon: -121.4944, cpm: 11, rawCpm: 924, doseRate: 33, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-wa-seattle', name: 'Seattle, WA', city: 'Seattle', state: 'WA', country: 'United States', lat: 47.6062, lon: -122.3321, cpm: 9, rawCpm: 605, doseRate: 26, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-wa-spokane', name: 'Spokane, WA', city: 'Spokane', state: 'WA', country: 'United States', lat: 47.6588, lon: -117.4260, cpm: 29, rawCpm: 3002, doseRate: 88, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-or-portland', name: 'Portland, OR', city: 'Portland', state: 'OR', country: 'United States', lat: 45.5152, lon: -122.6784, cpm: 14, rawCpm: 1418, doseRate: 42, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-co-denver', name: 'Denver, CO', city: 'Denver', state: 'CO', country: 'United States', lat: 39.7392, lon: -104.9903, cpm: 28, rawCpm: 2733, doseRate: 85, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ut-saltlakecity', name: 'Salt Lake City, UT', city: 'Salt Lake City', state: 'UT', country: 'United States', lat: 40.7608, lon: -111.8910, cpm: 21, rawCpm: 1398, doseRate: 64, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-id-boise', name: 'Boise, ID', city: 'Boise', state: 'ID', country: 'United States', lat: 43.6150, lon: -116.2023, cpm: 27, rawCpm: 3096, doseRate: 80, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-hi-honolulu', name: 'Honolulu, HI', city: 'Honolulu', state: 'HI', country: 'United States', lat: 21.3069, lon: -157.8583, cpm: 9, rawCpm: 624, doseRate: 28, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },
  { id: 'radnet-ak-anchorage', name: 'Anchorage, AK', city: 'Anchorage', state: 'AK', country: 'United States', lat: 61.2181, lon: -149.9003, cpm: 12, rawCpm: 767, doseRate: 37, unit: 'CPM', status: 'normal', time: 'Latest Approved', source: 'EPA RadNet (Envirofacts)', detectorType: 'NaI(Tl) Scintillator (EPA RadNet)' },

  // Chernobyl & Fukushima (Safecast Open Radiation Network - Geiger-Müller Pancake Tube)
  {
    id: 'safecast-chernobyl',
    name: 'Chernobyl Exclusion Zone',
    city: 'Pripyat / Chernobyl',
    country: 'Ukraine',
    lat: 51.389,
    lon: 30.099,
    cpm: 106,
    rawCpm: 106,
    doseRate: 318,
    unit: 'CPM',
    status: 'elevated',
    time: 'Recent Live Measurement',
    source: 'Safecast Open Radiation Network',
    detectorType: 'Geiger-Müller Tube (Safecast)',
  },
  {
    id: 'safecast-fukushima',
    name: 'Fukushima Daiichi Vicinity',
    city: 'Okuma / Fukushima',
    country: 'Japan',
    lat: 37.4214,
    lon: 141.0326,
    cpm: 64,
    rawCpm: 64,
    doseRate: 192,
    unit: 'CPM',
    status: 'normal',
    time: 'Recent Live Measurement',
    source: 'Safecast Open Radiation Network',
    detectorType: 'Geiger-Müller Tube (Safecast)',
  },
];

const breaker = createCircuitBreaker<RadiationStation[]>({
  name: 'Radiation:v3',
  cacheTtlMs: 30 * 60 * 1000, // 30 minutes
  persistCache: true,
});

export async function fetchRadiationData(): Promise<RadiationStation[]> {
  return breaker.execute(async () => {
    try {
      const response = await fetch('/api/radiation', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Radiation API returned HTTP ${response.status}`);
      }
      const data: RadiationStation[] = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        return BASELINE_RADIATION_STATIONS;
      }
      return data;
    } catch (e) {
      console.warn('[Radiation] Fetch failed, using baseline data:', e);
      return BASELINE_RADIATION_STATIONS;
    }
  }, BASELINE_RADIATION_STATIONS);
}

export function getRadiationStatus(): string {
  return breaker.getStatus();
}
