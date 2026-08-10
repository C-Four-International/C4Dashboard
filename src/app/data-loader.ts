import type { AppContext, AppModule } from '@/app/app-context';
import type { NewsItem, MapLayers, SocialUnrestEvent } from '@/types';
import type { TimeRange } from '@/components';
import {
  FEEDS,
  INTEL_SOURCES,
  SITE_VARIANT,
  LAYER_TO_SOURCE,
} from '@/config';
import { INTEL_HOTSPOTS, CONFLICT_ZONES } from '@/config/geo';
import {
  fetchCategoryFeeds,
  getFeedFailures,
  fetchEarthquakes,
  fetchWeatherAlerts,
  fetchInternetOutages,
  isOutagesConfigured,
  fetchAisSignals,
  getAisStatus,
  isAisConfigured,
  fetchCableActivity,
  fetchCableHealth,
  fetchProtestEvents,
  getProtestStatus,
  fetchFlightDelays,
  fetchMilitaryFlights,
  fetchMilitaryVessels,
  initMilitaryVesselStream,
  isMilitaryVesselTrackingConfigured,
  fetchUSNIFleetReport,
  updateBaseline,
  calculateDeviation,
  addToSignalHistory,
  analysisWorker,
  fetchPizzIntStatus,
  fetchGdeltTensions,
  fetchNaturalEvents,
  fetchCyberThreats,
  drainTrendingSignals,
  fetchTradeRestrictions,
  fetchTariffTrends,
  fetchTradeFlows,
  fetchTradeBarriers,
  fetchShippingRates,
  fetchChokepointStatus,
  fetchCriticalMinerals,
} from '@/services';
import { mlWorker } from '@/services/ml-worker';
import { clusterNewsHybrid } from '@/services/clustering';
import { ingestProtests, ingestFlights, ingestVessels, ingestEarthquakes, detectGeoConvergence, geoConvergenceToSignal } from '@/services/geo-convergence';
import { inferGeoHubsFromTitle } from '@/services/geo-hub-index';
import { signalAggregator } from '@/services/signal-aggregator';
import { updateAndCheck } from '@/services/temporal-baseline';
import { fetchAllFires, flattenFires, computeRegionStats, toMapFires } from '@/services/wildfires';
import { analyzeFlightsForSurge, surgeAlertToSignal, detectForeignMilitaryPresence, foreignPresenceToSignal, type TheaterPostureSummary } from '@/services/military-surge';
import { fetchCachedTheaterPosture } from '@/services/cached-theater-posture';
import { ingestProtestsForCII, ingestMilitaryForCII, ingestNewsForCII, ingestOutagesForCII, ingestDisplacementForCII, ingestClimateForCII, isInLearningMode } from '@/services/country-instability';
import { dataFreshness, type DataSourceId } from '@/services/data-freshness';
import { fetchUnhcrPopulation } from '@/services/displacement';
import { fetchClimateAnomalies } from '@/services/climate';
import { enrichEventsWithExposure } from '@/services/population-exposure';
import { debounce } from '@/utils';
import { getAiFlowSettings } from '@/services/ai-flow-settings';
import { t, getCurrentLanguage } from '@/services/i18n';
import { canQueueAiClassification, AI_CLASSIFY_MAX_PER_FEED } from '@/services/ai-classify-queue';
import { classifyWithAI } from '@/services/threat-classifier';
import { ingestHeadlines } from '@/services/trending-keywords';
import { ResearchServiceClient } from '@/generated/client/worldmonitor/research/v1/service_client';
import {
  MonitorPanel,
  InsightsPanel,
  CIIPanel,
  StrategicPosturePanel,
  TechReadinessPanel,
  // UcdpEventsPanel,
  DisplacementPanel,
  ClimateAnomalyPanel,
  PopulationExposurePanel,
  TradePolicyPanel,
  SupplyChainPanel,
} from '@/components';
import { SatelliteFiresPanel } from '@/components/SatelliteFiresPanel';
import { classifyNewsItem } from '@/services/positive-classifier';
import { fetchGivingSummary } from '@/services/giving';
import { GivingPanel } from '@/components';
import { fetchProgressData } from '@/services/progress-data';
import { fetchConservationWins } from '@/services/conservation-data';
import { fetchRenewableEnergyData, fetchEnergyCapacity } from '@/services/renewable-energy-data';
import { checkMilestones } from '@/services/celebration';
import { fetchHappinessScores } from '@/services/happiness-data';
import { fetchRenewableInstallations } from '@/services/renewable-installations';
import { filterBySentiment } from '@/services/sentiment-gate';
import { fetchAllPositiveTopicIntelligence } from '@/services/gdelt-intel';
import { fetchPositiveGeoEvents, geocodePositiveNewsItems } from '@/services/positive-events-geo';
import { fetchKindnessData } from '@/services/kindness-data';
import { getPersistentCache, setPersistentCache } from '@/services/persistent-cache';
import type { ThreatLevel as ClientThreatLevel } from '@/services/threat-classifier';
import type { NewsItem as ProtoNewsItem, ThreatLevel as ProtoThreatLevel, ListFeedDigestResponse } from '@/generated/client/worldmonitor/news/v1/service_client';

const PROTO_TO_CLIENT_LEVEL: Record<ProtoThreatLevel, ClientThreatLevel> = {
  THREAT_LEVEL_UNSPECIFIED: 'info',
  THREAT_LEVEL_LOW: 'low',
  THREAT_LEVEL_MEDIUM: 'medium',
  THREAT_LEVEL_HIGH: 'high',
  THREAT_LEVEL_CRITICAL: 'critical',
};

function protoItemToNewsItem(p: ProtoNewsItem): NewsItem {
  const level = PROTO_TO_CLIENT_LEVEL[p.threat?.level ?? 'THREAT_LEVEL_UNSPECIFIED'];
  
  // Try to use backend-provided location, otherwise infer it on the client
  let lat = p.location?.latitude;
  let lon = p.location?.longitude;
  let locationName = p.locationName;
  
  if (lat == null || lon == null) {
    const geoMatches = inferGeoHubsFromTitle(p.title);
    const topMatch = geoMatches[0];
    if (topMatch) {
      lat = topMatch.hub.lat;
      lon = topMatch.hub.lon;
      locationName = topMatch.hub.name;
    }
  }

  return {
    source: p.source,
    title: p.title,
    link: p.link,
    pubDate: new Date(p.publishedAt),
    isAlert: p.isAlert,
    threat: p.threat ? {
      level,
      category: p.threat.category as import('@/services/threat-classifier').EventCategory,
      confidence: p.threat.confidence,
      source: (p.threat.source || 'keyword') as 'keyword' | 'ml' | 'llm',
    } : undefined,
    ...(locationName && { locationName }),
    ...(lat != null && lon != null && { lat, lon }),
  };
}

const CYBER_LAYER_ENABLED = import.meta.env.VITE_ENABLE_CYBER_LAYER === 'true';

export interface DataLoaderCallbacks {
  renderCriticalBanner: (postures: TheaterPostureSummary[]) => void;
}

export class DataLoaderManager implements AppModule {
  private ctx: AppContext;
  private callbacks: DataLoaderCallbacks;

  private mapFlashCache: Map<string, number> = new Map();
  private readonly MAP_FLASH_COOLDOWN_MS = 10 * 60 * 1000;
  private readonly applyTimeRangeFilterToNewsPanelsDebounced = debounce(() => {
    this.applyTimeRangeFilterToNewsPanels();
  }, 120);

  public updateSearchIndex: () => void = () => {};

  private digestBreaker = { state: 'closed' as 'closed' | 'open' | 'half-open', failures: 0, cooldownUntil: 0 };
  private lastGoodDigest: ListFeedDigestResponse | null = null;

  constructor(ctx: AppContext, callbacks: DataLoaderCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
  }

  init(): void {}

  destroy(): void {}

