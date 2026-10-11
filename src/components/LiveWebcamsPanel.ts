import { Panel } from './Panel';
import { isDesktopRuntime, getRemoteApiBaseUrl } from '@/services/runtime';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '../services/i18n';
import { trackWebcamSelected, trackWebcamRegionFiltered } from '@/services/analytics';
import { getStreamQuality, subscribeStreamQualityChange } from '@/services/ai-flow-settings';

type WebcamRegion = 'middle-east' | 'europe' | 'asia' | 'americas';

interface WebcamFeed {
  id: string;
  city: string;
  country: string;
  region: WebcamRegion;
  channelHandle: string;
  fallbackVideoId: string;
  fallbackVideoIds: [string, string];
}

// Verified active YouTube live stream IDs and 2 fallbacks for each.
const WEBCAM_FEEDS: WebcamFeed[] = [
  // Middle East — Jerusalem & Tehran adjacent (conflict hotspots)
  {
    id: 'jerusalem',
    city: 'Jerusalem',
    country: 'Israel',
    region: 'middle-east',
    channelHandle: '@TheWesternWall',
    fallbackVideoId: 'LMHUcDktP-w',
    fallbackVideoIds: ['UyduhBUpO7Q', 'gJsZdfSyPrM'],
  },
  {
    id: 'tehran',
    city: 'Tehran',
    country: 'Iran',
    region: 'middle-east',
    channelHandle: '@IranHDCams',
    fallbackVideoId: '-zGuR1qVKrU',
    fallbackVideoIds: ['Fxi3jVeuw4g', '5y3dYo-KcsA'],
  },
  {
    id: 'tel-aviv',
    city: 'Tel Aviv',
    country: 'Israel',
    region: 'middle-east',
    channelHandle: '@IsraelLiveCam',
    fallbackVideoId: '-VLcYT5QBrY',
    fallbackVideoIds: ['ipdvjWrl_5g', 'BsXkVNrTvhU'],
  },
  {
    id: 'mecca',
    city: 'Mecca',
    country: 'Saudi Arabia',
    region: 'middle-east',
    channelHandle: '@MakkahLive',
    fallbackVideoId: 'DEcpmPUbkDQ',
    fallbackVideoIds: ['3Hgm9qThfX4', 'n_k8TWHk9WI'],
  },
  // Europe
  {
    id: 'kyiv',
    city: 'Kyiv',
    country: 'Ukraine',
    region: 'europe',
    channelHandle: '@DWNews',
    fallbackVideoId: 'p5RLcaR3iOw',
    fallbackVideoIds: ['e2gC37ILQmk', '-Q7FuPINDjA'],
  },
  {
    id: 'odessa',
    city: 'Odessa',
    country: 'Ukraine',
    region: 'europe',
    channelHandle: '@UkraineLiveCam',
    fallbackVideoId: 'e2gC37ILQmk',
    fallbackVideoIds: ['p5RLcaR3iOw', 'iLM_TaUKLeY'],
  },
  {
    id: 'paris',
    city: 'Paris',
    country: 'France',
    region: 'europe',
    channelHandle: '@PalaisIena',
    fallbackVideoId: 'OzYp4NRZlwQ',
    fallbackVideoIds: ['wP1RwzORoBs', 'jZZy50w69zI'],
  },
  {
    id: 'st-petersburg',
    city: 'St. Petersburg',
    country: 'Russia',
    region: 'europe',
    channelHandle: '@SPBLiveCam',
    fallbackVideoId: 'V19KdSK1V8g',
    fallbackVideoIds: ['CjtIYbmVfck', 'eDkveV1id1M'],
  },
  {
    id: 'london',
    city: 'London',
    country: 'UK',
    region: 'europe',
    channelHandle: '@EarthCam',
    fallbackVideoId: 'N8v5y2StMDQ',
    fallbackVideoIds: ['uDBYuEV4zjI', 'Lxqcg1qt0XU'],
  },
  // Americas
  {
    id: 'washington',
    city: 'Washington DC',
    country: 'USA',
    region: 'americas',
    channelHandle: '@AxisCommunications',
    fallbackVideoId: 'U85B2-kljyc',
    fallbackVideoIds: ['NiC4XwcM7oM', 'rxhU5YXz6us'],
  },
  {
    id: 'new-york',
    city: 'New York',
    country: 'USA',
    region: 'americas',
    channelHandle: '@EarthCam',
    fallbackVideoId: 'PGrq-2mju2s',
    fallbackVideoIds: ['bd83M-ftXX4', '4qyZLflp-sI'],
  },
  {
    id: 'los-angeles',
    city: 'Los Angeles',
    country: 'USA',
    region: 'americas',
    channelHandle: '@VeniceVHotel',
    fallbackVideoId: 'EO_1LWqsCNE',
    fallbackVideoIds: ['JnNhhJQJ9KY', '-N6Y5Bh06c0'],
  },
  {
    id: 'miami',
    city: 'Miami',
    country: 'USA',
    region: 'americas',
    channelHandle: '@FloridaLiveCams',
    fallbackVideoId: 'TSGQMohOLU0',
    fallbackVideoIds: ['96gYpFS4ZvY', '5YCajRjvWCg'],
  },
  // Asia-Pacific
  {
    id: 'taipei',
    city: 'Taipei',
    country: 'Taiwan',
    region: 'asia',
    channelHandle: '@JackyWuTaipei',
    fallbackVideoId: 'z_fY1pj1VBw',
    fallbackVideoIds: ['Y-dGAitUwDs', 'ZXEHi0fG2-4'],
  },
  {
    id: 'shanghai',
    city: 'Shanghai',
    country: 'China',
    region: 'asia',
    channelHandle: '@SkylineWebcams',
    fallbackVideoId: '76EwqI5XZIc',
    fallbackVideoIds: ['cje_VvuyaEQ', 'r1VOcQ1xUN0'],
  },
  {
    id: 'tokyo',
    city: 'Tokyo',
    country: 'Japan',
    region: 'asia',
    channelHandle: '@TokyoLiveCam4K',
    fallbackVideoId: 's49TVEPng0Q',
    fallbackVideoIds: ['PHjIoS--abI', '4pu9sF5Qssw'],
  },
  {
    id: 'seoul',
    city: 'Seoul',
    country: 'South Korea',
    region: 'asia',
    channelHandle: '@seoullive',
    fallbackVideoId: 'GhNscofIqHU',
    fallbackVideoIds: ['nDQ_PdOIuPQ', 'xwewcDBVr8I'],
  },
  {
    id: 'sydney',
    city: 'Sydney',
    country: 'Australia',
    region: 'asia',
    channelHandle: '@WebcamSydney',
    fallbackVideoId: '0M_t0DEY7Jo',
    fallbackVideoIds: ['ggy1-vP7CIw', '7pcL-0Wo77U'],
  },
];

