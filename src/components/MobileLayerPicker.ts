import { t } from '@/services/i18n';
import { SITE_VARIANT, MOBILE_DEFAULT_MAP_LAYERS } from '@/config';
import type { MapLayers } from '@/types';

export interface MobileLayerItem {
  key: keyof MapLayers;
  label: string;
  icon: string;
}

export interface MobileLayerCategory {
  id: string;
  title: string;
  layers: MobileLayerItem[];
}

export interface MobileLayerPickerOptions {
  container: HTMLElement;
  initialLayers: MapLayers;
  onLayerToggle: (layer: keyof MapLayers) => void;
  onResetLayers?: (layers: MapLayers) => void;
}

export class MobileLayerPicker {
  private container: HTMLElement;
  private currentLayers: MapLayers;
  private onLayerToggle: (layer: keyof MapLayers) => void;
  private onResetLayers?: (layers: MapLayers) => void;

  private fabElement: HTMLElement | null = null;
  private overlayElement: HTMLElement | null = null;
  private categories: MobileLayerCategory[] = [];
  private activeCategoryFilter: string = 'all';
  private searchQuery: string = '';
  private isOpen: boolean = false;

  constructor(options: MobileLayerPickerOptions) {
    this.container = options.container;
    this.currentLayers = { ...options.initialLayers };
    this.onLayerToggle = options.onLayerToggle;
    this.onResetLayers = options.onResetLayers;

    this.categories = this.buildCategories();
    this.init();
  }

