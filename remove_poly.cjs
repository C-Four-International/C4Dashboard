const fs = require('fs');
const path = require('path');

const localesDir = path.join(process.cwd(), 'src', 'locales');
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

let modifiedFiles = 0;

for (const file of files) {
  const filePath = path.join(localesDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    console.error(`Error parsing ${file}:`, e.message);
    continue;
  }
  
  let modified = false;

  if (data?.panels?.polymarket) {
    delete data.panels.polymarket;
    modified = true;
  }
  if (data?.modals?.search?.types?.prediction) {
    delete data.modals.search.types.prediction;
    modified = true;
  }
  if (data?.components?.predictions) {
    delete data.components.predictions;
    modified = true;
  }
  if (data?.components?.prediction) {
    delete data.components.prediction;
    modified = true;
  }
  if (data?.countryBrief?.predictionMarkets) {
    delete data.countryBrief.predictionMarkets;
    modified = true;
  }
  if (data?.countryBrief?.loadingMarkets) {
    delete data.countryBrief.loadingMarkets;
    modified = true;
  }
  if (data?.countryBrief?.noMarkets) {
    delete data.countryBrief.noMarkets;
    modified = true;
  }
  if (data?.countryIntel?.predictionMarkets) {
    delete data.countryIntel.predictionMarkets;
    modified = true;
  }
  if (data?.countryIntel?.loadingMarkets) {
    delete data.countryIntel.loadingMarkets;
    modified = true;
  }
  if (data?.countryIntel?.noMarkets) {
    delete data.countryIntel.noMarkets;
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    modifiedFiles++;
    console.log(`Modified ${file}`);
  }
}

console.log(`Replaced references in ${modifiedFiles} files.`);
