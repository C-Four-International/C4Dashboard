import { Panel } from './Panel';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { replaceChildren, rawHtml } from '@/utils/dom-utils';
import { t } from '@/services/i18n';
import {
  fetchSocialIntelBriefings,
  type SocialIntelBriefing,
  type SocialSourcePost,
  type SocialIntelResponse,
} from '@/services/social-intel';

type IntelFilter = 'all' | 'multisource' | 'bluesky' | 'telegram';

export class SocialMediaIntelPanel extends Panel {
  private briefings: SocialIntelBriefing[] = [];
  private filter: IntelFilter = 'all';
  private searchQuery = '';
  private expandedBriefings = new Set<string>();
  private isRefreshing = false;
  private responseMeta: SocialIntelResponse | null = null;

  constructor() {
    super({
      id: 'social-intel',
      title: t('panels.socialIntel') || 'Social Media Intel',
      showCount: true,
      trackActivity: true,
      infoTooltip: t('components.socialIntel.infoTooltip') || 'Live OSINT and breaking news monitor for Bluesky and Telegram. Cleans noise locally, clusters correlated events with Google AI Studio text-embedding-004, cross-references multi-source reporting, and generates air-gapped factual briefings under 25 words (cached for 3 hours).',
    });

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadData();
  }

  public async refresh(): Promise<void> {
    await this.loadData(true);
  }

  public override showLoading(message = t('components.socialIntel.loading') || 'Correlating OSINT and breaking news...'): void {
    replaceChildren(
      this.content,
      rawHtml(`
        <div class="social-intel-loading-container">
          <div class="social-intel-spinner-badge">
            <svg class="social-intel-spinner-wheel" width="30" height="30" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <circle cx="18" cy="18" r="14" stroke="rgba(0, 0, 0, 0.15)" stroke-width="3" />
              <path d="M18 4a14 14 0 0 1 14 14" stroke="#000000" stroke-width="3" stroke-linecap="round" />
            </svg>
          </div>
          <div class="social-intel-loading-text">${escapeHtml(message)}</div>
        </div>
      `),
    );
  }

  private async loadData(forceRefresh = false): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    const refreshBtn = this.content.querySelector('#social-intel-refresh-btn');
    if (refreshBtn) {
      refreshBtn.classList.add('loading');
    }

    if (this.briefings.length === 0) {
      this.showLoading();
    } else {
      this.setDataBadge('cached');
    }

