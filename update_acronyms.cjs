const fs = require('fs');
const path = 'src/config/countries.ts';
let content = fs.readFileSync(path, 'utf8');

const countryRegex = /([A-Z]{2}):\s*\{\s*name:\s*'([^']+)',\s*scoringKeywords:\s*\[(.*?)\],\s*searchAliases:\s*\[(.*?)\],/g;

content = content.replace(countryRegex, (match, acronym, name, scoringStr, searchStr) => {
  const acrLow = acronym.toLowerCase();
  
  let scoring = scoringStr.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  let search = searchStr.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  
  if (!scoring.includes(acrLow)) {
    scoring.push(acrLow);
  }
  
  if (!search.includes(acrLow)) {
    search.push(acrLow);
  }
  
  const newScoringStr = scoring.map(s => "'" + s + "'").join(', ');
  const newSearchStr = search.map(s => "'" + s + "'").join(', ');
  
  return acronym + ': {\n    name: \'' + name + '\',\n    scoringKeywords: [' + newScoringStr + '],\n    searchAliases: [' + newSearchStr + '],';
});

fs.writeFileSync(path, content, 'utf8');
console.log('Updated countries.ts');