  private buildCategories(): MobileLayerCategory[] {
    if (SITE_VARIANT === 'tech') {
      const techCategories: MobileLayerCategory[] = [
        {
          id: 'general-intel',
          title: 'General Intel',
          layers: [
            { key: 'alertStatus', label: 'Alert Status', icon: '⚠️' },
          ],
        },
        {
          id: 'tech-ecosystem',
          title: 'Tech Ecosystem',
          layers: [
            { key: 'startupHubs', label: t('components.deckgl.layers.startupHubs'), icon: '🚀' },
            { key: 'techHQs', label: t('components.deckgl.layers.techHQs'), icon: '🏢' },
            { key: 'accelerators', label: t('components.deckgl.layers.accelerators'), icon: '⚡' },
            { key: 'cloudRegions', label: t('components.deckgl.layers.cloudRegions'), icon: '☁️' },
            { key: 'techEvents', label: t('components.deckgl.layers.techEvents'), icon: '📅' },
          ],
        },
        {
          id: 'infrastructure',
          title: 'Infrastructure',
          layers: [
            { key: 'datacenters', label: t('components.deckgl.layers.aiDataCenters'), icon: '🖥️' },
            { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '🔌' },
            { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '☢️' },
          ],
        },
        {
          id: 'signals-air',
          title: 'Aviation',
          layers: [
            { key: 'flights', label: t('components.deckgl.layers.flightDelays'), icon: '✈️' },
          ],
        },
        {
          id: 'natural',
          title: 'Natural & Climate',
          layers: [
            { key: 'dayNight', label: t('components.deckgl.layers.dayNight'), icon: '🌍' },
            { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '⛈️' },
            { key: 'fires', label: t('components.deckgl.layers.fires'), icon: '🔥' },
            { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '🌋' },
          ],
        },
      ];
      return techCategories.filter(c => c.layers.length > 0);
    }

    if (SITE_VARIANT === 'finance') {
      const financeCategories: MobileLayerCategory[] = [
        {
          id: 'financial-markets',
          title: 'Financial Markets',
          layers: [
            { key: 'stockExchanges', label: t('components.deckgl.layers.stockExchanges'), icon: '🏛️' },
            { key: 'financialCenters', label: t('components.deckgl.layers.financialCenters'), icon: '💰' },
            { key: 'centralBanks', label: t('components.deckgl.layers.centralBanks'), icon: '🏦' },
            { key: 'commodityHubs', label: t('components.deckgl.layers.commodityHubs'), icon: '📦' },
            { key: 'gulfInvestments', label: t('components.deckgl.layers.gulfInvestments'), icon: '🌐' },
          ],
        },
        {
          id: 'infra-trade',
          title: 'Infrastructure',
          layers: [
            { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '🔌' },
            { key: 'pipelines', label: t('components.deckgl.layers.pipelines'), icon: '🛢️' },
            { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '☢️' },
            { key: 'waterways', label: t('components.deckgl.layers.strategicWaterways'), icon: '⚓' },
          ],
        },
        {
          id: 'intel-signals',
          title: 'Intel & Aviation',
          layers: [
            { key: 'alertStatus', label: 'Alert Status', icon: '⚠️' },
            { key: 'flights', label: t('components.deckgl.layers.flightDelays'), icon: '✈️' },
          ],
        },
        {
          id: 'natural',
          title: 'Natural & Climate',
          layers: [
            { key: 'dayNight', label: t('components.deckgl.layers.dayNight'), icon: '🌍' },
            { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '⛈️' },
            { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '🌋' },
          ],
        },
      ];
      return financeCategories.filter(c => c.layers.length > 0);
    }

    if (SITE_VARIANT === 'happy') {
      const happyCategories: MobileLayerCategory[] = [
        {
          id: 'positive-signals',
          title: 'Well-being & Kindness',
          layers: [
            { key: 'positiveEvents', label: 'Positive Events', icon: '🌟' },
            { key: 'kindness', label: 'Acts of Kindness', icon: '💚' },
            { key: 'happiness', label: 'World Happiness', icon: '😊' },
            { key: 'speciesRecovery', label: 'Species Recovery', icon: '🐾' },
            { key: 'renewableInstallations', label: 'Clean Energy', icon: '⚡' },
          ],
        },
        {
          id: 'natural',
          title: 'Natural Environment',
          layers: [
            { key: 'dayNight', label: t('components.deckgl.layers.dayNight'), icon: '🌍' },
            { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '⛈️' },
          ],
        },
      ];
      return happyCategories.filter(c => c.layers.length > 0);
    }

    // Default 'full' (geopolitical) variant
    const fullCategories: MobileLayerCategory[] = [
      {
        id: 'general-intel',
        title: 'General Intel',
        layers: [
          { key: 'alertStatus', label: 'Alert Status', icon: '⚠️' },
          { key: 'hotspots', label: t('components.deckgl.layers.intelHotspots'), icon: '🎯' },
        ],
      },
      {
        id: 'military',
        title: 'Military & Conflicts',
        layers: [
          { key: 'military', label: t('components.deckgl.layers.militaryActivity'), icon: '🛡️' },
          { key: 'conflicts', label: t('components.deckgl.layers.conflictZones'), icon: '⚔️' },
          { key: 'bases', label: t('components.deckgl.layers.militaryBases'), icon: '🏛️' },
          { key: 'nuclear', label: t('components.deckgl.layers.nuclearSites'), icon: '🏭' },
        ],
      },
      {
        id: 'infrastructure',
        title: 'Infrastructure',
        layers: [
          { key: 'pipelines', label: t('components.deckgl.layers.pipelines'), icon: '🛢️' },
          { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '🔌' },
          { key: 'spaceports', label: t('components.deckgl.layers.spaceports'), icon: '🚀' },
          { key: 'datacenters', label: t('components.deckgl.layers.aiDataCenters'), icon: '🖥️' },
          { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '☢️' },
          { key: 'irradiators', label: t('components.deckgl.layers.gammaIrradiators'), icon: '⚠️' },
          { key: 'minerals', label: t('components.deckgl.layers.criticalMinerals'), icon: '💎' },
        ],
      },
      {
        id: 'shipping-air',
        title: 'Shipping & Aviation',
        layers: [
          { key: 'ais', label: t('components.deckgl.layers.shipTraffic'), icon: '🚢' },
          { key: 'flights', label: 'Aviation', icon: '✈️' },
          { key: 'waterways', label: t('components.deckgl.layers.strategicWaterways'), icon: '⚓' },
        ],
      },
      {
        id: 'natural',
        title: 'Natural & Climate',
        layers: [
          { key: 'dayNight', label: t('components.deckgl.layers.dayNight'), icon: '🌍' },
          { key: 'weather', label: 'Weather Alerts', icon: '⛈️' },
          { key: 'fires', label: t('components.deckgl.layers.fires'), icon: '🔥' },
          { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '🌋' },
        ],
      },
    ];

    return fullCategories.filter(c => c.layers.length > 0);
  }

