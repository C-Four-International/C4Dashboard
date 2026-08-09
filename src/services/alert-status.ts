const RSS_BASE_URL = 'https://feeds.cfourinternational.org/feeds';

const REGION_FEEDS: Record<string, string[]> = {
  // United States
  'alert-status-us-ca': ['California'],
  'alert-status-us-pnw': ['Oregon', 'Washington', 'Idaho'],
  'alert-status-us-swc': ['Montana', 'North Dakota', 'Minnesota', 'Wyoming', 'South Dakota', 'Iowa', 'Nebraska', 'Nevada', 'Utah', 'Colorado', 'Kansas', 'Missouri', 'Arizona', 'New Mexico', 'Oklahoma'],
  'alert-status-us-ecm': ['Wisconsin', 'Michigan', 'New York', 'Vermont', 'New Hampshire', 'Maine', 'Massachusetts', 'Connecticut', 'Rhode Island', 'Illinois', 'Indiana', 'Ohio', 'Pennsylvania', 'New Jersey', 'Delaware', 'Maryland', 'District of Columbia'],
  'alert-status-us-sth': ['Kentucky', 'West Virginia', 'Virginia', 'Texas', 'Arkansas', 'Tennessee', 'North Carolina', 'Louisiana', 'Mississippi', 'Alabama', 'Georgia', 'South Carolina', 'Florida'],
  // Canada
  'alert-status-ca-atl': ['Prince Edward Island', 'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador'],
  'alert-status-ca-est': ['Quebec', 'Ontario'],
  'alert-status-ca-ctr': ['Manitoba', 'Saskatchewan'],
  'alert-status-ca-wst': ['Alberta', 'British Columbia'],
  'alert-status-ca-ter': ['Nunavut', 'Northwest Territories', 'Yukon']
};

export type AlertColor = 'BLUE' | 'RED' | 'YELLOW' | 'GREEN' | 'NONE';

export interface AlertStatus {
  color: AlertColor;
  regionNames: string[];
}

export class AlertStatusService {
  private static instance: AlertStatusService;
  private statusMap: Map<string, AlertColor> = new Map();
  private fetchPromise: Promise<void> | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): AlertStatusService {
    if (!AlertStatusService.instance) {
      AlertStatusService.instance = new AlertStatusService();
    }
    return AlertStatusService.instance;
  }

  public async fetchStatuses(): Promise<void> {
    const now = Date.now();
    if (this.fetchPromise && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchAllFeeds();
    this.lastFetchTime = now;
    return this.fetchPromise;
  }

  private async _fetchAllFeeds(): Promise<void> {
    const feedIds = Object.keys(REGION_FEEDS);
    const newStatusMap = new Map<string, AlertColor>();

    const fetchPromises = feedIds.map(async (feedId) => {
      try {
        const response = await fetch(`${RSS_BASE_URL}/${feedId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const items = xmlDoc.getElementsByTagName('item');
        
        let color: AlertColor = 'NONE';
        if (items.length > 0) {
          const descElement = items[0]!.getElementsByTagName('description')[0];
          const titleElement = items[0]!.getElementsByTagName('title')[0];
          const desc = descElement ? descElement.textContent || '' : '';
          const title = titleElement ? titleElement.textContent || '' : '';
          const content = `${title} ${desc}`.replace(/\s+/g, '').toUpperCase();
          
          if (content.includes('BLUE')) color = 'BLUE';
          else if (content.includes('RED')) color = 'RED';
          else if (content.includes('YELLOW')) color = 'YELLOW';
          else if (content.includes('GREEN')) color = 'GREEN';
        }

        const regions = REGION_FEEDS[feedId];
        if (regions) {
          for (const region of regions) {
            newStatusMap.set(region.toLowerCase(), color);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch alert status for ${feedId}:`, error);
      }
    });

    await Promise.all(fetchPromises);
    this.statusMap = newStatusMap;
  }

  public getStatusForRegion(regionName: string): AlertColor {
    return this.statusMap.get(regionName.toLowerCase()) || 'NONE';
  }

  public getFillColor(status: AlertColor): string {
    switch (status) {
      case 'BLUE': return 'rgba(59, 130, 246, 0.4)'; // #3b82f6 Imminent Disaster
      case 'RED': return 'rgba(239, 68, 68, 0.4)'; // #ef4444 Disaster Possible
      case 'YELLOW': return 'rgba(234, 179, 8, 0.4)'; // #eab308 Concern
      case 'GREEN': return 'rgba(34, 197, 94, 0.4)'; // #22c55e Least Concern
      default: return 'transparent';
    }
  }

  public getStatusText(status: AlertColor): string {
    switch (status) {
      case 'BLUE': return 'Imminent Disaster';
      case 'RED': return 'Disaster Possible';
      case 'YELLOW': return 'Concern';
      case 'GREEN': return 'Least Concern';
      default: return 'Unknown';
    }
  }
}
