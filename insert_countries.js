const fs = require('fs');

const countries = [
  { id: 'usa', name: 'United States', region: 'North America', country: 'USA', lat: 37.0902, lon: -95.7129, type: 'country', tier: 'major', keywords: ['united states', 'usa', 'america', 'american'] },
  { id: 'russia', name: 'Russia', region: 'Europe/Asia', country: 'Russia', lat: 61.5240, lon: 105.3188, type: 'country', tier: 'major', keywords: ['russia', 'russian'] },
  { id: 'china', name: 'China', region: 'Asia', country: 'China', lat: 35.8617, lon: 104.1954, type: 'country', tier: 'major', keywords: ['china', 'chinese'] },
  { id: 'ukraine', name: 'Ukraine', region: 'Europe', country: 'Ukraine', lat: 48.3794, lon: 31.1656, type: 'country', tier: 'major', keywords: ['ukraine', 'ukrainian'] },
  { id: 'iran', name: 'Iran', region: 'Middle East', country: 'Iran', lat: 32.4279, lon: 53.6880, type: 'country', tier: 'major', keywords: ['iran', 'iranian'] },
  { id: 'israel', name: 'Israel', region: 'Middle East', country: 'Israel', lat: 31.0461, lon: 34.8516, type: 'country', tier: 'major', keywords: ['israel', 'israeli'] },
  { id: 'taiwan', name: 'Taiwan', region: 'Asia', country: 'Taiwan', lat: 23.6978, lon: 120.9605, type: 'country', tier: 'major', keywords: ['taiwan', 'taiwanese'] },
  { id: 'north-korea', name: 'North Korea', region: 'Asia', country: 'North Korea', lat: 40.3399, lon: 127.5101, type: 'country', tier: 'major', keywords: ['north korea', 'north korean', 'dprk'] },
  { id: 'south-korea', name: 'South Korea', region: 'Asia', country: 'South Korea', lat: 35.9078, lon: 127.7669, type: 'country', tier: 'major', keywords: ['south korea', 'south korean', 'rok'] },
  { id: 'saudi-arabia', name: 'Saudi Arabia', region: 'Middle East', country: 'Saudi Arabia', lat: 23.8859, lon: 45.0792, type: 'country', tier: 'major', keywords: ['saudi arabia', 'saudi'] },
  { id: 'turkey', name: 'Turkey', region: 'Middle East', country: 'Turkey', lat: 38.9637, lon: 35.2433, type: 'country', tier: 'major', keywords: ['turkey', 'turkish', 'türkiye'] },
  { id: 'india', name: 'India', region: 'Asia', country: 'India', lat: 20.5937, lon: 78.9629, type: 'country', tier: 'major', keywords: ['india', 'indian'] },
  { id: 'pakistan', name: 'Pakistan', region: 'Asia', country: 'Pakistan', lat: 30.3753, lon: 69.3451, type: 'country', tier: 'major', keywords: ['pakistan', 'pakistani'] },
  { id: 'syria', name: 'Syria', region: 'Middle East', country: 'Syria', lat: 34.8021, lon: 38.9968, type: 'country', tier: 'major', keywords: ['syria', 'syrian'] },
  { id: 'yemen', name: 'Yemen', region: 'Middle East', country: 'Yemen', lat: 15.5527, lon: 48.5164, type: 'country', tier: 'major', keywords: ['yemen', 'yemeni'] },
  { id: 'venezuela', name: 'Venezuela', region: 'South America', country: 'Venezuela', lat: 6.4238, lon: -66.5897, type: 'country', tier: 'major', keywords: ['venezuela', 'venezuelan'] },
  { id: 'uk', name: 'United Kingdom', region: 'Europe', country: 'UK', lat: 55.3781, lon: -3.4360, type: 'country', tier: 'major', keywords: ['united kingdom', 'uk', 'britain', 'british'] },
  { id: 'germany', name: 'Germany', region: 'Europe', country: 'Germany', lat: 51.1657, lon: 10.4515, type: 'country', tier: 'major', keywords: ['germany', 'german'] },
  { id: 'france', name: 'France', region: 'Europe', country: 'France', lat: 46.2276, lon: 2.2137, type: 'country', tier: 'major', keywords: ['france', 'french'] },
  { id: 'japan', name: 'Japan', region: 'Asia', country: 'Japan', lat: 36.2048, lon: 138.2529, type: 'country', tier: 'major', keywords: ['japan', 'japanese'] },
  { id: 'australia', name: 'Australia', region: 'Oceania', country: 'Australia', lat: -25.2744, lon: 133.7751, type: 'country', tier: 'major', keywords: ['australia', 'australian'] },
  { id: 'canada', name: 'Canada', region: 'North America', country: 'Canada', lat: 56.1304, lon: -106.3468, type: 'country', tier: 'major', keywords: ['canada', 'canadian'] },
  { id: 'brazil', name: 'Brazil', region: 'South America', country: 'Brazil', lat: -14.2350, lon: -51.9253, type: 'country', tier: 'major', keywords: ['brazil', 'brazilian'] },
  { id: 'mexico', name: 'Mexico', region: 'North America', country: 'Mexico', lat: 23.6345, lon: -102.5528, type: 'country', tier: 'major', keywords: ['mexico', 'mexican'] },
  { id: 'italy', name: 'Italy', region: 'Europe', country: 'Italy', lat: 41.8719, lon: 12.5674, type: 'country', tier: 'major', keywords: ['italy', 'italian'] },
  { id: 'spain', name: 'Spain', region: 'Europe', country: 'Spain', lat: 40.4637, lon: -3.7492, type: 'country', tier: 'major', keywords: ['spain', 'spanish'] },
  { id: 'indonesia', name: 'Indonesia', region: 'Asia', country: 'Indonesia', lat: -0.7893, lon: 113.9213, type: 'country', tier: 'major', keywords: ['indonesia', 'indonesian'] },
  { id: 'egypt', name: 'Egypt', region: 'Africa', country: 'Egypt', lat: 26.8206, lon: 30.8025, type: 'country', tier: 'major', keywords: ['egypt', 'egyptian'] },
  { id: 'south-africa', name: 'South Africa', region: 'Africa', country: 'South Africa', lat: -30.5595, lon: 22.9375, type: 'country', tier: 'major', keywords: ['south africa', 'south african'] }
];

let content = fs.readFileSync('src/services/geo-hub-index.ts', 'utf8');

const insertionCode = '\n  // Country Fallbacks\n' + countries.map(c => 
  `  { id: '${c.id}', name: '${c.name}', region: '${c.region}', country: '${c.country}', lat: ${c.lat}, lon: ${c.lon}, type: '${c.type}', tier: '${c.tier}', keywords: ${JSON.stringify(c.keywords)} },`
).join('\n') + '\n';

content = content.replace('];\n\nfunction buildGeoHubIndex()', insertionCode + '];\n\nfunction buildGeoHubIndex()');
fs.writeFileSync('src/services/geo-hub-index.ts', content);
console.log('Appended countries to GEO_HUBS');