  private init(): void {
    this.createFab();
    this.createOverlay();
    this.updateActiveCount();
  }

  private createFab(): void {
    const existing = this.container.querySelector('#mobileLayerFab');
    if (existing) existing.remove();

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'mobile-layer-fab';
    fab.id = 'mobileLayerFab';
    fab.setAttribute('aria-label', t('components.deckgl.layersTitle') || 'Map Layers');
    fab.setAttribute('aria-haspopup', 'dialog');

    fab.innerHTML = `
      <svg class="mobile-layer-fab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
      </svg>
      <span class="mobile-layer-fab-text">${t('components.deckgl.layersTitle') || 'Layers'}</span>
      <span class="mobile-layer-fab-badge">0</span>
    `;

    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.open();
    });

    this.container.appendChild(fab);
    this.fabElement = fab;
  }

  private createOverlay(): void {
    const existing = document.getElementById('mobileLayerPickerOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'mobile-layer-picker-overlay';
    overlay.id = 'mobileLayerPickerOverlay';
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', t('components.deckgl.layersTitle') || 'Map Layers');

    const totalActive = this.getActiveLayerCount();

    overlay.innerHTML = `
      <div class="mobile-layer-picker-backdrop"></div>
      <div class="mobile-layer-picker-sheet">
        <div class="mobile-layer-sheet-handle"></div>
        <div class="mobile-layer-sheet-header">
          <div class="mobile-layer-sheet-title-group">
            <svg class="mobile-layer-sheet-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
            <span class="mobile-layer-sheet-title">${t('components.deckgl.layersTitle') || 'Map Layers'}</span>
            <span class="mobile-layer-sheet-count-badge">${totalActive} active</span>
          </div>
          <div class="mobile-layer-sheet-actions">
            <button type="button" class="mobile-layer-sheet-reset-btn" title="Reset to default layers">Reset</button>
            <button type="button" class="mobile-layer-sheet-close-btn" aria-label="Close layers">&times;</button>
          </div>
        </div>

        <div class="mobile-layer-sheet-disclaimer">
          <svg class="mobile-layer-disclaimer-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>Mobile View Active - Some layers available only on Desktop Browsers</span>
        </div>

        <div class="mobile-layer-sheet-search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" class="mobile-layer-sheet-search" placeholder="Filter layers..." autocomplete="off" autocorrect="off" spellcheck="false" />
          <button type="button" class="mobile-layer-sheet-search-clear" style="display:none;" aria-label="Clear filter">&times;</button>
        </div>

        <div class="mobile-layer-category-pills">
          <button type="button" class="mobile-layer-cat-pill active" data-cat="all">All</button>
          ${this.categories.map(c => `
            <button type="button" class="mobile-layer-cat-pill" data-cat="${c.id}">${c.title}</button>
          `).join('')}
        </div>

        <div class="mobile-layer-sheet-body">
          ${this.renderCategoriesHtml()}
        </div>

        <div class="mobile-layer-sheet-footer">
          <button type="button" class="mobile-layer-sheet-done-btn">Done (${totalActive} active)</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayElement = overlay;

    this.bindOverlayEvents();
  }

  private renderCategoriesHtml(): string {
    return this.categories.map(category => {
      const activeCount = category.layers.filter(l => Boolean(this.currentLayers[l.key])).length;
      return `
        <div class="mobile-layer-cat-section" data-cat-id="${category.id}">
          <div class="mobile-layer-cat-header">
            <span class="mobile-layer-cat-title">${category.title}</span>
            <span class="mobile-layer-cat-badge ${activeCount > 0 ? 'has-active' : ''}">
              ${activeCount}/${category.layers.length}
            </span>
          </div>
          <div class="mobile-layer-items-grid">
            ${category.layers.map(layer => {
        const isActive = Boolean(this.currentLayers[layer.key]);
        return `
                <div class="mobile-layer-item ${isActive ? 'active' : ''}" data-layer="${layer.key}" role="button" tabindex="0">
                  <div class="mobile-layer-item-left">
                    <span class="mobile-layer-item-icon">${layer.icon}</span>
                    <span class="mobile-layer-item-label">${layer.label}</span>
                  </div>
                  <div class="mobile-layer-item-switch ${isActive ? 'checked' : ''}" aria-checked="${isActive}">
                    <span class="mobile-layer-switch-thumb"></span>
                  </div>
                </div>
              `;
      }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  private bindOverlayEvents(): void {
    if (!this.overlayElement) return;

    // Backdrop click closes
    const backdrop = this.overlayElement.querySelector('.mobile-layer-picker-backdrop');
    backdrop?.addEventListener('click', () => this.close());

    // Close button
    const closeBtn = this.overlayElement.querySelector('.mobile-layer-sheet-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Done button
    const doneBtn = this.overlayElement.querySelector('.mobile-layer-sheet-done-btn');
    doneBtn?.addEventListener('click', () => this.close());

    // Reset button
    const resetBtn = this.overlayElement.querySelector('.mobile-layer-sheet-reset-btn');
    resetBtn?.addEventListener('click', () => {
      this.resetToDefaults();
    });

    // Layer item toggles
    this.overlayElement.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.mobile-layer-item') as HTMLElement | null;
      if (item) {
        const layerKey = item.dataset.layer as keyof MapLayers | undefined;
        if (layerKey) {
          this.handleLayerClick(layerKey);
        }
      }
    });

    // Search filter
    const searchInput = this.overlayElement.querySelector('.mobile-layer-sheet-search') as HTMLInputElement | null;
    const searchClear = this.overlayElement.querySelector('.mobile-layer-sheet-search-clear') as HTMLElement | null;

    searchInput?.addEventListener('input', () => {
      this.searchQuery = (searchInput.value || '').trim().toLowerCase();
      if (searchClear) {
        searchClear.style.display = this.searchQuery ? 'block' : 'none';
      }
      this.applyFilter();
    });

    searchClear?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.applyFilter();
        searchInput.focus();
      }
    });

    // Category pills
    const pillContainer = this.overlayElement.querySelector('.mobile-layer-category-pills');
    pillContainer?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.mobile-layer-cat-pill') as HTMLElement | null;
      if (!btn) return;
      const cat = btn.dataset.cat || 'all';
      this.activeCategoryFilter = cat;

      pillContainer.querySelectorAll('.mobile-layer-cat-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      this.applyFilter();

      // Scroll to category if specific
      if (cat !== 'all') {
        const targetSection = this.overlayElement?.querySelector(`.mobile-layer-cat-section[data-cat-id="${cat}"]`);
        targetSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // Touch drag down on handle to close
    const handle = this.overlayElement.querySelector('.mobile-layer-sheet-handle') as HTMLElement | null;
    let startY = 0;
    handle?.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      if (touch) {
        startY = touch.clientY;
      }
    }, { passive: true });

    handle?.addEventListener('touchend', (e) => {
      const touch = e.changedTouches[0];
      if (touch && touch.clientY - startY > 50) {
        this.close();
      }
    }, { passive: true });
  }

  private handleLayerClick(layer: keyof MapLayers): void {
    // Toggle state
    this.currentLayers[layer] = !this.currentLayers[layer];
    this.onLayerToggle(layer);

    // Update UI immediately
    this.updateItemUi(layer, Boolean(this.currentLayers[layer]));
    this.updateActiveCount();
  }

  private updateItemUi(layer: keyof MapLayers, isActive: boolean): void {
    if (!this.overlayElement) return;
    const item = this.overlayElement.querySelector(`.mobile-layer-item[data-layer="${layer}"]`);
    if (item) {
      item.classList.toggle('active', isActive);
      const switchEl = item.querySelector('.mobile-layer-item-switch');
      if (switchEl) {
        switchEl.classList.toggle('checked', isActive);
        switchEl.setAttribute('aria-checked', isActive ? 'true' : 'false');
      }
    }
  }

  private updateActiveCount(): void {
    const totalActive = this.getActiveLayerCount();

    // Update FAB badge
    if (this.fabElement) {
      const badge = this.fabElement.querySelector('.mobile-layer-fab-badge');
      if (badge) {
        badge.textContent = String(totalActive);
        badge.classList.toggle('has-active', totalActive > 0);
      }
    }

    // Update Sheet header badge and Done button
    if (this.overlayElement) {
      const sheetBadge = this.overlayElement.querySelector('.mobile-layer-sheet-count-badge');
      if (sheetBadge) {
        sheetBadge.textContent = `${totalActive} active`;
      }
      const doneBtn = this.overlayElement.querySelector('.mobile-layer-sheet-done-btn');
      if (doneBtn) {
        doneBtn.textContent = `Done (${totalActive} active)`;
      }

      // Update category badges
      this.categories.forEach(cat => {
        const catActive = cat.layers.filter(l => Boolean(this.currentLayers[l.key])).length;
        const catBadge = this.overlayElement?.querySelector(`.mobile-layer-cat-section[data-cat-id="${cat.id}"] .mobile-layer-cat-badge`);
        if (catBadge) {
          catBadge.textContent = `${catActive}/${cat.layers.length}`;
          catBadge.classList.toggle('has-active', catActive > 0);
        }
      });
    }
  }

  private getActiveLayerCount(): number {
    let count = 0;
    this.categories.forEach(cat => {
      cat.layers.forEach(l => {
        if (this.currentLayers[l.key]) count++;
      });
    });
    return count;
  }

  private applyFilter(): void {
    if (!this.overlayElement) return;

    const sections = this.overlayElement.querySelectorAll('.mobile-layer-cat-section');
    sections.forEach(sec => {
      const catId = sec.getAttribute('data-cat-id') || '';
      const matchesCat = this.activeCategoryFilter === 'all' || this.activeCategoryFilter === catId;

      if (!matchesCat) {
        (sec as HTMLElement).style.display = 'none';
        return;
      }

      let visibleItemsCount = 0;
      const items = sec.querySelectorAll('.mobile-layer-item');
      items.forEach(item => {
        const label = (item.querySelector('.mobile-layer-item-label')?.textContent || '').toLowerCase();
        const matchesSearch = !this.searchQuery || label.includes(this.searchQuery);

        (item as HTMLElement).style.display = matchesSearch ? 'flex' : 'none';
        if (matchesSearch) visibleItemsCount++;
      });

      (sec as HTMLElement).style.display = visibleItemsCount > 0 ? 'block' : 'none';
    });
  }

  public resetToDefaults(): void {
    const defaultLayers = { ...MOBILE_DEFAULT_MAP_LAYERS };
    this.currentLayers = { ...defaultLayers };
    this.onResetLayers?.(defaultLayers);

    // Re-render items UI
    this.categories.forEach(cat => {
      cat.layers.forEach(layer => {
        this.updateItemUi(layer.key, Boolean(this.currentLayers[layer.key]));
      });
    });
    this.updateActiveCount();
  }

  public setLayers(layers: MapLayers): void {
    this.currentLayers = { ...layers };
    this.categories.forEach(cat => {
      cat.layers.forEach(layer => {
        this.updateItemUi(layer.key, Boolean(this.currentLayers[layer.key]));
      });
    });
    this.updateActiveCount();
  }

  public setLayerLoading(layer: keyof MapLayers, loading: boolean): void {
    if (!this.overlayElement) return;
    const item = this.overlayElement.querySelector(`.mobile-layer-item[data-layer="${layer}"]`);
    item?.classList.toggle('loading', loading);
  }

  public setLayerReady(layer: keyof MapLayers, hasData: boolean): void {
    if (!this.overlayElement) return;
    const item = this.overlayElement.querySelector(`.mobile-layer-item[data-layer="${layer}"]`);
    item?.classList.toggle('has-data', hasData);
  }

  public open(): void {
    if (this.isOpen || !this.overlayElement) return;
    this.isOpen = true;
    this.overlayElement.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Refresh states and search
    this.searchQuery = '';
    const searchInput = this.overlayElement.querySelector('.mobile-layer-sheet-search') as HTMLInputElement | null;
    if (searchInput) searchInput.value = '';
    const searchClear = this.overlayElement.querySelector('.mobile-layer-sheet-search-clear') as HTMLElement | null;
    if (searchClear) searchClear.style.display = 'none';

    this.applyFilter();
    this.updateActiveCount();
  }

  public close(): void {
    if (!this.isOpen || !this.overlayElement) return;
    this.isOpen = false;
    this.overlayElement.classList.remove('open');
    document.body.style.overflow = '';
  }

  public destroy(): void {
    this.fabElement?.remove();
    this.overlayElement?.remove();
    this.fabElement = null;
    this.overlayElement = null;
    document.body.style.overflow = '';
  }
}
