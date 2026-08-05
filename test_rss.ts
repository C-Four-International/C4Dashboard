import { fetchCategoryFeeds } from './src/services/rss.js';
import { clusterNewsCore } from './src/services/rss.js';
import { calculateRegionalThreats } from './src/services/aggregate-threat.js';

async function main() {
  console.log("Fetching live news feeds...");
  
  // Fetch some news (e.g. general category)
  const items = await fetchCategoryFeeds('general', 20); // up to 20 items
  console.log(`Fetched ${items.length} news items.`);
  
  if (items.length > 0) {
    console.log("\nSample raw news item:");
    console.log(JSON.stringify(items[0], null, 2));
  }
  
  console.log("\nClustering news and inferring geo hubs...");
  const clusters = clusterNewsCore(items);
  
  console.log(`Generated ${clusters.length} clusters.`);
  
  const newsLocations = clusters.map(c => {
    const loc = c.allItems.find(i => i.lat != null && i.lon != null);
    return { ...c, lat: c.lat ?? loc?.lat, lon: c.lon ?? loc?.lon };
  }).filter((c): c is typeof c & { lat: number; lon: number } => c.lat != null && c.lon != null);
  
  console.log(`Found ${newsLocations.length} geolocated clusters.`);
  
  if (newsLocations.length > 0) {
    console.log("\nCalculating threat scores...");
    const threats = calculateRegionalThreats(newsLocations);
    
    console.log("\nFinal Threat Scores (Top 5):");
    const topThreats = threats.sort((a, b) => b.threatScore - a.threatScore).slice(0, 5);
    console.log(JSON.stringify(topThreats, null, 2));
  } else {
    console.log("\nNo geolocated clusters found to calculate threat scores. (You may need to wait for more news to trickle in).");
  }
}

main().catch(console.error);