const MAX_GRID_CELLS = 4;

type ViewMode = 'grid' | 'single';
type RegionFilter = 'all' | WebcamRegion;

export class LiveWebcamsPanel extends Panel {
  private viewMode: ViewMode = 'grid';
  private regionFilter: RegionFilter = 'all';
  private activeFeed: WebcamFeed = WEBCAM_FEEDS[0]!;
  private toolbar: HTMLElement | null = null;
  private iframes: HTMLIFrameElement[] = [];
  private observer: IntersectionObserver | null = null;
  private isVisible = false;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private boundIdleResetHandler!: () => void;
  private boundVisibilityHandler!: () => void;
  private readonly IDLE_PAUSE_MS = 5 * 60 * 1000;
  private isIdle = false;
  private streamIndices: Map<string, number> = new Map();

  constructor() {
    super({ id: 'live-webcams', title: t('panels.liveWebcams') });
    this.element.classList.add('panel-wide');
    this.createToolbar();
    this.setupIntersectionObserver();
    this.setupIdleDetection();
    subscribeStreamQualityChange(() => this.render());
    this.render();
  }

  private get filteredFeeds(): WebcamFeed[] {
    if (this.regionFilter === 'all') return WEBCAM_FEEDS;
    return WEBCAM_FEEDS.filter(f => f.region === this.regionFilter);
  }

  private static readonly ALL_GRID_IDS = ['jerusalem', 'tehran', 'kyiv', 'washington'];

  private get gridFeeds(): WebcamFeed[] {
    if (this.regionFilter === 'all') {
      return LiveWebcamsPanel.ALL_GRID_IDS
        .map(id => WEBCAM_FEEDS.find(f => f.id === id)!)
        .filter(Boolean);
    }
    return this.filteredFeeds.slice(0, MAX_GRID_CELLS);
  }

  private getFeedVideoId(feed: WebcamFeed): string {
    const idx = this.streamIndices.get(feed.id) ?? 0;
    if (idx === 1 && feed.fallbackVideoIds?.[0]) return feed.fallbackVideoIds[0];
    if (idx === 2 && feed.fallbackVideoIds?.[1]) return feed.fallbackVideoIds[1];
    return feed.fallbackVideoId;
  }

