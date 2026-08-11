const fs = require('fs');

const upstreamGeoMapPath = 'C:\\Users\\lepko\\.gemini\\antigravity-ide\\brain\\3a4492b5-b89d-4013-9c37-0a1568ae493d\\scratch\\upstream-geo-map.ts';
const localGeoPath = 'c:\\Users\\lepko\\Documents\\GitHub\\C4Dashboard\\src\\config\\geo.ts';

const upstreamCode = fs.readFileSync(upstreamGeoMapPath, 'utf8');
const localCode = fs.readFileSync(localGeoPath, 'utf8');

// Find UNDERSEA_CABLES in upstream
const upstreamRegex = /export const UNDERSEA_CABLES: UnderseaCable\[\] = \[\s*[\s\S]*?\n\];/m;
const match = upstreamCode.match(upstreamRegex);

if (!match) {
  console.error("Could not find UNDERSEA_CABLES in upstream geo-map.ts");
  process.exit(1);
}

const newCablesCode = match[0];

// Replace in local
const localRegex = /export const UNDERSEA_CABLES: UnderseaCable\[\] = \[\s*[\s\S]*?\n\];/m;

if (!localRegex.test(localCode)) {
  console.error("Could not find UNDERSEA_CABLES in local geo.ts");
  process.exit(1);
}

const updatedLocalCode = localCode.replace(localRegex, newCablesCode);

fs.writeFileSync(localGeoPath, updatedLocalCode, 'utf8');
console.log("Successfully replaced UNDERSEA_CABLES");
