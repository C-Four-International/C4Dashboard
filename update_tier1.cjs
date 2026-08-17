const fs = require('fs');
const dn = new Intl.DisplayNames(['en'], { type: 'region' });

const path = 'server/worldmonitor/intelligence/v1/_shared.ts';
let content = fs.readFileSync(path, 'utf8');

const existingAcronyms = [...content.matchAll(/([A-Z]{2}):\s*'/g)].map(m => m[1]);
const existingSet = new Set(existingAcronyms);

const missing = [];
for (let i = 0; i < 26; i++) {
  for (let j = 0; j < 26; j++) {
    const code = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
    if (!existingSet.has(code)) {
      try {
        const name = dn.of(code);
        if (name && name !== code && !name.includes('Unknown')) {
          missing.push("  " + code + ": '" + name.replace(/'/g, "\\'") + "',");
        }
      } catch (e) {
        // Ignore invalid codes
      }
    }
  }
}

if (missing.length > 0) {
  content = content.replace(/};\s*$/m, missing.join('\n') + '\n};');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Added ' + missing.length + ' missing countries to TIER1_COUNTRIES.');
} else {
  console.log('No missing countries found.');
}