    try {
      const data = await fetchSocialIntelBriefings(forceRefresh);
      this.responseMeta = data;
      this.briefings = data.briefings || [];
      this.setCount(this.briefings.length);

      const cacheState = forceRefresh ? 'live' : 'cached';
      this.setDataBadge(cacheState);

      this.render();
    } catch (err: any) {
      console.error('[SocialMediaIntelPanel] Load error:', err);
      if (this.briefings.length === 0) {
        this.showError(t('common.failedToLoad') || 'Failed to load social media intelligence briefings.');
      } else {
        this.setDataBadge('unavailable');
      }
    } finally {
      this.isRefreshing = false;
      const btn = this.content.querySelector('#social-intel-refresh-btn');
      if (btn) {
        btn.classList.remove('loading');
      }
    }
  }

  private getFilteredBriefings(): SocialIntelBriefing[] {
    return this.briefings.filter((b) => {
      // Platform / corroboration filter
      if (this.filter === 'multisource' && !b.isMultiSource) return false;
      if (this.filter === 'bluesky' && !b.platforms.includes('bluesky')) return false;
      if (this.filter === 'telegram' && !b.platforms.includes('telegram')) return false;

      // Keyword search query
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const textMatch = b.briefing.toLowerCase().includes(q);
        const sourceMatch = b.sources.some(
          (s) =>
            s.author.toLowerCase().includes(q) ||
            s.cleanedText.toLowerCase().includes(q) ||
            (s.translatedText && s.translatedText.toLowerCase().includes(q)),
        );
        if (!textMatch && !sourceMatch) return false;
      }

      return true;
    });
  }

  private render(): void {
    const filtered = this.getFilteredBriefings();

    const blueskyCount = this.briefings.filter((b) => b.platforms.includes('bluesky')).length;
    const telegramCount = this.briefings.filter((b) => b.platforms.includes('telegram')).length;
    const corroboratedCount = this.briefings.filter((b) => b.isMultiSource).length;

    const filtersHtml = `
      <div class="social-intel-toolbar" id="social-intel-toolbar">
        <div class="social-intel-filter-chips">
          <button class="social-chip ${this.filter === 'all' ? 'active' : ''}" data-filter="all">
            All (${this.briefings.length})
          </button>
          <button class="social-chip ${this.filter === 'multisource' ? 'active' : ''}" data-filter="multisource" title="Events corroborated by >= 2 independent sources">
            ⚡ Corroborated (${corroboratedCount})
          </button>
          <button class="social-chip ${this.filter === 'bluesky' ? 'active' : ''}" data-filter="bluesky">
            🦋 Bluesky (${blueskyCount})
          </button>
          <button class="social-chip ${this.filter === 'telegram' ? 'active' : ''}" data-filter="telegram">
            ✈️ Telegram (${telegramCount})
          </button>
        </div>
        <div class="social-intel-controls">
          <div class="social-intel-search-wrapper">
            <input
              type="text"
              class="social-intel-search-input"
              id="social-intel-search-input"
              placeholder="Search intel..."
              value="${escapeHtml(this.searchQuery)}"
            />
            ${this.searchQuery ? '<button class="social-search-clear" id="social-search-clear">×</button>' : ''}
          </div>
          <button
            class="social-intel-refresh-btn ${this.isRefreshing ? 'loading' : ''}"
            id="social-intel-refresh-btn"
            title="Refresh intel feed (3h cache)"
            aria-label="Refresh intel feed"
          ><span class="social-refresh-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg></span><svg class="social-loading-wheel" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="rgba(0, 0, 0, 0.18)" stroke-width="2.5" /><path d="M12 3a9 9 0 0 1 9 9" stroke="#000000" stroke-width="2.5" stroke-linecap="round" /></svg></button>
        </div>
      </div>
    `;

    let contentHtml = '';
    if (filtered.length === 0) {
      contentHtml = `
        <div class="social-intel-empty-state">
          <div class="social-empty-icon">📡</div>
          <div class="social-empty-title">${this.searchQuery ? 'No matching briefings' : 'Monitoring OSINT Channels'}</div>
          <div class="social-empty-sub">
            ${this.searchQuery ? 'Try clearing your search query or switching filters.' : 'Scraping prominent Bluesky and Telegram OSINT feeds for corroborated breaking events.'}
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="social-intel-cards-list" id="social-intel-cards-list">
          ${filtered.map((b) => this.renderBriefingCard(b)).join('')}
        </div>
      `;
    }

    const metaFooter = this.responseMeta ? `
      <div class="social-intel-footer">
        <span class="social-footer-stat">Model: ${escapeHtml(this.responseMeta.modelUsed || 'AI Studio Low-Cost')}</span>
        <span class="social-footer-stat">Monitored: ${this.responseMeta.sourcesMonitored?.bluesky?.length || 10} Bluesky · ${this.responseMeta.sourcesMonitored?.telegram?.length || 8} Telegram</span>
      </div>
    ` : '';

    const cardsList = this.content.querySelector('#social-intel-cards-list');
    const prevCardsScrollTop = cardsList?.scrollTop ?? 0;
    const prevContentScrollTop = this.content.scrollTop;

    this.content.innerHTML = `
      <div class="social-intel-panel-inner">
        ${filtersHtml}
        ${contentHtml}
        ${metaFooter}
      </div>
    `;

    this.attachEventListeners();

    if (prevContentScrollTop > 0) {
      this.content.scrollTop = prevContentScrollTop;
    }
    const newCardsList = this.content.querySelector('#social-intel-cards-list');
    if (newCardsList && prevCardsScrollTop > 0) {
      newCardsList.scrollTop = prevCardsScrollTop;
    }
  }

  private renderBriefingCard(b: SocialIntelBriefing): string {
    const isExpanded = this.expandedBriefings.has(b.id);
    const platformIcons = b.platforms.map((p) => (p === 'bluesky' ? '🦋' : '✈️')).join(' ');

    const corroborationBadge = b.isMultiSource
      ? `<span class="social-corroboration-badge verified" title="Corroborated by ${b.corroborationScore} independent sources">✓ ${b.corroborationScore} Sources Verified</span>`
      : `<span class="social-corroboration-badge single" title="Single monitored source reporting">Single Monitor Signal</span>`;

    return `
      <article class="social-intel-card ${b.isMultiSource ? 'card-corroborated' : ''}" data-id="${escapeHtml(b.id)}">
        <div class="social-intel-card-header">
          <div class="social-card-meta-left">
            <span class="social-freshness-dot"></span>
            <span class="social-freshness-text" title="Generated ${escapeHtml(b.createdAt)}">${escapeHtml(b.freshness)}</span>
            <span class="social-wordcount-chip">${b.wordCount} words</span>
          </div>
          <div class="social-card-meta-right">
            ${corroborationBadge}
            <span class="social-platform-icons">${platformIcons}</span>
          </div>
        </div>

        <div class="social-briefing-text">
          ${escapeHtml(b.briefing)}
        </div>

        <div class="social-card-actions">
          <button
            type="button"
            class="social-expand-sources-btn ${isExpanded ? 'expanded' : ''}"
            data-action="toggle-expand"
            data-id="${escapeHtml(b.id)}"
            aria-expanded="${isExpanded ? 'true' : 'false'}"
          >
            <span>${b.sources.length} ${b.sources.length === 1 ? 'Source' : 'Sources'}</span>
            <span class="social-chevron">${isExpanded ? '▲' : '▼'}</span>
          </button>
        </div>

        ${isExpanded ? this.renderSourcesDrawer(b.sources) : ''}
      </article>
    `;
  }

  private renderSourcesDrawer(sources: SocialSourcePost[]): string {
    return `
      <div class="social-sources-drawer">
        <div class="social-sources-title">CORROBORATING SOURCES & LINKS</div>
        <div class="social-sources-list">
          ${sources
            .map((s) => {
              const platformLabel = s.platform === 'bluesky' ? '🦋 Bluesky' : '✈️ Telegram';
              const cleanSnippet = s.cleanedText.length > 220 ? `${s.cleanedText.slice(0, 220)}...` : s.cleanedText;
              const hasTranslation = !!(s.isTranslated && s.translatedText && s.translatedText !== s.cleanedText);
              const translatedSnippet = hasTranslation && s.translatedText
                ? (s.translatedText.length > 240 ? `${s.translatedText.slice(0, 240)}...` : s.translatedText)
                : '';

              return `
                <div class="social-source-item" data-platform="${s.platform}">
                  <div class="social-source-header">
                    <div class="social-source-author-wrap">
                      <span class="social-source-platform-tag ${s.platform}">${platformLabel}</span>
                      <span class="social-source-author">${escapeHtml(s.author)}</span>
                    </div>
                    <div class="social-source-right">
                      <span class="social-source-freshness">${escapeHtml(s.freshness)}</span>
                      <a
                        href="${sanitizeUrl(s.url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="social-source-link"
                        title="Open original post on ${s.platform}"
                        data-action="view-source"
                      >
                        Open Post ↗
                      </a>
                    </div>
                  </div>
                  <div class="social-source-snippet">
                    ${
                      hasTranslation
                        ? `
                          <div class="social-source-translation-meta">
                            <span class="social-source-translation-badge" title="Translated using Google pre-trained translation API">
                              🌐 Translated to English
                            </span>
                          </div>
                          <div class="social-source-translated-text">
                            "${escapeHtml(translatedSnippet)}"
                          </div>
                          <details class="social-source-orig-details">
                            <summary class="social-source-orig-summary">Original post snippet</summary>
                            <div class="social-source-orig-text">"${escapeHtml(cleanSnippet)}"</div>
                          </details>
                        `
                        : `"${escapeHtml(cleanSnippet)}"`
                    }
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // 1. Filter chips
    const toolbar = this.content.querySelector('#social-intel-toolbar');
    toolbar?.querySelectorAll('.social-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const f = (btn as HTMLElement).dataset.filter as IntelFilter;
        if (f && f !== this.filter) {
          this.filter = f;
          this.render();
        }
      });
    });

    // 2. Search input
    const searchInput = this.content.querySelector('#social-intel-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim();
      this.render();
    });

    // 3. Clear search button
    const clearBtn = this.content.querySelector('#social-search-clear');
    clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.searchQuery = '';
      this.render();
    });

    // 4. Refresh button
    const refreshBtn = this.content.querySelector('#social-intel-refresh-btn');
    refreshBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.loadData(true);
    });

    // 5. Expand / Collapse drawers
    const list = this.content.querySelector('#social-intel-cards-list');
    list?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action="toggle-expand"]') as HTMLElement | null;
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const id = target.dataset.id;
        if (id) {
          this.toggleExpand(id, target);
        }
      }
    });
  }

  private toggleExpand(id: string, buttonEl?: HTMLElement): void {
    const isCurrentlyExpanded = this.expandedBriefings.has(id);
    if (isCurrentlyExpanded) {
      this.expandedBriefings.delete(id);
    } else {
      this.expandedBriefings.add(id);
    }

    const card = buttonEl
      ? buttonEl.closest('.social-intel-card')
      : this.content.querySelector(`.social-intel-card[data-id="${id}"]`);

    if (card) {
      const btn = buttonEl || card.querySelector<HTMLElement>('[data-action="toggle-expand"]');
      const isExpandedNow = !isCurrentlyExpanded;
      if (btn) {
        btn.classList.toggle('expanded', isExpandedNow);
        btn.setAttribute('aria-expanded', isExpandedNow ? 'true' : 'false');
        const chevron = btn.querySelector('.social-chevron');
        if (chevron) {
          chevron.textContent = isExpandedNow ? '▲' : '▼';
        }
      }

      const existingDrawer = card.querySelector('.social-sources-drawer');
      if (isExpandedNow) {
        if (!existingDrawer) {
          const briefing = this.briefings.find((b) => b.id === id);
          if (briefing) {
            const drawerContainer = document.createElement('div');
            drawerContainer.innerHTML = this.renderSourcesDrawer(briefing.sources);
            const drawerEl = drawerContainer.firstElementChild;
            if (drawerEl) {
              card.appendChild(drawerEl);
            }
          }
        } else {
          (existingDrawer as HTMLElement).style.display = '';
        }
      } else if (existingDrawer) {
        existingDrawer.remove();
      }
      return;
    }

    this.render();
  }
}