  private async tryFetchDigest(): Promise<ListFeedDigestResponse | null> {
    const now = Date.now();

    if (this.digestBreaker.state === 'open') {
      if (now < this.digestBreaker.cooldownUntil) {
        return this.lastGoodDigest ?? await this.loadPersistedDigest();
      }
      this.digestBreaker.state = 'half-open';
    }

    try {
      const resp = await fetch(
        `/api/news/v1/list-feed-digest?variant=${SITE_VARIANT}&lang=${getCurrentLanguage()}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as ListFeedDigestResponse;
      const catCount = Object.keys(data.categories ?? {}).length;
      console.info(`[News] Digest fetched: ${catCount} categories`);
      this.lastGoodDigest = data;
      this.persistDigest(data);
      this.digestBreaker = { state: 'closed', failures: 0, cooldownUntil: 0 };
      return data;
    } catch (e) {
      console.warn('[News] Digest fetch failed, using fallback:', e);
      this.digestBreaker.failures++;
      if (this.digestBreaker.failures >= 2) {
        this.digestBreaker.state = 'open';
        this.digestBreaker.cooldownUntil = now + 60_000;
      }
      return this.lastGoodDigest ?? await this.loadPersistedDigest();
    }
  }

  private persistDigest(data: ListFeedDigestResponse): void {
    setPersistentCache('digest:last-good', data).catch(() => {});
  }

  private async loadPersistedDigest(): Promise<ListFeedDigestResponse | null> {
    try {
      const envelope = await getPersistentCache<ListFeedDigestResponse>('digest:last-good');
      if (!envelope) return null;
      if (Date.now() - envelope.updatedAt > 30 * 60 * 1000) return null;
      this.lastGoodDigest = envelope.data;
      return envelope.data;
    } catch { return null; }
  }

  private shouldShowIntelligenceNotifications(): boolean {
    return !this.ctx.isMobile && !!this.ctx.findingsBadge?.isPopupEnabled();
  }

  async loadAllData(): Promise<void> {
    const runGuarded = async (name: string, fn: () => Promise<void>): Promise<void> => {
      if (this.ctx.isDestroyed || this.ctx.inFlight.has(name)) return;
      this.ctx.inFlight.add(name);
      try {
        await fn();
      } catch (e) {
        if (!this.ctx.isDestroyed) console.error(`[App] ${name} failed:`, e);
      } finally {
        this.ctx.inFlight.delete(name);
      }
    };

    const tasks: Array<{ name: string; task: Promise<void> }> = [
      { name: 'news', task: runGuarded('news', () => this.loadNews()) },
    ];

    // Happy variant only loads news data -- skip all geopolitical/financial/military data
    if (SITE_VARIANT !== 'happy') {
      if (this.ctx.panelSettings['pizzint']?.enabled) {
        tasks.push({ name: 'pizzint', task: runGuarded('pizzint', () => this.loadPizzInt()) });
      }

      // Trade policy data (FULL and FINANCE only)
      if (SITE_VARIANT === 'full' || SITE_VARIANT === 'finance') {
        if (this.ctx.panelSettings['trade-policy']?.enabled) {
          tasks.push({ name: 'tradePolicy', task: runGuarded('tradePolicy', () => this.loadTradePolicy()) });
        }
        if (this.ctx.panelSettings['supply-chain']?.enabled) {
          tasks.push({ name: 'supplyChain', task: runGuarded('supplyChain', () => this.loadSupplyChain()) });
        }
      }
    }

    // Progress charts data (happy variant only)
    if (SITE_VARIANT === 'happy') {
      tasks.push({
        name: 'progress',
        task: runGuarded('progress', () => this.loadProgressData()),
      });
      tasks.push({
        name: 'species',
        task: runGuarded('species', () => this.loadSpeciesData()),
      });
      tasks.push({
        name: 'renewable',
        task: runGuarded('renewable', () => this.loadRenewableData()),
      });
      tasks.push({
        name: 'happinessMap',
        task: runGuarded('happinessMap', async () => {
          const data = await fetchHappinessScores();
          this.ctx.map?.setHappinessScores(data);
        }),
      });
      tasks.push({
        name: 'renewableMap',
        task: runGuarded('renewableMap', async () => {
          const installations = await fetchRenewableInstallations();
          this.ctx.map?.setRenewableInstallations(installations);
        }),
      });
    }

    // Global giving activity data (all variants)
    tasks.push({
      name: 'giving',
      task: runGuarded('giving', async () => {
        const givingResult = await fetchGivingSummary();
        if (!givingResult.ok) {
          dataFreshness.recordError('giving', 'Giving data unavailable (retaining prior state)');
          return;
        }
        const data = givingResult.data;
        (this.ctx.panels['giving'] as GivingPanel)?.setData(data);
        if (data.platforms.length > 0) dataFreshness.recordUpdate('giving', data.platforms.length);
      }),
    });

    if (SITE_VARIANT === 'full') {
      const needsIntelligence = [
        'insights', 'cii', 'ucdp-events', 'population-exposure'
      ].some(p => this.ctx.panelSettings[p]?.enabled);

      if (needsIntelligence) {
        tasks.push({ name: 'intelligence', task: runGuarded('intelligence', () => this.loadIntelligenceSignals()) });
      }
    }

    if (SITE_VARIANT === 'full') {
      if (this.ctx.mapLayers.fires || this.ctx.panelSettings['satellite-fires']?.enabled) {
        tasks.push({ name: 'firms', task: runGuarded('firms', () => this.loadFirmsData()) });
      }
    }
    if (this.ctx.mapLayers.natural) tasks.push({ name: 'natural', task: runGuarded('natural', () => this.loadNatural()) });
    if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.weather) tasks.push({ name: 'weather', task: runGuarded('weather', () => this.loadWeatherAlerts()) });
    if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.ais) tasks.push({ name: 'ais', task: runGuarded('ais', () => this.loadAisSignals()) });
    if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.cables) tasks.push({ name: 'cables', task: runGuarded('cables', () => this.loadCableActivity()) });
    if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.cables) tasks.push({ name: 'cableHealth', task: runGuarded('cableHealth', () => this.loadCableHealth()) });
    if (SITE_VARIANT !== 'happy' && this.ctx.mapLayers.flights) tasks.push({ name: 'flights', task: runGuarded('flights', () => this.loadFlightDelays()) });
    if (SITE_VARIANT !== 'happy' && CYBER_LAYER_ENABLED && this.ctx.mapLayers.cyberThreats) tasks.push({ name: 'cyberThreats', task: runGuarded('cyberThreats', () => this.loadCyberThreats()) });
    if (SITE_VARIANT !== 'happy' && (this.ctx.mapLayers.techEvents || SITE_VARIANT === 'tech')) tasks.push({ name: 'techEvents', task: runGuarded('techEvents', () => this.loadTechEvents()) });

    if (SITE_VARIANT === 'tech') {
      tasks.push({ name: 'techReadiness', task: runGuarded('techReadiness', () => (this.ctx.panels['tech-readiness'] as TechReadinessPanel)?.refresh()) });
    }

    const results = await Promise.allSettled(tasks.map(t => t.task));

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`[App] ${tasks[idx]?.name} load failed:`, result.reason);
      }
    });

    this.updateSearchIndex();
  }

  async loadDataForLayer(layer: keyof MapLayers): Promise<void> {
    if (this.ctx.isDestroyed || this.ctx.inFlight.has(layer)) return;
    this.ctx.inFlight.add(layer);
    this.ctx.map?.setLayerLoading(layer, true);
    try {
      switch (layer) {
        case 'natural':
          await this.loadNatural();
          break;
        case 'fires':
          await this.loadFirmsData();
          break;
        case 'weather':
          await this.loadWeatherAlerts();
          break;
        case 'outages':
          await this.loadOutages();
          break;
        case 'cyberThreats':
          await this.loadCyberThreats();
          break;
        case 'ais':
          await this.loadAisSignals();
          break;
        case 'cables':
          await Promise.all([this.loadCableActivity(), this.loadCableHealth()]);
          break;
        case 'protests':
          await this.loadProtests();
          break;
        case 'flights':
          await this.loadFlightDelays();
          break;
        case 'military':
          await this.loadMilitary();
          break;
        case 'techEvents':
          console.log('[loadDataForLayer] Loading techEvents...');
          await this.loadTechEvents();
          console.log('[loadDataForLayer] techEvents loaded');
          break;
        case 'positiveEvents':
          await this.loadPositiveEvents();
          break;
        case 'kindness':
          this.loadKindnessData();
          break;
        case 'ucdpEvents':
        case 'displacement':
        case 'climate':
          await this.loadIntelligenceSignals();
          break;
      }
    } finally {
      this.ctx.inFlight.delete(layer);
      this.ctx.map?.setLayerLoading(layer, false);
    }
  }

  private findFlashLocation(title: string): { lat: number; lon: number } | null {
    const titleLower = title.toLowerCase();
    let bestMatch: { lat: number; lon: number; matches: number } | null = null;

    const countKeywordMatches = (keywords: string[] | undefined): number => {
      if (!keywords) return 0;
      let matches = 0;
      for (const keyword of keywords) {
        const cleaned = keyword.trim().toLowerCase();
        if (cleaned.length >= 3 && titleLower.includes(cleaned)) {
          matches++;
        }
      }
      return matches;
    };

    for (const hotspot of INTEL_HOTSPOTS) {
      const matches = countKeywordMatches(hotspot.keywords);
      if (matches > 0 && (!bestMatch || matches > bestMatch.matches)) {
        bestMatch = { lat: hotspot.lat, lon: hotspot.lon, matches };
      }
    }

    for (const conflict of CONFLICT_ZONES) {
      const matches = countKeywordMatches(conflict.keywords);
      if (matches > 0 && (!bestMatch || matches > bestMatch.matches)) {
        bestMatch = { lat: conflict.center[1], lon: conflict.center[0], matches };
      }
    }

    return bestMatch;
  }

  private flashMapForNews(items: NewsItem[]): void {
    if (!this.ctx.map || !this.ctx.initialLoadComplete) return;
    if (!getAiFlowSettings().mapNewsFlash) return;
    const now = Date.now();

    for (const [key, timestamp] of this.mapFlashCache.entries()) {
      if (now - timestamp > this.MAP_FLASH_COOLDOWN_MS) {
        this.mapFlashCache.delete(key);
      }
    }

    for (const item of items) {
      const cacheKey = `${item.source}|${item.link || item.title}`;
      const lastSeen = this.mapFlashCache.get(cacheKey);
      if (lastSeen && now - lastSeen < this.MAP_FLASH_COOLDOWN_MS) {
        continue;
      }

      const location = this.findFlashLocation(item.title);
      if (!location) continue;

      this.ctx.map.flashLocation(location.lat, location.lon);
      this.mapFlashCache.set(cacheKey, now);
    }
  }

  getTimeRangeWindowMs(range: TimeRange): number {
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };
    return ranges[range];
  }

  filterItemsByTimeRange(items: NewsItem[], range: TimeRange = this.ctx.currentTimeRange): NewsItem[] {
    if (range === 'all') return items;
    const cutoff = Date.now() - this.getTimeRangeWindowMs(range);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  getTimeRangeLabel(range: TimeRange = this.ctx.currentTimeRange): string {
    const labels: Record<TimeRange, string> = {
      '1h': 'the last hour',
      '6h': 'the last 6 hours',
      '24h': 'the last 24 hours',
      '48h': 'the last 48 hours',
      '7d': 'the last 7 days',
      'all': 'all time',
    };
    return labels[range];
  }

  renderNewsForCategory(category: string, items: NewsItem[]): void {
    this.ctx.newsByCategory[category] = items;
    const panel = this.ctx.newsPanels[category];
    if (!panel) return;
    const filteredItems = this.filterItemsByTimeRange(items);
    if (filteredItems.length === 0 && items.length > 0) {
      panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
      return;
    }
    panel.renderNews(filteredItems);
  }

  applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      this.renderNewsForCategory(category, items);
    });
  }

  applyTimeRangeFilterDebounced(): void {
    this.applyTimeRangeFilterToNewsPanelsDebounced();
  }

  private async loadNewsCategory(category: string, feeds: typeof FEEDS.politics, digest?: ListFeedDigestResponse | null): Promise<NewsItem[]> {
    try {
      const panel = this.ctx.newsPanels[category];

      const enabledFeeds = (feeds ?? []).filter(f => !this.ctx.disabledSources.has(f.name));
      if (enabledFeeds.length === 0) {
        delete this.ctx.newsByCategory[category];
        if (panel) panel.showError(t('common.allSourcesDisabled'));
        this.ctx.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
          status: 'ok',
          itemCount: 0,
        });
        return [];
      }

      // Digest branch: server already aggregated feeds — map proto items to client types
      if (digest?.categories && category in digest.categories) {
        const enabledNames = new Set(enabledFeeds.map(f => f.name));
        let items = (digest.categories[category]?.items ?? [])
          .map(protoItemToNewsItem)
          .filter(i => enabledNames.has(i.source));

        ingestHeadlines(items.map(i => ({ title: i.title, pubDate: i.pubDate, source: i.source, link: i.link })));

        const aiCandidates = items
          .filter(i => i.threat?.source === 'keyword')
          .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
          .slice(0, AI_CLASSIFY_MAX_PER_FEED);
        for (const item of aiCandidates) {
          if (!canQueueAiClassification(item.title)) continue;
          classifyWithAI(item.title, SITE_VARIANT).then(ai => {
            if (ai && item.threat && ai.confidence > item.threat.confidence) {
              item.threat = ai;
              item.isAlert = ai.level === 'critical' || ai.level === 'high';
            }
          }).catch(() => {});
        }

        this.flashMapForNews(items);
        this.renderNewsForCategory(category, items);

        this.ctx.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
          status: 'ok',
          itemCount: items.length,
        });

        if (panel) {
          try {
            const baseline = await updateBaseline(`news:${category}`, items.length);
            const deviation = calculateDeviation(items.length, baseline);
            panel.setDeviation(deviation.zScore, deviation.percentChange, deviation.level);
          } catch (e) { console.warn(`[Baseline] news:${category} write failed:`, e); }
        }

        return items;
      }

      // Per-feed fallback: fetch each feed individually (first load or digest unavailable)
      const renderIntervalMs = 100;
      let lastRenderTime = 0;
      let renderTimeout: ReturnType<typeof setTimeout> | null = null;
      let pendingItems: NewsItem[] | null = null;

      const flushPendingRender = () => {
        if (!pendingItems) return;
        this.renderNewsForCategory(category, pendingItems);
        pendingItems = null;
        lastRenderTime = Date.now();
      };

      const scheduleRender = (partialItems: NewsItem[]) => {
        if (!panel) return;
        pendingItems = partialItems;
        const elapsed = Date.now() - lastRenderTime;
        if (elapsed >= renderIntervalMs) {
          if (renderTimeout) {
            clearTimeout(renderTimeout);
            renderTimeout = null;
          }
          flushPendingRender();
          return;
        }

        if (!renderTimeout) {
          renderTimeout = setTimeout(() => {
            renderTimeout = null;
            flushPendingRender();
          }, renderIntervalMs - elapsed);
        }
      };

      const items = await fetchCategoryFeeds(enabledFeeds, {
        onBatch: (partialItems) => {
          scheduleRender(partialItems);
          this.flashMapForNews(partialItems);
        },
      });

      this.renderNewsForCategory(category, items);
      if (panel) {
        if (renderTimeout) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
          pendingItems = null;
        }

        if (items.length === 0) {
          const failures = getFeedFailures();
          const failedFeeds = enabledFeeds.filter(f => failures.has(f.name));
          if (failedFeeds.length > 0) {
            const names = failedFeeds.map(f => f.name).join(', ');
            panel.showError(`${t('common.noNewsAvailable')} (${names} failed)`);
          }
        }

        try {
          const baseline = await updateBaseline(`news:${category}`, items.length);
          const deviation = calculateDeviation(items.length, baseline);
          panel.setDeviation(deviation.zScore, deviation.percentChange, deviation.level);
        } catch (e) { console.warn(`[Baseline] news:${category} write failed:`, e); }
      }

      this.ctx.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
        status: 'ok',
        itemCount: items.length,
      });
      this.ctx.statusPanel?.updateApi('RSS2JSON', { status: 'ok' });

      return items;
    } catch (error) {
      this.ctx.statusPanel?.updateFeed(category.charAt(0).toUpperCase() + category.slice(1), {
        status: 'error',
        errorMessage: String(error),
      });
      this.ctx.statusPanel?.updateApi('RSS2JSON', { status: 'error' });
      delete this.ctx.newsByCategory[category];
      return [];
    }
  }

  async loadNews(): Promise<void> {
    // Reset happy variant accumulator for fresh pipeline run
    if (SITE_VARIANT === 'happy') {
      this.ctx.happyAllItems = [];
    }

    // Fire digest fetch early (non-blocking) — await before category loop
    const digestPromise = this.tryFetchDigest();

    const categories = Object.entries(FEEDS)
      .filter((entry): entry is [string, typeof FEEDS[keyof typeof FEEDS]] => Array.isArray(entry[1]) && entry[1].length > 0)
      .map(([key, feeds]) => ({ key, feeds }));

    const digest = await digestPromise;

    const maxCategoryConcurrency = SITE_VARIANT === 'tech' ? 4 : 5;
    const categoryConcurrency = Math.max(1, Math.min(maxCategoryConcurrency, categories.length));
    const categoryResults: PromiseSettledResult<NewsItem[]>[] = [];
    for (let i = 0; i < categories.length; i += categoryConcurrency) {
      const chunk = categories.slice(i, i + categoryConcurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map(({ key, feeds }) => this.loadNewsCategory(key, feeds, digest))
      );
      categoryResults.push(...chunkResults);
    }

    const collectedNews: NewsItem[] = [];
    categoryResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const items = result.value;
        // Tag items with content categories for happy variant
        if (SITE_VARIANT === 'happy') {
          for (const item of items) {
            item.happyCategory = classifyNewsItem(item.source, item.title);
          }
          // Accumulate curated items for the positive news pipeline
          this.ctx.happyAllItems = this.ctx.happyAllItems.concat(items);
        }
        collectedNews.push(...items);
      } else {
        console.error(`[App] News category ${categories[idx]?.key} failed:`, result.reason);
      }
    });

    if (SITE_VARIANT === 'full') {
      const enabledIntelSources = INTEL_SOURCES.filter(f => !this.ctx.disabledSources.has(f.name));
      const intelPanel = this.ctx.newsPanels['intel'];
      if (enabledIntelSources.length === 0) {
        delete this.ctx.newsByCategory['intel'];
        if (intelPanel) intelPanel.showError(t('common.allIntelSourcesDisabled'));
        this.ctx.statusPanel?.updateFeed('Intel', { status: 'ok', itemCount: 0 });
      } else if (digest?.categories && 'intel' in digest.categories) {
        // Digest branch for intel
        const enabledNames = new Set(enabledIntelSources.map(f => f.name));
        const intel = (digest.categories['intel']?.items ?? [])
          .map(protoItemToNewsItem)
          .filter(i => enabledNames.has(i.source));
        this.renderNewsForCategory('intel', intel);
        if (intelPanel) {
          try {
            const baseline = await updateBaseline('news:intel', intel.length);
            const deviation = calculateDeviation(intel.length, baseline);
            intelPanel.setDeviation(deviation.zScore, deviation.percentChange, deviation.level);
          } catch (e) { console.warn('[Baseline] news:intel write failed:', e); }
        }
        this.ctx.statusPanel?.updateFeed('Intel', { status: 'ok', itemCount: intel.length });
        collectedNews.push(...intel);
        this.flashMapForNews(intel);
      } else {
        const intelResult = await Promise.allSettled([fetchCategoryFeeds(enabledIntelSources)]);
        if (intelResult[0]?.status === 'fulfilled') {
          const intel = intelResult[0].value;
          this.renderNewsForCategory('intel', intel);
          if (intelPanel) {
            try {
              const baseline = await updateBaseline('news:intel', intel.length);
              const deviation = calculateDeviation(intel.length, baseline);
              intelPanel.setDeviation(deviation.zScore, deviation.percentChange, deviation.level);
            } catch (e) { console.warn('[Baseline] news:intel write failed:', e); }
          }
          this.ctx.statusPanel?.updateFeed('Intel', { status: 'ok', itemCount: intel.length });
          collectedNews.push(...intel);
          this.flashMapForNews(intel);
        } else {
          delete this.ctx.newsByCategory['intel'];
          console.error('[App] Intel feed failed:', intelResult[0]?.reason);
        }
      }
    }

    this.ctx.allNews = collectedNews;
    this.ctx.initialLoadComplete = true;
    // maybeShowDownloadBanner();
    // mountCommunityWidget();
    updateAndCheck([
      { type: 'news', region: 'global', count: collectedNews.length },
    ]).then(anomalies => {
      if (anomalies.length > 0) signalAggregator.ingestTemporalAnomalies(anomalies);
    }).catch(() => { });

    this.ctx.map?.updateHotspotActivity(this.ctx.allNews);

    this.updateMonitorResults();

    try {
      this.ctx.latestClusters = mlWorker.isAvailable
        ? await clusterNewsHybrid(this.ctx.allNews)
        : await analysisWorker.clusterNews(this.ctx.allNews);

      if (this.ctx.latestClusters.length > 0) {
        const insightsPanel = this.ctx.panels['insights'] as InsightsPanel | undefined;
        insightsPanel?.updateInsights(this.ctx.latestClusters);
      }

      const geoLocated = this.ctx.latestClusters
        .map(c => {
          const loc = c.allItems.find(i => i.lat != null && i.lon != null);
          return { ...c, lat: c.lat ?? loc?.lat, lon: c.lon ?? loc?.lon };
        })
        .filter((c): c is typeof c & { lat: number; lon: number } => c.lat != null && c.lon != null)
        .map(c => ({
          lat: c.lat,
          lon: c.lon,
          title: c.primaryTitle,
          threatLevel: c.threat?.level ?? 'info',
          timestamp: c.lastUpdated,
          items: c.allItems,
        }));
      this.ctx.map?.setNewsLocations(geoLocated);
    } catch (error) {
      console.error('[App] Clustering failed, clusters unchanged:', error);
    }

    // Happy variant: run multi-stage positive news pipeline + map layers
    if (SITE_VARIANT === 'happy') {
      await this.loadHappySupplementaryAndRender();
      await Promise.allSettled([
        this.ctx.mapLayers.positiveEvents ? this.loadPositiveEvents() : Promise.resolve(),
        this.ctx.mapLayers.kindness ? Promise.resolve(this.loadKindnessData()) : Promise.resolve(),
      ]);
    }
  }



  async loadNatural(): Promise<void> {
    const [earthquakeResult, eonetResult] = await Promise.allSettled([
      fetchEarthquakes(),
      fetchNaturalEvents(30),
    ]);

    if (earthquakeResult.status === 'fulfilled') {
      this.ctx.intelligenceCache.earthquakes = earthquakeResult.value;
      this.ctx.map?.setEarthquakes(earthquakeResult.value);
      ingestEarthquakes(earthquakeResult.value);
      this.ctx.statusPanel?.updateApi('USGS', { status: 'ok' });
      dataFreshness.recordUpdate('usgs', earthquakeResult.value.length);
    } else {
      this.ctx.intelligenceCache.earthquakes = [];
      this.ctx.map?.setEarthquakes([]);
      this.ctx.statusPanel?.updateApi('USGS', { status: 'error' });
      dataFreshness.recordError('usgs', String(earthquakeResult.reason));
    }

    if (eonetResult.status === 'fulfilled') {
      this.ctx.map?.setNaturalEvents(eonetResult.value);
      this.ctx.statusPanel?.updateFeed('EONET', {
        status: 'ok',
        itemCount: eonetResult.value.length,
      });
      this.ctx.statusPanel?.updateApi('NASA EONET', { status: 'ok' });
    } else {
      this.ctx.map?.setNaturalEvents([]);
      this.ctx.statusPanel?.updateFeed('EONET', { status: 'error', errorMessage: String(eonetResult.reason) });
      this.ctx.statusPanel?.updateApi('NASA EONET', { status: 'error' });
    }

    const hasEarthquakes = earthquakeResult.status === 'fulfilled' && earthquakeResult.value.length > 0;
    const hasEonet = eonetResult.status === 'fulfilled' && eonetResult.value.length > 0;
    this.ctx.map?.setLayerReady('natural', hasEarthquakes || hasEonet);
  }

  async loadTechEvents(): Promise<void> {
    console.log('[loadTechEvents] Called. SITE_VARIANT:', SITE_VARIANT, 'techEvents layer:', this.ctx.mapLayers.techEvents);
    if (SITE_VARIANT !== 'tech' && !this.ctx.mapLayers.techEvents) {
      console.log('[loadTechEvents] Skipping - not tech variant and layer disabled');
      return;
    }

    try {
      const client = new ResearchServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });
      const data = await client.listTechEvents({
        type: 'conference',
        mappable: true,
        days: 90,
        limit: 50,
      });
      if (!data.success) throw new Error(data.error || 'Unknown error');

      const now = new Date();
      const mapEvents = data.events.map((e: any) => ({
        id: e.id,
        title: e.title,
        location: e.location,
        lat: e.coords?.lat ?? 0,
        lng: e.coords?.lng ?? 0,
        country: e.coords?.country ?? '',
        startDate: e.startDate,
        endDate: e.endDate,
        url: e.url,
        daysUntil: Math.ceil((new Date(e.startDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));

      this.ctx.map?.setTechEvents(mapEvents);
      this.ctx.map?.setLayerReady('techEvents', mapEvents.length > 0);
      this.ctx.statusPanel?.updateFeed('Tech Events', { status: 'ok', itemCount: mapEvents.length });

      if (SITE_VARIANT === 'tech' && this.ctx.searchModal) {
        this.ctx.searchModal.registerSource('techevent', mapEvents.map((e: { id: string; title: string; location: string; startDate: string }) => ({
          id: e.id,
          title: e.title,
          subtitle: `${e.location} • ${new Date(e.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          data: e,
        })));
      }
    } catch (error) {
      console.error('[App] Failed to load tech events:', error);
      this.ctx.map?.setTechEvents([]);
      this.ctx.map?.setLayerReady('techEvents', false);
      this.ctx.statusPanel?.updateFeed('Tech Events', { status: 'error', errorMessage: String(error) });
    }
  }

  async loadWeatherAlerts(): Promise<void> {
    try {
      const alerts = await fetchWeatherAlerts();
      this.ctx.map?.setWeatherAlerts(alerts);
      this.ctx.map?.setLayerReady('weather', alerts.length > 0);
      this.ctx.statusPanel?.updateFeed('Weather', { status: 'ok', itemCount: alerts.length });
      dataFreshness.recordUpdate('weather', alerts.length);
    } catch (error) {
      this.ctx.map?.setLayerReady('weather', false);
      this.ctx.statusPanel?.updateFeed('Weather', { status: 'error' });
      dataFreshness.recordError('weather', String(error));
    }
  }

  async loadIntelligenceSignals(): Promise<void> {
    const tasks: Promise<void>[] = [];

    tasks.push((async () => {
      try {
        const outages = await fetchInternetOutages();
        this.ctx.intelligenceCache.outages = outages;
        ingestOutagesForCII(outages);
        signalAggregator.ingestOutages(outages);
        dataFreshness.recordUpdate('outages', outages.length);
        if (this.ctx.mapLayers.outages) {
          this.ctx.map?.setOutages(outages);
          this.ctx.map?.setLayerReady('outages', outages.length > 0);
          this.ctx.statusPanel?.updateFeed('NetBlocks', { status: 'ok', itemCount: outages.length });
        }
      } catch (error) {
        console.error('[Intelligence] Outages fetch failed:', error);
        dataFreshness.recordError('outages', String(error));
      }
    })());

    const protestsTask = (async (): Promise<SocialUnrestEvent[]> => {
      try {
        const protestData = await fetchProtestEvents();
        this.ctx.intelligenceCache.protests = protestData;
        ingestProtests(protestData.events);
        ingestProtestsForCII(protestData.events);
        signalAggregator.ingestProtests(protestData.events);
        const protestCount = protestData.sources.acled + protestData.sources.gdelt;
        if (protestCount > 0) dataFreshness.recordUpdate('acled', protestCount);
        if (protestData.sources.gdelt > 0) dataFreshness.recordUpdate('gdelt', protestData.sources.gdelt);
        if (protestData.sources.gdelt > 0) dataFreshness.recordUpdate('gdelt_doc', protestData.sources.gdelt);
        if (this.ctx.mapLayers.protests) {
          this.ctx.map?.setProtests(protestData.events);
          this.ctx.map?.setLayerReady('protests', protestData.events.length > 0);
          const status = getProtestStatus();
          this.ctx.statusPanel?.updateFeed('Protests', {
            status: 'ok',
            itemCount: protestData.events.length,
            errorMessage: status.acledConfigured === false ? 'ACLED not configured - using GDELT only' : undefined,
          });
        }
        return protestData.events;
      } catch (error) {
        console.error('[Intelligence] Protests fetch failed:', error);
        dataFreshness.recordError('acled', String(error));
        return [];
      }
    })();
    tasks.push(protestsTask.then(() => undefined));

    /*
    tasks.push((async () => {
      try {
        const conflictData = await fetchConflictEvents();
        ingestConflictsForCII(conflictData.events);
        if (conflictData.count > 0) dataFreshness.recordUpdate('acled_conflict', conflictData.count);
      } catch (error) {
        console.error('[Intelligence] Conflict events fetch failed:', error);
        dataFreshness.recordError('acled_conflict', String(error));
      }
    })());

    tasks.push((async () => {
      try {
        const classifications = await fetchUcdpClassifications();
        ingestUcdpForCII(classifications);
        if (classifications.size > 0) dataFreshness.recordUpdate('ucdp', classifications.size);
      } catch (error) {
        console.error('[Intelligence] UCDP fetch failed:', error);
        dataFreshness.recordError('ucdp', String(error));
      }
    })());

    tasks.push((async () => {
      try {
        const summaries = await fetchHapiSummary();
        ingestHapiForCII(summaries);
        if (summaries.size > 0) dataFreshness.recordUpdate('hapi', summaries.size);
      } catch (error) {
        console.error('[Intelligence] HAPI fetch failed:', error);
        dataFreshness.recordError('hapi', String(error));
      }
    })());
    */

    tasks.push((async () => {
      try {
        if (isMilitaryVesselTrackingConfigured()) {
          initMilitaryVesselStream();
        }
        const [flightData, vesselData] = await Promise.all([
          fetchMilitaryFlights(),
          fetchMilitaryVessels(),
        ]);
        this.ctx.intelligenceCache.military = {
          flights: flightData.flights,
          flightClusters: flightData.clusters,
          vessels: vesselData.vessels,
          vesselClusters: vesselData.clusters,
        };
        fetchUSNIFleetReport().then((report) => {
          if (report) this.ctx.intelligenceCache.usniFleet = report;
        }).catch(() => {});
        ingestFlights(flightData.flights);
        ingestVessels(vesselData.vessels);
        ingestMilitaryForCII(flightData.flights, vesselData.vessels);
        signalAggregator.ingestFlights(flightData.flights);
        signalAggregator.ingestVessels(vesselData.vessels);
        dataFreshness.recordUpdate('opensky', flightData.flights.length);
        updateAndCheck([
          { type: 'military_flights', region: 'global', count: flightData.flights.length },
          { type: 'vessels', region: 'global', count: vesselData.vessels.length },
        ]).then(anomalies => {
          if (anomalies.length > 0) signalAggregator.ingestTemporalAnomalies(anomalies);
        }).catch(() => { });
        if (this.ctx.mapLayers.military) {
          this.ctx.map?.setMilitaryFlights(flightData.flights, flightData.clusters);
          this.ctx.map?.setMilitaryVessels(vesselData.vessels, vesselData.clusters);
          this.ctx.map?.updateMilitaryForEscalation(flightData.flights, vesselData.vessels);
          const militaryCount = flightData.flights.length + vesselData.vessels.length;
          this.ctx.statusPanel?.updateFeed('Military', {
            status: militaryCount > 0 ? 'ok' : 'warning',
            itemCount: militaryCount,
          });
        }
        if (!isInLearningMode()) {
          const surgeAlerts = analyzeFlightsForSurge(flightData.flights);
          if (surgeAlerts.length > 0) {
            const surgeSignals = surgeAlerts.map(surgeAlertToSignal);
            addToSignalHistory(surgeSignals);
            if (this.shouldShowIntelligenceNotifications()) this.ctx.signalModal?.show(surgeSignals);
          }
          const foreignAlerts = detectForeignMilitaryPresence(flightData.flights);
          if (foreignAlerts.length > 0) {
            const foreignSignals = foreignAlerts.map(foreignPresenceToSignal);
            addToSignalHistory(foreignSignals);
            if (this.shouldShowIntelligenceNotifications()) this.ctx.signalModal?.show(foreignSignals);
          }
        }
      } catch (error) {
        console.error('[Intelligence] Military fetch failed:', error);
        dataFreshness.recordError('opensky', String(error));
      }
    })());

    /*
    tasks.push((async () => {
      try {
        const protestEvents = await protestsTask;
        let result = await fetchUcdpEvents();
        for (let attempt = 1; attempt < 3 && !result.success; attempt++) {
          await new Promise(r => setTimeout(r, 15_000));
          result = await fetchUcdpEvents();
        }
        if (!result.success) {
          dataFreshness.recordError('ucdp_events', 'UCDP events unavailable (retaining prior event state)');
          return;
        }
        const acledEvents = protestEvents.map(e => ({
          latitude: e.lat, longitude: e.lon, event_date: e.time.toISOString(), fatalities: e.fatalities ?? 0,
        }));
        const events = deduplicateAgainstAcled(result.data, acledEvents);
        (this.ctx.panels['ucdp-events'] as UcdpEventsPanel)?.setEvents(events);
        if (this.ctx.mapLayers.ucdpEvents) {
          this.ctx.map?.setUcdpEvents(events);
        }
        if (events.length > 0) dataFreshness.recordUpdate('ucdp_events', events.length);
      } catch (error) {
        console.error('[Intelligence] UCDP events fetch failed:', error);
        dataFreshness.recordError('ucdp_events', String(error));
      }
    })());
    */

    tasks.push((async () => {
      try {
        const unhcrResult = await fetchUnhcrPopulation();
        if (!unhcrResult.ok) {
          dataFreshness.recordError('unhcr', 'UNHCR displacement unavailable (retaining prior displacement state)');
          (this.ctx.panels['displacement'] as DisplacementPanel)?.showError('UNHCR data temporarily unavailable');
          return;
        }
        const data = unhcrResult.data;
        (this.ctx.panels['displacement'] as DisplacementPanel)?.setData(data);
        ingestDisplacementForCII(data.countries);
        if (this.ctx.mapLayers.displacement && data.topFlows) {
          this.ctx.map?.setDisplacementFlows(data.topFlows);
        }
        if (data.countries.length > 0) dataFreshness.recordUpdate('unhcr', data.countries.length);
      } catch (error) {
        console.error('[Intelligence] UNHCR displacement fetch failed:', error);
        dataFreshness.recordError('unhcr', String(error));
        (this.ctx.panels['displacement'] as DisplacementPanel)?.showError('Failed to load UNHCR data');
      }
    })());

    tasks.push((async () => {
      try {
        const climateResult = await fetchClimateAnomalies();
        if (!climateResult.ok) {
          dataFreshness.recordError('climate', 'Climate anomalies unavailable (retaining prior climate state)');
          (this.ctx.panels['climate'] as ClimateAnomalyPanel)?.showError('Climate data temporarily unavailable');
          return;
        }
        const anomalies = climateResult.anomalies;
        (this.ctx.panels['climate'] as ClimateAnomalyPanel)?.setAnomalies(anomalies);
        ingestClimateForCII(anomalies);
        if (this.ctx.mapLayers.climate) {
          this.ctx.map?.setClimateAnomalies(anomalies);
        }
        if (anomalies.length > 0) dataFreshness.recordUpdate('climate', anomalies.length);
      } catch (error) {
        console.error('[Intelligence] Climate anomalies fetch failed:', error);
        dataFreshness.recordError('climate', String(error));
        (this.ctx.panels['climate'] as ClimateAnomalyPanel)?.showError('Failed to load climate data');
      }
    })());

    await Promise.allSettled(tasks);

    try {
      // const ucdpEvts = (this.ctx.panels['ucdp-events'] as UcdpEventsPanel)?.getEvents?.() || [];
      const events = [
        ...(this.ctx.intelligenceCache.protests?.events || []).slice(0, 10).map(e => ({
          id: e.id, lat: e.lat, lon: e.lon, type: 'conflict' as const, name: e.title || 'Protest',
        })),
      ];
      if (events.length > 0) {
        const exposures = await enrichEventsWithExposure(events);
        (this.ctx.panels['population-exposure'] as PopulationExposurePanel)?.setExposures(exposures);
        if (exposures.length > 0) dataFreshness.recordUpdate('worldpop', exposures.length);
      } else {
        (this.ctx.panels['population-exposure'] as PopulationExposurePanel)?.setExposures([]);
      }
    } catch (error) {
      console.error('[Intelligence] Population exposure fetch failed:', error);
      dataFreshness.recordError('worldpop', String(error));
    }

    // (this.ctx.panels['cii'] as CIIPanel)?.refresh();
    console.log('[Intelligence] All signals loaded for CII calculation');
  }

  async loadOutages(): Promise<void> {
    if (this.ctx.intelligenceCache.outages) {
      const outages = this.ctx.intelligenceCache.outages;
      this.ctx.map?.setOutages(outages);
      this.ctx.map?.setLayerReady('outages', outages.length > 0);
      this.ctx.statusPanel?.updateFeed('NetBlocks', { status: 'ok', itemCount: outages.length });
      return;
    }
    try {
      const outages = await fetchInternetOutages();
      this.ctx.intelligenceCache.outages = outages;
      this.ctx.map?.setOutages(outages);
      this.ctx.map?.setLayerReady('outages', outages.length > 0);
      ingestOutagesForCII(outages);
      signalAggregator.ingestOutages(outages);
      this.ctx.statusPanel?.updateFeed('NetBlocks', { status: 'ok', itemCount: outages.length });
      dataFreshness.recordUpdate('outages', outages.length);
    } catch (error) {
      this.ctx.map?.setLayerReady('outages', false);
      this.ctx.statusPanel?.updateFeed('NetBlocks', { status: 'error' });
      dataFreshness.recordError('outages', String(error));
    }
  }

  async loadCyberThreats(): Promise<void> {
    if (!CYBER_LAYER_ENABLED) {
      this.ctx.mapLayers.cyberThreats = false;
      this.ctx.map?.setLayerReady('cyberThreats', false);
      return;
    }

    if (this.ctx.cyberThreatsCache) {
      this.ctx.map?.setCyberThreats(this.ctx.cyberThreatsCache);
      this.ctx.map?.setLayerReady('cyberThreats', this.ctx.cyberThreatsCache.length > 0);
      this.ctx.statusPanel?.updateFeed('Cyber Threats', { status: 'ok', itemCount: this.ctx.cyberThreatsCache.length });
      return;
    }

    try {
      const threats = await fetchCyberThreats({ limit: 500, days: 14 });
      this.ctx.cyberThreatsCache = threats;
      this.ctx.map?.setCyberThreats(threats);
      this.ctx.map?.setLayerReady('cyberThreats', threats.length > 0);
      this.ctx.statusPanel?.updateFeed('Cyber Threats', { status: 'ok', itemCount: threats.length });
      this.ctx.statusPanel?.updateApi('Cyber Threats API', { status: 'ok' });
      dataFreshness.recordUpdate('cyber_threats', threats.length);
    } catch (error) {
      this.ctx.map?.setLayerReady('cyberThreats', false);
      this.ctx.statusPanel?.updateFeed('Cyber Threats', { status: 'error', errorMessage: String(error) });
      this.ctx.statusPanel?.updateApi('Cyber Threats API', { status: 'error' });
      dataFreshness.recordError('cyber_threats', String(error));
    }
  }

  async loadAisSignals(): Promise<void> {
    try {
      const { disruptions, density } = await fetchAisSignals();
      const aisStatus = getAisStatus();
      console.log('[Ships] Events:', { disruptions: disruptions.length, density: density.length, vessels: aisStatus.vessels });
      this.ctx.map?.setAisData(disruptions, density);
      signalAggregator.ingestAisDisruptions(disruptions);
      updateAndCheck([
        { type: 'ais_gaps', region: 'global', count: disruptions.length },
      ]).then(anomalies => {
        if (anomalies.length > 0) signalAggregator.ingestTemporalAnomalies(anomalies);
      }).catch(() => { });

      const hasData = disruptions.length > 0 || density.length > 0;
      this.ctx.map?.setLayerReady('ais', hasData);

      const shippingCount = disruptions.length + density.length;
      const shippingStatus = shippingCount > 0 ? 'ok' : (aisStatus.connected ? 'warning' : 'error');
      this.ctx.statusPanel?.updateFeed('Shipping', {
        status: shippingStatus,
        itemCount: shippingCount,
        errorMessage: !aisStatus.connected && shippingCount === 0 ? 'AIS snapshot unavailable' : undefined,
      });
      this.ctx.statusPanel?.updateApi('AISStream', {
        status: aisStatus.connected ? 'ok' : 'warning',
      });
      if (hasData) {
        dataFreshness.recordUpdate('ais', shippingCount);
      }
    } catch (error) {
      this.ctx.map?.setLayerReady('ais', false);
      this.ctx.statusPanel?.updateFeed('Shipping', { status: 'error', errorMessage: String(error) });
      this.ctx.statusPanel?.updateApi('AISStream', { status: 'error' });
      dataFreshness.recordError('ais', String(error));
    }
  }

  waitForAisData(): void {
    const maxAttempts = 30;
    let attempts = 0;

    const checkData = () => {
      if (this.ctx.isDestroyed) return;
      attempts++;
      const status = getAisStatus();

      if (status.vessels > 0 || status.connected) {
        this.loadAisSignals();
        this.ctx.map?.setLayerLoading('ais', false);
        return;
      }

      if (attempts >= maxAttempts) {
        this.ctx.map?.setLayerLoading('ais', false);
        this.ctx.map?.setLayerReady('ais', false);
        this.ctx.statusPanel?.updateFeed('Shipping', {
          status: 'error',
          errorMessage: 'Connection timeout'
        });
        return;
      }

      setTimeout(checkData, 1000);
    };

    checkData();
  }

  async loadCableActivity(): Promise<void> {
    try {
      const activity = await fetchCableActivity();
      this.ctx.map?.setCableActivity(activity.advisories, activity.repairShips);
      const itemCount = activity.advisories.length + activity.repairShips.length;
      this.ctx.statusPanel?.updateFeed('CableOps', { status: 'ok', itemCount });
    } catch {
      this.ctx.statusPanel?.updateFeed('CableOps', { status: 'error' });
    }
  }

  async loadCableHealth(): Promise<void> {
    try {
      const healthData = await fetchCableHealth();
      this.ctx.map?.setCableHealth(healthData.cables);
      const cableIds = Object.keys(healthData.cables);
      const faultCount = cableIds.filter((id) => healthData.cables[id]?.status === 'fault').length;
      const degradedCount = cableIds.filter((id) => healthData.cables[id]?.status === 'degraded').length;
      this.ctx.statusPanel?.updateFeed('CableHealth', { status: 'ok', itemCount: faultCount + degradedCount });
    } catch {
      this.ctx.statusPanel?.updateFeed('CableHealth', { status: 'error' });
    }
  }

  async loadProtests(): Promise<void> {
    if (this.ctx.intelligenceCache.protests) {
      const protestData = this.ctx.intelligenceCache.protests;
      this.ctx.map?.setProtests(protestData.events);
      this.ctx.map?.setLayerReady('protests', protestData.events.length > 0);
      const status = getProtestStatus();
      this.ctx.statusPanel?.updateFeed('Protests', {
        status: 'ok',
        itemCount: protestData.events.length,
        errorMessage: status.acledConfigured === false ? 'ACLED not configured - using GDELT only' : undefined,
      });
      if (status.acledConfigured === true) {
        this.ctx.statusPanel?.updateApi('ACLED', { status: 'ok' });
      } else if (status.acledConfigured === null) {
        this.ctx.statusPanel?.updateApi('ACLED', { status: 'warning' });
      }
      this.ctx.statusPanel?.updateApi('GDELT Doc', { status: 'ok' });
      if (protestData.sources.gdelt > 0) dataFreshness.recordUpdate('gdelt_doc', protestData.sources.gdelt);
      return;
    }
    try {
      const protestData = await fetchProtestEvents();
      this.ctx.intelligenceCache.protests = protestData;
      this.ctx.map?.setProtests(protestData.events);
      this.ctx.map?.setLayerReady('protests', protestData.events.length > 0);
      ingestProtests(protestData.events);
      ingestProtestsForCII(protestData.events);
      signalAggregator.ingestProtests(protestData.events);
      const protestCount = protestData.sources.acled + protestData.sources.gdelt;
      if (protestCount > 0) dataFreshness.recordUpdate('acled', protestCount);
      if (protestData.sources.gdelt > 0) dataFreshness.recordUpdate('gdelt', protestData.sources.gdelt);
      if (protestData.sources.gdelt > 0) dataFreshness.recordUpdate('gdelt_doc', protestData.sources.gdelt);
      (this.ctx.panels['cii'] as CIIPanel)?.refresh();
      const status = getProtestStatus();
      this.ctx.statusPanel?.updateFeed('Protests', {
        status: 'ok',
        itemCount: protestData.events.length,
        errorMessage: status.acledConfigured === false ? 'ACLED not configured - using GDELT only' : undefined,
      });
      if (status.acledConfigured === true) {
        this.ctx.statusPanel?.updateApi('ACLED', { status: 'ok' });
      } else if (status.acledConfigured === null) {
        this.ctx.statusPanel?.updateApi('ACLED', { status: 'warning' });
      }
      this.ctx.statusPanel?.updateApi('GDELT Doc', { status: 'ok' });
    } catch (error) {
      this.ctx.map?.setLayerReady('protests', false);
      this.ctx.statusPanel?.updateFeed('Protests', { status: 'error', errorMessage: String(error) });
      this.ctx.statusPanel?.updateApi('ACLED', { status: 'error' });
      this.ctx.statusPanel?.updateApi('GDELT Doc', { status: 'error' });
      dataFreshness.recordError('gdelt_doc', String(error));
    }
  }

  async loadFlightDelays(): Promise<void> {
    try {
      const delays = await fetchFlightDelays();
      this.ctx.map?.setFlightDelays(delays);
      this.ctx.map?.setLayerReady('flights', delays.length > 0);
      this.ctx.statusPanel?.updateFeed('Flights', {
        status: 'ok',
        itemCount: delays.length,
      });
      this.ctx.statusPanel?.updateApi('FAA', { status: 'ok' });
    } catch (error) {
      this.ctx.map?.setLayerReady('flights', false);
      this.ctx.statusPanel?.updateFeed('Flights', { status: 'error', errorMessage: String(error) });
      this.ctx.statusPanel?.updateApi('FAA', { status: 'error' });
    }
  }

  async loadMilitary(): Promise<void> {
    if (this.ctx.intelligenceCache.military) {
      const { flights, flightClusters, vessels, vesselClusters } = this.ctx.intelligenceCache.military;
      this.ctx.map?.setMilitaryFlights(flights, flightClusters);
      this.ctx.map?.setMilitaryVessels(vessels, vesselClusters);
      this.ctx.map?.updateMilitaryForEscalation(flights, vessels);
      this.loadCachedPosturesForBanner();
      const insightsPanel = this.ctx.panels['insights'] as InsightsPanel | undefined;
      insightsPanel?.setMilitaryFlights(flights);
      const hasData = flights.length > 0 || vessels.length > 0;
      this.ctx.map?.setLayerReady('military', hasData);
      const militaryCount = flights.length + vessels.length;
      this.ctx.statusPanel?.updateFeed('Military', {
        status: militaryCount > 0 ? 'ok' : 'warning',
        itemCount: militaryCount,
        errorMessage: militaryCount === 0 ? 'No military activity in view' : undefined,
      });
      this.ctx.statusPanel?.updateApi('OpenSky', { status: 'ok' });
      return;
    }
    try {
      if (isMilitaryVesselTrackingConfigured()) {
        initMilitaryVesselStream();
      }
      const [flightData, vesselData] = await Promise.all([
        fetchMilitaryFlights(),
        fetchMilitaryVessels(),
      ]);
      this.ctx.intelligenceCache.military = {
        flights: flightData.flights,
        flightClusters: flightData.clusters,
        vessels: vesselData.vessels,
        vesselClusters: vesselData.clusters,
      };
      fetchUSNIFleetReport().then((report) => {
        if (report) this.ctx.intelligenceCache.usniFleet = report;
      }).catch(() => {});
      this.ctx.map?.setMilitaryFlights(flightData.flights, flightData.clusters);
      this.ctx.map?.setMilitaryVessels(vesselData.vessels, vesselData.clusters);
      ingestFlights(flightData.flights);
      ingestVessels(vesselData.vessels);
      ingestMilitaryForCII(flightData.flights, vesselData.vessels);
      signalAggregator.ingestFlights(flightData.flights);
      signalAggregator.ingestVessels(vesselData.vessels);
      updateAndCheck([
        { type: 'military_flights', region: 'global', count: flightData.flights.length },
        { type: 'vessels', region: 'global', count: vesselData.vessels.length },
      ]).then(anomalies => {
        if (anomalies.length > 0) signalAggregator.ingestTemporalAnomalies(anomalies);
      }).catch(() => { });
      this.ctx.map?.updateMilitaryForEscalation(flightData.flights, vesselData.vessels);
      (this.ctx.panels['cii'] as CIIPanel)?.refresh();
      if (!isInLearningMode()) {
        const surgeAlerts = analyzeFlightsForSurge(flightData.flights);
        if (surgeAlerts.length > 0) {
          const surgeSignals = surgeAlerts.map(surgeAlertToSignal);
          addToSignalHistory(surgeSignals);
          if (this.shouldShowIntelligenceNotifications()) this.ctx.signalModal?.show(surgeSignals);
        }
        const foreignAlerts = detectForeignMilitaryPresence(flightData.flights);
        if (foreignAlerts.length > 0) {
          const foreignSignals = foreignAlerts.map(foreignPresenceToSignal);
          addToSignalHistory(foreignSignals);
          if (this.shouldShowIntelligenceNotifications()) this.ctx.signalModal?.show(foreignSignals);
        }
      }

      this.loadCachedPosturesForBanner();
      const insightsPanel = this.ctx.panels['insights'] as InsightsPanel | undefined;
      insightsPanel?.setMilitaryFlights(flightData.flights);

      const hasData = flightData.flights.length > 0 || vesselData.vessels.length > 0;
      this.ctx.map?.setLayerReady('military', hasData);
      const militaryCount = flightData.flights.length + vesselData.vessels.length;
      this.ctx.statusPanel?.updateFeed('Military', {
        status: militaryCount > 0 ? 'ok' : 'warning',
        itemCount: militaryCount,
        errorMessage: militaryCount === 0 ? 'No military activity in view' : undefined,
      });
      this.ctx.statusPanel?.updateApi('OpenSky', { status: 'ok' });
      dataFreshness.recordUpdate('opensky', flightData.flights.length);
    } catch (error) {
      this.ctx.map?.setLayerReady('military', false);
      this.ctx.statusPanel?.updateFeed('Military', { status: 'error', errorMessage: String(error) });
      this.ctx.statusPanel?.updateApi('OpenSky', { status: 'error' });
      dataFreshness.recordError('opensky', String(error));
    }
  }

  private async loadCachedPosturesForBanner(): Promise<void> {
    try {
      const data = await fetchCachedTheaterPosture();
      if (data && data.postures.length > 0) {
        this.callbacks.renderCriticalBanner(data.postures);
        const posturePanel = this.ctx.panels['strategic-posture'] as StrategicPosturePanel | undefined;
        posturePanel?.updatePostures(data);
      }
    } catch (error) {
      console.warn('[App] Failed to load cached postures for banner:', error);
    }
  }


  async loadTradePolicy(): Promise<void> {
    const tradePanel = this.ctx.panels['trade-policy'] as TradePolicyPanel | undefined;
    if (!tradePanel) return;

    try {
      const [restrictions, tariffs, flows, barriers] = await Promise.all([
        fetchTradeRestrictions([], 50),
        fetchTariffTrends('840', '156', '', 10),
        fetchTradeFlows('840', '156', 10),
        fetchTradeBarriers([], '', 50),
      ]);

      tradePanel.updateRestrictions(restrictions);
      tradePanel.updateTariffs(tariffs);
      tradePanel.updateFlows(flows);
      tradePanel.updateBarriers(barriers);

      const totalItems = restrictions.restrictions.length + tariffs.datapoints.length + flows.flows.length + barriers.barriers.length;
      const anyUnavailable = restrictions.upstreamUnavailable || tariffs.upstreamUnavailable || flows.upstreamUnavailable || barriers.upstreamUnavailable;

      this.ctx.statusPanel?.updateApi('WTO', { status: anyUnavailable ? 'warning' : totalItems > 0 ? 'ok' : 'error' });

      if (totalItems > 0) {
        dataFreshness.recordUpdate('wto_trade', totalItems);
      } else if (anyUnavailable) {
        dataFreshness.recordError('wto_trade', 'WTO upstream temporarily unavailable');
      }
    } catch (e) {
      console.error('[App] Trade policy failed:', e);
      this.ctx.statusPanel?.updateApi('WTO', { status: 'error' });
      dataFreshness.recordError('wto_trade', String(e));
    }
  }

  async loadSupplyChain(): Promise<void> {
    const scPanel = this.ctx.panels['supply-chain'] as SupplyChainPanel | undefined;
    if (!scPanel) return;

    try {
      const [shipping, chokepoints, minerals] = await Promise.allSettled([
        fetchShippingRates(),
        fetchChokepointStatus(),
        fetchCriticalMinerals(),
      ]);

      const shippingData = shipping.status === 'fulfilled' ? shipping.value : null;
      const chokepointData = chokepoints.status === 'fulfilled' ? chokepoints.value : null;
      const mineralsData = minerals.status === 'fulfilled' ? minerals.value : null;

      if (shippingData) scPanel.updateShippingRates(shippingData);
      if (chokepointData) scPanel.updateChokepointStatus(chokepointData);
      if (mineralsData) scPanel.updateCriticalMinerals(mineralsData);

      const totalItems = (shippingData?.indices.length || 0) + (chokepointData?.chokepoints.length || 0) + (mineralsData?.minerals.length || 0);
      const anyUnavailable = shippingData?.upstreamUnavailable || chokepointData?.upstreamUnavailable || mineralsData?.upstreamUnavailable;

      this.ctx.statusPanel?.updateApi('SupplyChain', { status: anyUnavailable ? 'warning' : totalItems > 0 ? 'ok' : 'error' });

      if (totalItems > 0) {
        dataFreshness.recordUpdate('supply_chain', totalItems);
      } else if (anyUnavailable) {
        dataFreshness.recordError('supply_chain', 'Supply chain upstream temporarily unavailable');
      }
    } catch (e) {
      console.error('[App] Supply chain failed:', e);
      this.ctx.statusPanel?.updateApi('SupplyChain', { status: 'error' });
      dataFreshness.recordError('supply_chain', String(e));
    }
  }

  updateMonitorResults(): void {
    const monitorPanel = this.ctx.panels['monitors'] as MonitorPanel;
    monitorPanel.renderResults(this.ctx.allNews);
  }

  async runCorrelationAnalysis(): Promise<void> {
    try {
      if (this.ctx.latestClusters.length === 0 && this.ctx.allNews.length > 0) {
        this.ctx.latestClusters = mlWorker.isAvailable
          ? await clusterNewsHybrid(this.ctx.allNews)
          : await analysisWorker.clusterNews(this.ctx.allNews);
      }

      if (this.ctx.latestClusters.length > 0) {
        ingestNewsForCII(this.ctx.latestClusters);
        dataFreshness.recordUpdate('gdelt', this.ctx.latestClusters.length);
        (this.ctx.panels['cii'] as CIIPanel)?.refresh();
      }

      const signals = await analysisWorker.analyzeCorrelations(
        this.ctx.latestClusters,
        this.ctx.latestPredictions,
        this.ctx.latestMarkets
      );

      let geoSignals: ReturnType<typeof geoConvergenceToSignal>[] = [];
      if (!isInLearningMode()) {
        const geoAlerts = detectGeoConvergence(this.ctx.seenGeoAlerts);
        geoSignals = geoAlerts.map(geoConvergenceToSignal);
      }

      const keywordSpikeSignals = drainTrendingSignals();
      const allSignals = [...signals, ...geoSignals, ...keywordSpikeSignals];
      if (allSignals.length > 0) {
        addToSignalHistory(allSignals);
        if (this.shouldShowIntelligenceNotifications()) this.ctx.signalModal?.show(allSignals);
      }
    } catch (error) {
      console.error('[App] Correlation analysis failed:', error);
    }
  }

  async loadFirmsData(): Promise<void> {
    try {
      const fireResult = await fetchAllFires(1);
      if (fireResult.skipped) {
        this.ctx.panels['satellite-fires']?.showConfigError('NASA_FIRMS_API_KEY not configured — add in Settings');
        this.ctx.statusPanel?.updateApi('FIRMS', { status: 'error' });
        return;
      }
      const { regions, totalCount } = fireResult;
      if (totalCount > 0) {
        const flat = flattenFires(regions);
        const stats = computeRegionStats(regions);

        signalAggregator.ingestSatelliteFires(flat.map(f => ({
          lat: f.location?.latitude ?? 0,
          lon: f.location?.longitude ?? 0,
          brightness: f.brightness,
          frp: f.frp,
          region: f.region,
          acq_date: new Date(f.detectedAt).toISOString().slice(0, 10),
        })));

        this.ctx.map?.setFires(toMapFires(flat));

        (this.ctx.panels['satellite-fires'] as SatelliteFiresPanel)?.update(stats, totalCount);

        dataFreshness.recordUpdate('firms', totalCount);

        updateAndCheck([
          { type: 'satellite_fires', region: 'global', count: totalCount },
        ]).then(anomalies => {
          if (anomalies.length > 0) {
            signalAggregator.ingestTemporalAnomalies(anomalies);
          }
        }).catch(() => { });
      } else {
        (this.ctx.panels['satellite-fires'] as SatelliteFiresPanel)?.update([], 0);
      }
      this.ctx.statusPanel?.updateApi('FIRMS', { status: 'ok' });
    } catch (e) {
      console.warn('[App] FIRMS load failed:', e);
      (this.ctx.panels['satellite-fires'] as SatelliteFiresPanel)?.update([], 0);
      this.ctx.statusPanel?.updateApi('FIRMS', { status: 'error' });
      dataFreshness.recordError('firms', String(e));
    }
  }

  async loadPizzInt(): Promise<void> {
    try {
      const [status, tensions] = await Promise.all([
        fetchPizzIntStatus(),
        fetchGdeltTensions()
      ]);

      if (status.locationsMonitored === 0) {
        this.ctx.pizzintIndicator?.hide();
        this.ctx.statusPanel?.updateApi('PizzINT', { status: 'error' });
        dataFreshness.recordError('pizzint', 'No monitored locations returned');
        return;
      }

      this.ctx.pizzintIndicator?.show();
      this.ctx.pizzintIndicator?.updateStatus(status);
      this.ctx.pizzintIndicator?.updateTensions(tensions);
      this.ctx.statusPanel?.updateApi('PizzINT', { status: 'ok' });
      dataFreshness.recordUpdate('pizzint', Math.max(status.locationsMonitored, tensions.length));
    } catch (error) {
      console.error('[App] PizzINT load failed:', error);
      this.ctx.pizzintIndicator?.hide();
      this.ctx.statusPanel?.updateApi('PizzINT', { status: 'error' });
      dataFreshness.recordError('pizzint', String(error));
    }
  }

  syncDataFreshnessWithLayers(): void {
    for (const [layer, sourceIds] of Object.entries(LAYER_TO_SOURCE)) {
      const enabled = this.ctx.mapLayers[layer as keyof MapLayers] ?? false;
      for (const sourceId of sourceIds) {
        dataFreshness.setEnabled(sourceId as DataSourceId, enabled);
      }
    }

    if (!isAisConfigured()) {
      dataFreshness.setEnabled('ais', false);
    }
    if (isOutagesConfigured() === false) {
      dataFreshness.setEnabled('outages', false);
    }
  }

  private static readonly HAPPY_ITEMS_CACHE_KEY = 'happy-all-items';

  async hydrateHappyPanelsFromCache(): Promise<void> {
    try {
      type CachedItem = Omit<NewsItem, 'pubDate'> & { pubDate: number };
      const entry = await getPersistentCache<CachedItem[]>(DataLoaderManager.HAPPY_ITEMS_CACHE_KEY);
      if (!entry || !entry.data || entry.data.length === 0) return;
      if (Date.now() - entry.updatedAt > 24 * 60 * 60 * 1000) return;

      const items: NewsItem[] = entry.data.map(item => ({
        ...item,
        pubDate: new Date(item.pubDate),
      }));

      const scienceSources = ['GNN Science', 'ScienceDaily', 'Nature News', 'Live Science', 'New Scientist', 'Singularity Hub', 'Human Progress', 'Greater Good (Berkeley)'];
      this.ctx.breakthroughsPanel?.setItems(
        items.filter(item => scienceSources.includes(item.source) || item.happyCategory === 'science-health')
      );
      this.ctx.heroPanel?.setHeroStory(
        items.filter(item => item.happyCategory === 'humanity-kindness')
          .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())[0]
      );
      this.ctx.digestPanel?.setStories(
        [...items].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime()).slice(0, 5)
      );
      this.ctx.positivePanel?.renderPositiveNews(items);
    } catch (err) {
      console.warn('[App] Happy panel cache hydration failed:', err);
    }
  }

  private async loadHappySupplementaryAndRender(): Promise<void> {
    if (!this.ctx.positivePanel) return;

    const curated = [...this.ctx.happyAllItems];
    this.ctx.positivePanel.renderPositiveNews(curated);

    let supplementary: NewsItem[] = [];
    try {
      const gdeltTopics = await fetchAllPositiveTopicIntelligence();
      const gdeltItems: NewsItem[] = gdeltTopics.flatMap(topic =>
        topic.articles.map(article => ({
          source: 'GDELT',
          title: article.title,
          link: article.url,
          pubDate: article.date ? new Date(article.date) : new Date(),
          isAlert: false,
          imageUrl: article.image || undefined,
          happyCategory: classifyNewsItem('GDELT', article.title),
        }))
      );

      supplementary = await filterBySentiment(gdeltItems);
    } catch (err) {
      console.warn('[App] Happy supplementary pipeline failed, using curated only:', err);
    }

    if (supplementary.length > 0) {
      const merged = [...curated, ...supplementary];
      merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
      this.ctx.positivePanel.renderPositiveNews(merged);
    }

    const scienceSources = ['GNN Science', 'ScienceDaily', 'Nature News', 'Live Science', 'New Scientist', 'Singularity Hub', 'Human Progress', 'Greater Good (Berkeley)'];
    const scienceItems = this.ctx.happyAllItems.filter(item =>
      scienceSources.includes(item.source) || item.happyCategory === 'science-health'
    );
    this.ctx.breakthroughsPanel?.setItems(scienceItems);

    const heroItem = this.ctx.happyAllItems
      .filter(item => item.happyCategory === 'humanity-kindness')
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())[0];
    this.ctx.heroPanel?.setHeroStory(heroItem);

    const digestItems = [...this.ctx.happyAllItems]
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
      .slice(0, 5);
    this.ctx.digestPanel?.setStories(digestItems);

    setPersistentCache(
      DataLoaderManager.HAPPY_ITEMS_CACHE_KEY,
      this.ctx.happyAllItems.map(item => ({ ...item, pubDate: item.pubDate.getTime() }))
    ).catch(() => {});
  }

  private async loadPositiveEvents(): Promise<void> {
    const gdeltEvents = await fetchPositiveGeoEvents();
    const rssEvents = geocodePositiveNewsItems(
      this.ctx.happyAllItems.map(item => ({
        title: item.title,
        category: item.happyCategory,
      }))
    );
    const seen = new Set<string>();
    const merged = [...gdeltEvents, ...rssEvents].filter(e => {
      if (seen.has(e.name)) return false;
      seen.add(e.name);
      return true;
    });
    this.ctx.map?.setPositiveEvents(merged);
  }

  private loadKindnessData(): void {
    const kindnessItems = fetchKindnessData(
      this.ctx.happyAllItems.map(item => ({
        title: item.title,
        happyCategory: item.happyCategory,
      }))
    );
    this.ctx.map?.setKindnessData(kindnessItems);
  }

  private async loadProgressData(): Promise<void> {
    const datasets = await fetchProgressData();
    this.ctx.progressPanel?.setData(datasets);
  }

  private async loadSpeciesData(): Promise<void> {
    const species = await fetchConservationWins();
    this.ctx.speciesPanel?.setData(species);
    this.ctx.map?.setSpeciesRecoveryZones(species);
    if (SITE_VARIANT === 'happy' && species.length > 0) {
      checkMilestones({
        speciesRecoveries: species.map(s => ({ name: s.commonName, status: s.recoveryStatus })),
        newSpeciesCount: species.length,
      });
    }
  }

  private async loadRenewableData(): Promise<void> {
    const data = await fetchRenewableEnergyData();
    this.ctx.renewablePanel?.setData(data);
    if (SITE_VARIANT === 'happy' && data?.globalPercentage) {
      checkMilestones({
        renewablePercent: data.globalPercentage,
      });
    }
    try {
      const capacity = await fetchEnergyCapacity();
      this.ctx.renewablePanel?.setCapacityData(capacity);
    } catch {
      // EIA failure does not break the existing World Bank gauge
    }
  }
}
