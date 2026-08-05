import type { NewsItem, RegionalThreat } from '@/types';
import { classifyByKeyword } from './threat-classifier';
import { SITE_VARIANT } from '@/config';

// Maps source names to C_i credibility multipliers (0.1 to 1.0)
export function getCredibility(source: string): number {
  if (!source) return 0.5;
  const lower = source.toLowerCase();

  // Primary / Major News Outlets (1.0)
  if (
    lower.includes('reuters') ||
    lower.includes('associated press') ||
    lower.includes('ap') ||
    lower.includes('bbc') ||
    lower.includes('bloomberg') ||
    lower.includes('nytimes') ||
    lower.includes('wall street journal') ||
    lower.includes('wsj') ||
    lower.includes('financial times')
  ) {
    return 1.0;
  }

  // Major Networks / Secondary Sources (0.8)
  if (
    lower.includes('cnn') ||
    lower.includes('fox') ||
    lower.includes('msnbc') ||
    lower.includes('al jazeera') ||
    lower.includes('guardian') ||
    lower.includes('nbc') ||
    lower.includes('cbs') ||
    lower.includes('abc')
  ) {
    return 0.8;
  }

  // Known reliable aggregators / local major sources (0.6)
  if (
    lower.includes('npr') ||
    lower.includes('pbs') ||
    lower.includes('washington post') ||
    lower.includes('telegraph')
  ) {
    return 0.6;
  }

  // Default for unknown sources
  return 0.5;
}

// Maps ThreatLevel string to Severity S_i (1 to 10)
export function getSeverityScore(level: string): number {
  switch (level) {
    case 'critical':
      return 10;
    case 'high':
      return 8;
    case 'medium':
      return 5;
    case 'low':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

// Calculates aggregate threat scores based on the formula:
// T = log10(V + 1) * ( Sum( S_i * C_i * e^(-lambda * t_i) ) / V )
export function calculateRegionalThreats(
  newsItems: NewsItem[],
  currentTimeMs: number = Date.now()
): RegionalThreat[] {
  const lambda = 0.05; // Time decay constant (halves every ~14 hours)
  const MS_PER_HOUR = 60 * 60 * 1000;

  // Group items by geographical location
  const regionsMap = new Map<string, { lat: number; lon: number; locationName?: string; items: NewsItem[] }>();

  for (const item of newsItems) {
    // Only group items with known lat/lon
    if (item.lat === undefined || item.lon === undefined) continue;

    // Use locationName as key if available, otherwise fallback to "lat,lon"
    const key = item.locationName || `${item.lat.toFixed(2)},${item.lon.toFixed(2)}`;
    
    if (!regionsMap.has(key)) {
      regionsMap.set(key, { lat: item.lat, lon: item.lon, locationName: item.locationName, items: [] });
    }
    regionsMap.get(key)!.items.push(item);
  }

  const results: RegionalThreat[] = [];

  for (const [_, regionData] of regionsMap.entries()) {
    const V = regionData.items.length;
    if (V === 0) continue;

    let sum = 0;

    for (const item of regionData.items) {
      // Age in hours
      let ageMs = currentTimeMs - item.pubDate.getTime();
      if (ageMs < 0) ageMs = 0; // Prevent negative time
      const t_i = ageMs / MS_PER_HOUR;

      // Ensure item has a threat classification if not already set (rely on lightweight NLP buzzwords)
      const threat = item.threat || classifyByKeyword(item.title, SITE_VARIANT);
      const S_i = getSeverityScore(threat.level);

      const C_i = getCredibility(item.source);

      sum += S_i * C_i * Math.exp(-lambda * t_i);
    }

    const T = Math.log10(V + 1) * (sum / V);

    // Only include regions with a meaningful threat score (>0.01) to keep the map clean
    if (T > 0.01) {
      results.push({
        lat: regionData.lat,
        lon: regionData.lon,
        locationName: regionData.locationName,
        threatScore: T,
        eventCount: V,
      });
    }
  }

  return results;
}
