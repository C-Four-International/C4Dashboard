import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  
  // Wait for the app to load
  await page.waitForTimeout(5000);
  
  // We can just run a script in the browser to extract the data if it's stored in a global
  // Or we can programmatically trigger the popup for all countries in the internal geo object!
  
  const results = await page.evaluate(async () => {
    // The worldmonitor app has a lot of internal data.
    // Let's try to get it from the signalAggregator or geo-hub-index
    // If not, we can just extract whatever is visible, but we need to click.
    
    // Actually, we can just look at the DOM. But there's only one popup at a time.
    // Let's see if there is any global we can access:
    const acronyms = [];
    
    // Instead of clicking, maybe we can fetch the GeoJSON used by DeckGL?
    // Let's look for anything with "cb-flag"
    const flags = document.querySelectorAll('.cb-flag');
    flags.forEach(f => {
      const nameEl = f.parentElement.querySelector('.cb-country-name');
      if (nameEl) {
        acronyms.push({ flag: f.textContent.trim(), name: nameEl.textContent.trim() });
      }
    });
    
    return acronyms;
  });
  
  fs.writeFileSync('extracted_acronyms.json', JSON.stringify(results, null, 2));
  
  await browser.close();
})();