  private cycleFeedStream(feedId: string): void {
    const cur = this.streamIndices.get(feedId) ?? 0;
    this.streamIndices.set(feedId, (cur + 1) % 3);
    this.render();
  }

  private createToolbar(): void {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'webcam-toolbar';

    const regionGroup = document.createElement('div');
    regionGroup.className = 'webcam-toolbar-group';

    const regions: { key: RegionFilter; label: string }[] = [
      { key: 'all', label: t('components.webcams.regions.all') },
      { key: 'middle-east', label: t('components.webcams.regions.mideast') },
      { key: 'europe', label: t('components.webcams.regions.europe') },
      { key: 'americas', label: t('components.webcams.regions.americas') },
      { key: 'asia', label: t('components.webcams.regions.asia') },
    ];

    regions.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = `webcam-region-btn${key === this.regionFilter ? ' active' : ''}`;
      btn.dataset.region = key;
      btn.textContent = label;
      btn.addEventListener('click', () => this.setRegionFilter(key));
      regionGroup.appendChild(btn);
    });

    const viewGroup = document.createElement('div');
    viewGroup.className = 'webcam-toolbar-group';

    const gridBtn = document.createElement('button');
    gridBtn.className = `webcam-view-btn${this.viewMode === 'grid' ? ' active' : ''}`;
    gridBtn.dataset.mode = 'grid';
    gridBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>';
    gridBtn.title = 'Grid view';
    gridBtn.addEventListener('click', () => this.setViewMode('grid'));

    const singleBtn = document.createElement('button');
    singleBtn.className = `webcam-view-btn${this.viewMode === 'single' ? ' active' : ''}`;
    singleBtn.dataset.mode = 'single';
    singleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="14" rx="2"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>';
    singleBtn.title = 'Single view';
    singleBtn.addEventListener('click', () => this.setViewMode('single'));

    viewGroup.appendChild(gridBtn);
    viewGroup.appendChild(singleBtn);

    this.toolbar.appendChild(regionGroup);
    this.toolbar.appendChild(viewGroup);
    this.element.insertBefore(this.toolbar, this.content);
  }

  private setRegionFilter(filter: RegionFilter): void {
    if (filter === this.regionFilter) return;
    trackWebcamRegionFiltered(filter);
    this.regionFilter = filter;
    this.toolbar?.querySelectorAll('.webcam-region-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.region === filter);
    });
    const feeds = this.filteredFeeds;
    if (feeds.length > 0 && !feeds.includes(this.activeFeed)) {
      this.activeFeed = feeds[0]!;
    }
    this.render();
  }

  private setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.toolbar?.querySelectorAll('.webcam-view-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
    });
    this.render();
  }

  private buildEmbedUrl(videoId: string): string {
    const quality = getStreamQuality();
    if (isDesktopRuntime()) {
      const remoteBase = getRemoteApiBaseUrl();
      const params = new URLSearchParams({
        videoId,
        autoplay: '1',
        mute: '1',
      });
      if (quality !== 'auto') params.set('vq', quality);
      return `${remoteBase}/api/youtube/embed?${params.toString()}`;
    }
    const vq = quality !== 'auto' ? `&vq=${quality}` : '';
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0${vq}`;
  }

  private createIframe(feed: WebcamFeed): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.className = 'webcam-iframe';
    const videoId = this.getFeedVideoId(feed);
    iframe.src = this.buildEmbedUrl(videoId);
    iframe.title = `${feed.city} live webcam`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    iframe.addEventListener('error', () => {
      this.cycleFeedStream(feed.id);
    });
    return iframe;
  }

  private render(): void {
    this.destroyIframes();

    if (!this.isVisible || this.isIdle) {
      this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused</div>';
      return;
    }

    if (this.viewMode === 'grid') {
      this.renderGrid();
    } else {
      this.renderSingle();
    }
  }

  private renderGrid(): void {
    this.content.innerHTML = '';
    this.content.className = 'panel-content webcam-content';

    const grid = document.createElement('div');
    grid.className = 'webcam-grid';

    this.gridFeeds.forEach(feed => {
      const cell = document.createElement('div');
      cell.className = 'webcam-cell';
      cell.addEventListener('click', () => {
        trackWebcamSelected(feed.id, feed.city, 'grid');
        this.activeFeed = feed;
        this.setViewMode('single');
      });

      const label = document.createElement('div');
      label.className = 'webcam-cell-label';

      const citySpan = document.createElement('span');
      citySpan.className = 'webcam-city-wrap';
      citySpan.innerHTML = `<span class="webcam-live-dot"></span><span class="webcam-city">${escapeHtml(feed.city.toUpperCase())}</span>`;
      label.appendChild(citySpan);

      const streamIdx = (this.streamIndices.get(feed.id) ?? 0) + 1;
      const cycleBtn = document.createElement('button');
      cycleBtn.className = 'webcam-stream-badge';
      cycleBtn.title = 'Switch stream (3 available)';
      cycleBtn.textContent = `CAM ${streamIdx}/3`;
      cycleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cycleFeedStream(feed.id);
      });
      label.appendChild(cycleBtn);

      const iframe = this.createIframe(feed);
      cell.appendChild(iframe);
      cell.appendChild(label);
      grid.appendChild(cell);
      this.iframes.push(iframe);
    });

    this.content.appendChild(grid);
  }

  private renderSingle(): void {
    this.content.innerHTML = '';
    this.content.className = 'panel-content webcam-content';

    const wrapper = document.createElement('div');
    wrapper.className = 'webcam-single';

    const iframe = this.createIframe(this.activeFeed);
    wrapper.appendChild(iframe);
    this.iframes.push(iframe);

    const switcher = document.createElement('div');
    switcher.className = 'webcam-switcher';

    const backBtn = document.createElement('button');
    backBtn.className = 'webcam-feed-btn webcam-back-btn';
    backBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg> Grid';
    backBtn.addEventListener('click', () => this.setViewMode('grid'));
    switcher.appendChild(backBtn);

    this.filteredFeeds.forEach(feed => {
      const btn = document.createElement('button');
      btn.className = `webcam-feed-btn${feed.id === this.activeFeed.id ? ' active' : ''}`;
      btn.textContent = feed.city;
      btn.addEventListener('click', () => {
        trackWebcamSelected(feed.id, feed.city, 'single');
        this.activeFeed = feed;
        this.render();
      });
      switcher.appendChild(btn);
    });

    // Fallback stream selection controls for active feed
    const streamGroup = document.createElement('div');
    streamGroup.className = 'webcam-fallback-group';
    const curIdx = this.streamIndices.get(this.activeFeed.id) ?? 0;
    const streamLabels = ['Stream 1', 'Stream 2', 'Stream 3'];
    streamLabels.forEach((name, idx) => {
      const sBtn = document.createElement('button');
      sBtn.className = `webcam-feed-btn webcam-stream-btn${curIdx === idx ? ' active' : ''}`;
      sBtn.textContent = name;
      sBtn.title = `Switch to ${name} for ${this.activeFeed.city}`;
      sBtn.addEventListener('click', () => {
        this.streamIndices.set(this.activeFeed.id, idx);
        this.render();
      });
      streamGroup.appendChild(sBtn);
    });
    switcher.appendChild(streamGroup);

    this.content.appendChild(wrapper);
    this.content.appendChild(switcher);
  }

  private destroyIframes(): void {
    this.iframes.forEach(iframe => {
      iframe.src = 'about:blank';
      iframe.remove();
    });
    this.iframes = [];
  }

  private setupIntersectionObserver(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        const wasVisible = this.isVisible;
        this.isVisible = entries.some(e => e.isIntersecting);
        if (this.isVisible && !wasVisible && !this.isIdle) {
          this.render();
        } else if (!this.isVisible && wasVisible) {
          this.destroyIframes();
        }
      },
      { threshold: 0.1 }
    );
    this.observer.observe(this.element);
  }

  private setupIdleDetection(): void {
    this.boundVisibilityHandler = () => {
      if (document.hidden) {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
      } else {
        if (this.isIdle) {
          this.isIdle = false;
          if (this.isVisible) this.render();
        }
        this.boundIdleResetHandler();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    this.boundIdleResetHandler = () => {
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      if (this.isIdle) {
        this.isIdle = false;
        if (this.isVisible) this.render();
      }
      this.idleTimeout = setTimeout(() => {
        this.isIdle = true;
        this.destroyIframes();
        this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused — move mouse to resume</div>';
      }, this.IDLE_PAUSE_MS);
    };

    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.addEventListener(event, this.boundIdleResetHandler, { passive: true });
    });

    this.boundIdleResetHandler();
  }

  public refresh(): void {
    if (this.isVisible && !this.isIdle) {
      this.render();
    }
  }

  public destroy(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.removeEventListener(event, this.boundIdleResetHandler);
    });
    this.observer?.disconnect();
    this.destroyIframes();
    super.destroy();
  }
}
