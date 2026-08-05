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
  newsLocations: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date; items?: NewsItem[] }>,
  currentTimeMs: number = Date.now()
): RegionalThreat[] {
  const lambda = 0.05; // Time decay constant (halves every ~14 hours)
  const MS_PER_HOUR = 60 * 60 * 1000;

  const results: RegionalThreat[] = [];

  for (const location of newsLocations) {
    const items = location.items || [];
    const V = items.length;
    
    // If no individual items are available, fallback to a single placeholder calculation
    // based on the cluster's high-level attributes
    if (V === 0) {
      let ageMs = currentTimeMs - (location.timestamp ? location.timestamp.getTime() : currentTimeMs);
      if (ageMs < 0) ageMs = 0;
      const t_i = ageMs / MS_PER_HOUR;
      
      const S_i = getSeverityScore(location.threatLevel);
      const C_i = 0.6; // slightly elevated default credibility for a clustered event
      
      // V = 1 -> log10(2) * (S_i * C_i * exp(-lambda * t_i) / 1)
      const T = Math.log10(2) * (S_i * C_i * Math.exp(-lambda * t_i));
      
      if (T > 0.01) {
        results.push({
          lat: location.lat,
          lon: location.lon,
          locationName: location.title,
          threatScore: T,
          eventCount: 1,
        });
      }
      continue;
    }

    let sum = 0;
    for (const item of items) {
      // Age in hours
      let ageMs = currentTimeMs - item.pubDate.getTime();
      if (ageMs < 0) ageMs = 0; // Prevent negative time
      const t_i = ageMs / MS_PER_HOUR;

      const threat = item.threat || classifyByKeyword(item.title, SITE_VARIANT);
      const S_i = getSeverityScore(threat.level);
      const C_i = getCredibility(item.source);

      sum += S_i * C_i * Math.exp(-lambda * t_i);
    }

    const T = Math.log10(V + 1) * (sum / V);

    if (T > 0.01) {
      results.push({
        lat: location.lat,
        lon: location.lon,
        locationName: location.title,
        threatScore: T,
        eventCount: V,
      });
    }
  }

  return results;
}
