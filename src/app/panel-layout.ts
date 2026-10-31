import type { AppContext, AppModule } from '@/app/app-context';
import type { RelatedAsset } from '@/types';
import type { TheaterPostureSummary } from '@/services/military-surge';
// Only truly foundational components are statically imported — everything else
// is dynamically imported inside createPanels() to enable Rollup code-splitting.
import { MapContainer } from '@/components/MapContainer';
import { NewsPanel } from '@/components/NewsPanel';
import { debounce, saveToStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
  STORAGE_KEYS,
  SITE_VARIANT,
} from '@/config';
import { BETA_MODE } from '@/config/beta';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';
import { trackCriticalBannerAction } from '@/services/analytics';

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
}

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private callbacks: PanelLayoutCallbacks;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private criticalBannerEl: HTMLElement | null = null;
  private lazyPanelFactories = new Map<string, () => Promise<void>>();
  private readonly applyTimeRangeFilterDebounced: () => void;

  constructor(ctx: AppContext, callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
  }

  async init(): Promise<void> {
    await this.renderLayout();
  }

  destroy(): void {
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    this.lazyPanelFactories.clear();
    if (this.criticalBannerEl) {
      this.criticalBannerEl.remove();
      this.criticalBannerEl = null;
    }
    // Clean up happy variant panels
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.countersPanel?.destroy();
    this.ctx.progressPanel?.destroy();
    this.ctx.breakthroughsPanel?.destroy();
    this.ctx.heroPanel?.destroy();
    this.ctx.digestPanel?.destroy();
    this.ctx.speciesPanel?.destroy();
    this.ctx.renewablePanel?.destroy();
  }

  async renderLayout(): Promise<void> {
    this.ctx.container.innerHTML = `
      <div class="header">
        <div class="header-left">
          <div class="variant-switcher">${(() => {
            const local = this.ctx.isDesktopApp || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            const vHref = (v: string, prod: string) => local || SITE_VARIANT === v ? '#' : prod;
            const vTarget = (v: string) => !local && SITE_VARIANT !== v ? 'target="_blank" rel="noopener"' : '';
            return `
            <a href="${vHref('full', 'https://worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'full' ? 'active' : ''}"
               data-variant="full"
               ${vTarget('full')}
               title="${t('header.world')}${SITE_VARIANT === 'full' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">🌍</span>
              <span class="variant-label">${t('header.world')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('tech', 'https://tech.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'tech' ? 'active' : ''}"
               data-variant="tech"
               ${vTarget('tech')}
               title="${t('header.tech')}${SITE_VARIANT === 'tech' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">💻</span>
              <span class="variant-label">${t('header.tech')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('finance', 'https://finance.worldmonitor.app')}"
               class="variant-option ${SITE_VARIANT === 'finance' ? 'active' : ''}"
               data-variant="finance"
               ${vTarget('finance')}
               title="${t('header.finance')}${SITE_VARIANT === 'finance' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">📈</span>
              <span class="variant-label">${t('header.finance')}</span>
            </a>
            ${SITE_VARIANT === 'happy' ? `<span class="variant-divider"></span>
            <a href="${vHref('happy', 'https://happy.worldmonitor.app')}"
               class="variant-option active"
               data-variant="happy"
               ${vTarget('happy')}
               title="Good News ${t('common.currentVariant')}">
              <span class="variant-icon">☀️</span>
              <span class="variant-label">Good News</span>
            </a>` : ''}`;
          })()}</div>
          <span class="logo">MONITOR</span><span class="version">v${__APP_VERSION__}</span>${BETA_MODE ? '<span class="beta-badge">BETA</span>' : ''}
          <a href="https://x.com/eliehabib" target="_blank" rel="noopener" class="credit-link">
            <svg class="x-logo" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            <span class="credit-text">@eliehabib</span>
          </a>
          <a href="https://github.com/koala73/worldmonitor" target="_blank" rel="noopener" class="github-link" title="${t('header.viewOnGitHub')}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>${t('header.live')}</span>
          </div>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t('components.deckgl.views.global')}</option>
              <option value="america">${t('components.deckgl.views.americas')}</option>
              <option value="mena">${t('components.deckgl.views.mena')}</option>
              <option value="eu">${t('components.deckgl.views.europe')}</option>
              <option value="asia">${t('components.deckgl.views.asia')}</option>
              <option value="latam">${t('components.deckgl.views.latam')}</option>
              <option value="africa">${t('components.deckgl.views.africa')}</option>
              <option value="oceania">${t('components.deckgl.views.oceania')}</option>
            </select>
          </div>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> ${t('header.search')}</button>
          ${this.ctx.isDesktopApp ? '' : `<button class="copy-link-btn" id="copyLinkBtn">${t('header.copyLink')}</button>`}
          <button class="theme-toggle-btn" id="headerThemeToggle" title="${t('header.toggleTheme')}">
            ${getCurrentTheme() === 'dark'
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>'}
          </button>
          ${this.ctx.isDesktopApp ? '' : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t('header.fullscreen')}">⛶</button>`}
          ${SITE_VARIANT === 'happy' ? `<button class="tv-mode-btn" id="tvModeBtn" title="TV Mode (Shift+T)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>` : ''}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="main-content">
        <div class="map-section" id="mapSection">
          <div class="panel-header">
            <div class="panel-header-left" style="display: flex; align-items: center;">
              <img src="/favico/favicon-32x32.png" alt="Logo" style="height: 20px; margin-right: 8px;">
              <span class="panel-title">C⁴ Monitoring Dashboard | OSINT</span>
            </div>
            <span class="header-clock" id="headerClock" style="margin-right: auto; padding-left: 12px;"></span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <a href="http://github.com/c-Four-International/C4Dashboard/" target="_blank" rel="noopener" class="header-action-btn icon-circle" title="GitHub Repository" aria-label="GitHub Repository">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              </a>
              <a href="https://c-four.org/" target="_blank" rel="noopener" class="header-action-btn" title="Home">
                <span>Home</span>
              </a>
            </div>
          </div>
          <div class="map-container" id="mapContainer"></div>
          ${SITE_VARIANT === 'happy' ? '<button class="tv-exit-btn" id="tvExitBtn">Exit TV Mode</button>' : ''}
          <div class="map-resize-handle" id="mapResizeHandle"></div>
        </div>
        <div class="panels-grid" id="panelsGrid"></div>
      </div>
    `;

    await this.createPanels();
  }

  renderCriticalBanner(postures: TheaterPostureSummary[]): void {
    if (this.ctx.isMobile) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
      }
      document.body.classList.remove('has-critical-banner');
      return;
    }

    const dismissedAt = sessionStorage.getItem('banner-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 30 * 60 * 1000) {
      return;
    }

    const critical = postures.filter(
      (p) => p.postureLevel === 'critical' || (p.postureLevel === 'elevated' && p.strikeCapable)
    );

    if (critical.length === 0) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
        document.body.classList.remove('has-critical-banner');
      }
      return;
    }

    const top = critical[0]!;
    const isCritical = top.postureLevel === 'critical';

    if (!this.criticalBannerEl) {
      this.criticalBannerEl = document.createElement('div');
      this.criticalBannerEl.className = 'critical-posture-banner';
      const header = document.querySelector('.header');
      if (header) header.insertAdjacentElement('afterend', this.criticalBannerEl);
    }

    document.body.classList.add('has-critical-banner');
    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
    this.criticalBannerEl.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${isCritical ? '🚨' : '⚠️'}</span>
        <span class="banner-headline">${escapeHtml(top.headline)}</span>
        <span class="banner-stats">${top.totalAircraft} aircraft • ${escapeHtml(top.summary)}</span>
        ${top.strikeCapable ? '<span class="banner-strike">STRIKE CAPABLE</span>' : ''}
      </div>
      <button class="banner-view" data-lat="${top.centerLat}" data-lon="${top.centerLon}">View Region</button>
      <button class="banner-dismiss">×</button>
    `;

    this.criticalBannerEl.querySelector('.banner-view')?.addEventListener('click', () => {
      console.log('[Banner] View Region clicked:', top.theaterId, 'lat:', top.centerLat, 'lon:', top.centerLon);
      trackCriticalBannerAction('view', top.theaterId);
      if (typeof top.centerLat === 'number' && typeof top.centerLon === 'number') {
        this.ctx.map?.setCenter(top.centerLat, top.centerLon, 4);
      } else {
        console.error('[Banner] Missing coordinates for', top.theaterId);
      }
    });

    this.criticalBannerEl.querySelector('.banner-dismiss')?.addEventListener('click', () => {
      trackCriticalBannerAction('dismiss', top.theaterId);
      this.criticalBannerEl?.classList.add('dismissed');
      document.body.classList.remove('has-critical-banner');
      sessionStorage.setItem('banner-dismissed', Date.now().toString());
    });
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        const mapSection = document.getElementById('mapSection');
        if (mapSection) {
          mapSection.classList.toggle('hidden', !config.enabled);
        }
        return;
      }
      const panel = this.ctx.panels[key];
      if (panel) {
        panel.toggle(config.enabled);
      } else if (config.enabled) {
        void this.ensurePanel(key);
      }
    });
  }

  private shouldCreatePanel(key: string): boolean {
    if (key === 'runtime-config') return this.ctx.isDesktopApp;
    const config = this.ctx.panelSettings[key] ?? DEFAULT_PANELS[key];
    return Boolean(config?.enabled);
  }

  private registerPanelLoad(key: string, factory: () => Promise<void> | void, tasks: Promise<void>[]): void {
    if (this.shouldCreatePanel(key)) {
      tasks.push(Promise.resolve(factory()));
    } else {
      this.lazyPanelFactories.set(key, async () => {
        await factory();
      });
    }
  }

  private registerNewsPanel(key: string, label: string, tasks: Promise<void>[], feedKey: string = key): void {
    this.registerPanelLoad(key, () => {
      const panel = new NewsPanel(key, label);
      this.attachRelatedAssetHandlers(panel);
      this.ctx.newsPanels[feedKey] = panel;
      this.ctx.panels[key] = panel;
    }, tasks);
  }

  async ensurePanel(key: string): Promise<void> {
    if (this.ctx.panels[key]) {
      this.ctx.panels[key]!.toggle(Boolean(this.ctx.panelSettings[key]?.enabled));
      return;
    }
    const factory = this.lazyPanelFactories.get(key);
    if (!factory) return;
    this.lazyPanelFactories.delete(key);
    await factory();
    const panel = this.ctx.panels[key];
    const panelsGrid = document.getElementById('panelsGrid');
    if (panel && panelsGrid) {
      const el = panel.getElement();
      this.makeDraggable(el, key);
      panelsGrid.appendChild(el);
      panel.toggle(Boolean(this.ctx.panelSettings[key]?.enabled));
      const existingNews = this.ctx.newsByCategory[key];
      if (existingNews && this.ctx.newsPanels[key]) {
        this.ctx.newsPanels[key]!.renderNews(this.filterItemsByTimeRange(existingNews));
      }
    }
  }

  private async createPanels(): Promise<void> {
    const panelsGrid = document.getElementById('panelsGrid')!;

    const mapContainer = document.getElementById('mapContainer') as HTMLElement;
    this.ctx.map = new MapContainer(mapContainer, {
      zoom: this.ctx.isMobile ? 2.5 : 1.0,
      pan: { x: 0, y: 0 },
      view: this.ctx.isMobile ? 'mena' : 'global',
      layers: this.ctx.mapLayers,
      timeRange: '7d',
    });

    this.ctx.map.initEscalationGetters();
    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();
    const panelTasks: Promise<void>[] = [];

    this.registerNewsPanel('politics', t('panels.politics'), panelTasks);
    this.registerNewsPanel('tech', t('panels.tech'), panelTasks);
    this.registerNewsPanel('finance', t('panels.finance'), panelTasks);

    this.registerPanelLoad('heatmap', async () => {
      const { HeatmapPanel } = await import('@/components/MarketPanel');
      this.ctx.panels['heatmap'] = new HeatmapPanel();
    }, panelTasks);

    this.registerPanelLoad('markets', async () => {
      const { MarketPanel } = await import('@/components/MarketPanel');
      this.ctx.panels['markets'] = new MarketPanel();
    }, panelTasks);

    this.registerPanelLoad('monitors', async () => {
      const { MonitorPanel } = await import('@/components/MonitorPanel');
      const monitorPanel = new MonitorPanel(this.ctx.monitors);
      this.ctx.panels['monitors'] = monitorPanel;
      monitorPanel.onChanged((monitors) => {
        this.ctx.monitors = monitors;
        saveToStorage(STORAGE_KEYS.monitors, monitors);
        this.callbacks.updateMonitorResults();
      });
    }, panelTasks);

    this.registerPanelLoad('commodities', async () => {
      const { CommoditiesPanel } = await import('@/components/MarketPanel');
      this.ctx.panels['commodities'] = new CommoditiesPanel();
    }, panelTasks);

    this.registerPanelLoad('polymarket', async () => {
      const { PredictionPanel } = await import('@/components/PredictionPanel');
      this.ctx.panels['polymarket'] = new PredictionPanel();
    }, panelTasks);

    this.registerNewsPanel('gov', t('panels.gov'), panelTasks);
    this.registerNewsPanel('intel', t('panels.intel'), panelTasks);

    this.registerPanelLoad('crypto', async () => {
      const { CryptoPanel } = await import('@/components/MarketPanel');
      this.ctx.panels['crypto'] = new CryptoPanel();
    }, panelTasks);

    this.registerNewsPanel('middleeast', t('panels.middleeast'), panelTasks);
    this.registerNewsPanel('layoffs', t('panels.layoffs'), panelTasks);
    this.registerNewsPanel('ai', t('panels.ai'), panelTasks);
    this.registerNewsPanel('startups', t('panels.startups'), panelTasks);
    this.registerNewsPanel('vcblogs', t('panels.vcblogs'), panelTasks);
    this.registerNewsPanel('regionalStartups', t('panels.regionalStartups'), panelTasks);
    this.registerNewsPanel('unicorns', t('panels.unicorns'), panelTasks);
    this.registerNewsPanel('accelerators', t('panels.accelerators'), panelTasks);
    this.registerNewsPanel('funding', t('panels.funding'), panelTasks);
    this.registerNewsPanel('producthunt', t('panels.producthunt'), panelTasks);
    this.registerNewsPanel('security', t('panels.security'), panelTasks);
    this.registerNewsPanel('policy', t('panels.policy'), panelTasks);
    this.registerNewsPanel('hardware', t('panels.hardware'), panelTasks);
    this.registerNewsPanel('cloud', t('panels.cloud'), panelTasks);
    this.registerNewsPanel('dev', t('panels.dev'), panelTasks);
    this.registerNewsPanel('github', t('panels.github'), panelTasks);
    this.registerNewsPanel('ipo', t('panels.ipo'), panelTasks);
    this.registerNewsPanel('thinktanks', t('panels.thinktanks'), panelTasks);

    this.registerPanelLoad('economic', async () => {
      const { EconomicPanel } = await import('@/components/EconomicPanel');
      this.ctx.panels['economic'] = new EconomicPanel();
    }, panelTasks);

    if (SITE_VARIANT === 'full' || SITE_VARIANT === 'finance') {
      this.registerPanelLoad('trade-policy', async () => {
        const { TradePolicyPanel } = await import('@/components/TradePolicyPanel');
        this.ctx.panels['trade-policy'] = new TradePolicyPanel();
      }, panelTasks);

      this.registerPanelLoad('supply-chain', async () => {
        const { SupplyChainPanel } = await import('@/components/SupplyChainPanel');
        this.ctx.panels['supply-chain'] = new SupplyChainPanel();
      }, panelTasks);
    }

    this.registerNewsPanel('africa', t('panels.africa'), panelTasks);
    this.registerNewsPanel('latam', t('panels.latam'), panelTasks);
    this.registerNewsPanel('asia', t('panels.asia'), panelTasks);
    this.registerNewsPanel('energy', t('panels.energy'), panelTasks);

    for (const key of Object.keys(FEEDS)) {
      if (this.ctx.newsPanels[key] || this.lazyPanelFactories.has(key)) continue;
      if (!Array.isArray((FEEDS as Record<string, unknown>)[key])) continue;
      const panelKey = (this.ctx.panels[key] || this.lazyPanelFactories.has(key)) && !this.ctx.newsPanels[key] ? `${key}-news` : key;
      if (this.ctx.panels[panelKey] || this.lazyPanelFactories.has(panelKey)) continue;
      const panelConfig = DEFAULT_PANELS[panelKey] ?? DEFAULT_PANELS[key];
      const label = panelConfig?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
      this.registerNewsPanel(panelKey, label, panelTasks, key);
    }

    if (SITE_VARIANT === 'full') {
      this.registerPanelLoad('gdelt-intel', async () => {
        const { GdeltIntelPanel } = await import('@/components/GdeltIntelPanel');
        this.ctx.panels['gdelt-intel'] = new GdeltIntelPanel();
      }, panelTasks);

      this.registerPanelLoad('social-intel', async () => {
        const { SocialMediaIntelPanel } = await import('@/components/SocialMediaIntelPanel');
        this.ctx.panels['social-intel'] = new SocialMediaIntelPanel();
      }, panelTasks);

      /*
      const ciiPanel = new CIIPanel();
      ciiPanel.setShareStoryHandler((code, name) => {
        this.callbacks.openCountryStory(code, name);
      });
      this.ctx.panels['cii'] = ciiPanel;
      */

      this.registerPanelLoad('cascade', async () => {
        const { CascadePanel } = await import('@/components/CascadePanel');
        this.ctx.panels['cascade'] = new CascadePanel();
      }, panelTasks);

      this.registerPanelLoad('satellite-fires', async () => {
        const { SatelliteFiresPanel } = await import('@/components/SatelliteFiresPanel');
        this.ctx.panels['satellite-fires'] = new SatelliteFiresPanel();
      }, panelTasks);

      this.registerPanelLoad('strategic-risk', async () => {
        const { StrategicRiskPanel } = await import('@/components/StrategicRiskPanel');
        const strategicRiskPanel = new StrategicRiskPanel();
        strategicRiskPanel.setLocationClickHandler((lat: number, lon: number) => {
          this.ctx.map?.setCenter(lat, lon, 4);
        });
        this.ctx.panels['strategic-risk'] = strategicRiskPanel;
      }, panelTasks);

      this.registerPanelLoad('strategic-posture', async () => {
        const { StrategicPosturePanel } = await import('@/components/StrategicPosturePanel');
        const strategicPosturePanel = new StrategicPosturePanel();
        strategicPosturePanel.setLocationClickHandler((lat: number, lon: number) => {
          console.log('[App] StrategicPosture handler called:', { lat, lon, hasMap: !!this.ctx.map });
          this.ctx.map?.setCenter(lat, lon, 4);
        });
        this.ctx.panels['strategic-posture'] = strategicPosturePanel;
      }, panelTasks);

      this.registerPanelLoad('displacement', async () => {
        const { DisplacementPanel } = await import('@/components/DisplacementPanel');
        const displacementPanel = new DisplacementPanel();
        displacementPanel.setCountryClickHandler((lat: number, lon: number) => {
          this.ctx.map?.setCenter(lat, lon, 4);
        });
        this.ctx.panels['displacement'] = displacementPanel;
      }, panelTasks);

      this.registerPanelLoad('climate', async () => {
        const { ClimateAnomalyPanel } = await import('@/components/ClimateAnomalyPanel');
        const climatePanel = new ClimateAnomalyPanel();
        climatePanel.setZoneClickHandler((lat: number, lon: number, anomaly?: import('@/services/climate').ClimateAnomaly) => {
          this.ctx.map?.setCenter(lat, lon, 4);
          if (anomaly) {
            this.ctx.map?.showClimateAnomaly(anomaly);
          }
        });
        this.ctx.panels['climate'] = climatePanel;
      }, panelTasks);

      this.registerPanelLoad('population-exposure', async () => {
        const { PopulationExposurePanel } = await import('@/components/PopulationExposurePanel');
        this.ctx.panels['population-exposure'] = new PopulationExposurePanel();
      }, panelTasks);
    }

    if (SITE_VARIANT === 'finance') {
      this.registerPanelLoad('gcc-investments', async () => {
        const { InvestmentsPanel } = await import('@/components/InvestmentsPanel');
        const { focusInvestmentOnMap } = await import('@/services/investments-focus');
        const investmentsPanel = new InvestmentsPanel((inv) => {
          focusInvestmentOnMap(this.ctx.map, this.ctx.mapLayers, inv.lat, inv.lon);
        });
        this.ctx.panels['gcc-investments'] = investmentsPanel;
      }, panelTasks);
    }

    if (SITE_VARIANT !== 'happy') {
      this.registerPanelLoad('live-news', async () => {
        const { LiveNewsPanel } = await import('@/components/LiveNewsPanel');
        this.ctx.panels['live-news'] = new LiveNewsPanel();
      }, panelTasks);

      this.registerPanelLoad('live-webcams', async () => {
        const { LiveWebcamsPanel } = await import('@/components/LiveWebcamsPanel');
        this.ctx.panels['live-webcams'] = new LiveWebcamsPanel();
      }, panelTasks);

      this.registerPanelLoad('events', async () => {
        const { TechEventsPanel } = await import('@/components/TechEventsPanel');
        this.ctx.panels['events'] = new TechEventsPanel('events');
      }, panelTasks);

      this.registerPanelLoad('service-status', async () => {
        const { ServiceStatusPanel } = await import('@/components/ServiceStatusPanel');
        this.ctx.panels['service-status'] = new ServiceStatusPanel();
      }, panelTasks);

      this.registerPanelLoad('tech-readiness', async () => {
        const { TechReadinessPanel } = await import('@/components/TechReadinessPanel');
        this.ctx.panels['tech-readiness'] = new TechReadinessPanel();
      }, panelTasks);

      this.registerPanelLoad('macro-signals', async () => {
        const { MacroSignalsPanel } = await import('@/components/MacroSignalsPanel');
        this.ctx.panels['macro-signals'] = new MacroSignalsPanel();
      }, panelTasks);

      this.registerPanelLoad('etf-flows', async () => {
        const { ETFFlowsPanel } = await import('@/components/ETFFlowsPanel');
        this.ctx.panels['etf-flows'] = new ETFFlowsPanel();
      }, panelTasks);

      this.registerPanelLoad('stablecoins', async () => {
        const { StablecoinPanel } = await import('@/components/StablecoinPanel');
        this.ctx.panels['stablecoins'] = new StablecoinPanel();
      }, panelTasks);
    }

    if (this.ctx.isDesktopApp) {
      this.registerPanelLoad('runtime-config', async () => {
        const { RuntimeConfigPanel } = await import('@/components/RuntimeConfigPanel');
        this.ctx.panels['runtime-config'] = new RuntimeConfigPanel({ mode: 'alert' });
      }, panelTasks);
    }

    this.registerPanelLoad('insights', async () => {
      const { InsightsPanel } = await import('@/components/InsightsPanel');
      this.ctx.panels['insights'] = new InsightsPanel();
    }, panelTasks);

    // Global Giving panel (all variants)
    this.registerPanelLoad('giving', async () => {
      const { GivingPanel } = await import('@/components/GivingPanel');
      this.ctx.panels['giving'] = new GivingPanel();
    }, panelTasks);

    // Happy variant panels
    if (SITE_VARIANT === 'happy') {
      const { PositiveNewsFeedPanel } = await import('@/components/PositiveNewsFeedPanel');
      this.ctx.positivePanel = new PositiveNewsFeedPanel();
      this.ctx.panels['positive-feed'] = this.ctx.positivePanel!;

      const { CountersPanel } = await import('@/components/CountersPanel');
      this.ctx.countersPanel = new CountersPanel();
      this.ctx.panels['counters'] = this.ctx.countersPanel!;
      this.ctx.countersPanel!.startTicking();

      const { ProgressChartsPanel } = await import('@/components/ProgressChartsPanel');
      this.ctx.progressPanel = new ProgressChartsPanel();
      this.ctx.panels['progress'] = this.ctx.progressPanel!;

      const { BreakthroughsTickerPanel } = await import('@/components/BreakthroughsTickerPanel');
      this.ctx.breakthroughsPanel = new BreakthroughsTickerPanel();
      this.ctx.panels['breakthroughs'] = this.ctx.breakthroughsPanel!;

      const { HeroSpotlightPanel } = await import('@/components/HeroSpotlightPanel');
      this.ctx.heroPanel = new HeroSpotlightPanel();
      this.ctx.panels['spotlight'] = this.ctx.heroPanel!;
      this.ctx.heroPanel!.onLocationRequest = (lat: number, lon: number) => {
        this.ctx.map?.setCenter(lat, lon, 4);
        this.ctx.map?.flashLocation(lat, lon, 3000);
      };

      const { GoodThingsDigestPanel } = await import('@/components/GoodThingsDigestPanel');
      this.ctx.digestPanel = new GoodThingsDigestPanel();
      this.ctx.panels['digest'] = this.ctx.digestPanel!;

      const { SpeciesComebackPanel } = await import('@/components/SpeciesComebackPanel');
      this.ctx.speciesPanel = new SpeciesComebackPanel();
      this.ctx.panels['species'] = this.ctx.speciesPanel!;

      const { RenewableEnergyPanel } = await import('@/components/RenewableEnergyPanel');
      this.ctx.renewablePanel = new RenewableEnergyPanel();
      this.ctx.panels['renewable'] = this.ctx.renewablePanel!;
    }

    await Promise.all(panelTasks);

    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const savedOrder = this.getSavedPanelOrder();
    let panelOrder = defaultOrder;
    if (savedOrder.length > 0) {
      const missing = defaultOrder.filter(k => !savedOrder.includes(k));
      const valid = savedOrder.filter(k => defaultOrder.includes(k));
      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1);
      const insertIdx = valid.indexOf('politics') + 1 || 0;
      const newPanels = missing.filter(k => k !== 'monitors');
      valid.splice(insertIdx, 0, ...newPanels);
      if (SITE_VARIANT !== 'happy') {
        valid.push('monitors');
      }
      panelOrder = valid;
    }

    if (SITE_VARIANT !== 'happy') {
      const liveNewsIdx = panelOrder.indexOf('live-news');
      if (liveNewsIdx > 0) {
        panelOrder.splice(liveNewsIdx, 1);
        panelOrder.unshift('live-news');
      }

      const webcamsIdx = panelOrder.indexOf('live-webcams');
      if (webcamsIdx !== -1 && webcamsIdx !== panelOrder.indexOf('live-news') + 1) {
        panelOrder.splice(webcamsIdx, 1);
        const afterNews = panelOrder.indexOf('live-news') + 1;
        panelOrder.splice(afterNews, 0, 'live-webcams');
      }
    }

    if (this.ctx.isDesktopApp) {
      const runtimeIdx = panelOrder.indexOf('runtime-config');
      if (runtimeIdx > 1) {
        panelOrder.splice(runtimeIdx, 1);
        panelOrder.splice(1, 0, 'runtime-config');
      } else if (runtimeIdx === -1) {
        panelOrder.splice(1, 0, 'runtime-config');
      }
    }

    panelOrder.forEach((key: string) => {
      const panel = this.ctx.panels[key];
      if (panel) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    this.ctx.map.onTimeRangeChanged((range) => {
      this.ctx.currentTimeRange = range;
      this.applyTimeRangeFilterDebounced();
    });

    this.applyPanelSettings();
    this.applyInitialUrlState();
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(items: import('@/types').NewsItem[], range: import('@/components').TimeRange = this.ctx.currentTimeRange): import('@/types').NewsItem[] {
    if (range === 'all') return items;
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000, '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000, 'all': Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      '1h': 'the last hour', '6h': 'the last 6 hours',
      '24h': 'the last 24 hours', '48h': 'the last 48 hours',
      '7d': 'the last 7 days', 'all': 'all time',
    };
    return labels[this.ctx.currentTimeRange] ?? 'the last 7 days';
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } = this.ctx.initialUrlState;

    if (view) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (!view) {
      if (zoom !== undefined) {
        this.ctx.map.setZoom(zoom);
      }
      if (lat !== undefined && lon !== undefined && zoom !== undefined && zoom > 2) {
        this.ctx.map.setCenter(lat, lon);
      }
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid) return;
    const order = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(order));
  }

  private attachRelatedAssetHandlers(panel: NewsPanel): void {
    panel.setRelatedAssetHandlers({
      onRelatedAssetClick: (asset) => this.handleRelatedAssetClick(asset),
      onRelatedAssetsFocus: (assets) => this.ctx.map?.highlightAssets(assets),
      onRelatedAssetsClear: () => this.ctx.map?.highlightAssets(null),
    });
  }

  private handleRelatedAssetClick(asset: RelatedAsset): void {
    if (!this.ctx.map) return;

    switch (asset.type) {
      case 'pipeline':
        this.ctx.map.enableLayer('pipelines');
        this.ctx.mapLayers.pipelines = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerPipelineClick(asset.id);
        break;
      case 'cable':
        this.ctx.map.enableLayer('cables');
        this.ctx.mapLayers.cables = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerCableClick(asset.id);
        break;
      case 'datacenter':
        this.ctx.map.enableLayer('datacenters');
        this.ctx.mapLayers.datacenters = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerDatacenterClick(asset.id);
        break;
      case 'base':
        this.ctx.map.enableLayer('bases');
        this.ctx.mapLayers.bases = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerBaseClick(asset.id);
        break;
      case 'nuclear':
        this.ctx.map.enableLayer('nuclear');
        this.ctx.mapLayers.nuclear = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerNuclearClick(asset.id);
        break;
    }
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === 'true') return;
      if (target.classList?.contains('panel-resize-handle') || target.closest?.('.panel-resize-handle')) return;
      if (target.closest('button, a, input, select, textarea, .panel-content')) return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add('dragging');
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (dragStarted) {
        el.classList.remove('dragging');
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove('dragging');
    });
  }

  private handlePanelDragMove(dragging: HTMLElement, clientX: number, clientY: number): void {
    const grid = document.getElementById('panelsGrid');
    if (!grid) return;

    dragging.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = '';

    if (!target) return;
    const targetPanel = target.closest('.panel') as HTMLElement | null;
    if (!targetPanel || targetPanel === dragging || targetPanel.classList.contains('hidden')) return;
    if (targetPanel.parentElement !== grid) return;

    const targetRect = targetPanel.getBoundingClientRect();
    const draggingRect = dragging.getBoundingClientRect();

    const children = Array.from(grid.children);
    const dragIdx = children.indexOf(dragging);
    const targetIdx = children.indexOf(targetPanel);
    if (dragIdx === -1 || targetIdx === -1) return;

    const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
    const targetMid = sameRow
      ? targetRect.left + targetRect.width / 2
      : targetRect.top + targetRect.height / 2;
    const cursorPos = sameRow ? clientX : clientY;

    if (dragIdx < targetIdx) {
      if (cursorPos > targetMid) {
        grid.insertBefore(dragging, targetPanel.nextSibling);
      }
    } else {
      if (cursorPos < targetMid) {
        grid.insertBefore(dragging, targetPanel);
      }
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === 'runtime-config') {
      return t('modals.runtimeConfig.title');
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) => group.toUpperCase());
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    INTEL_SOURCES.forEach(f => sources.add(f.name));
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }
}
