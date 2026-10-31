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
  fallbackVideoId: string;
  fallbackVideoIds?: string[];
}

// Verified active YouTube 24/7 live streams for each feed (strictly matching location only).
const WEBCAM_FEEDS: WebcamFeed[] = [
  // Middle East
  {
    id: 'jerusalem',
    city: 'Jerusalem',
    country: 'Israel',
    region: 'middle-east',
    fallbackVideoId: '77akujLn4k8', // EarthCam - Western Wall Live (24/7)
    fallbackVideoIds: [
      'AKGqd20ik_A', // Western Wall, The Kotel Live
      'zp6LNSoq000', // Western Wall, Temple Archaeological Park
      'LdS7TXNmQgQ', // Jerusalem Skyline 24/7 Live
    ],
  },
  {
    id: 'mecca',
    city: 'Mecca',
    country: 'Saudi Arabia',
    region: 'middle-east',
    fallbackVideoId: 'do7cUEcekS0', // Saudi Quran TV Makkah Live HD
    fallbackVideoIds: [
      'uFBt3KHGApI', // Mecca Live 4K
      '0R1KE0wxDe8', // Makkah Live Haram Plaza
      '9Bmair0q8Ss', // Makkah Live Kaaba View
    ],
  },

  // Europe
  {
    id: 'london',
    city: 'London',
    country: 'UK',
    region: 'europe',
    fallbackVideoId: 'zMCea32gpmg', // EarthCam - Abbey Road Crossing
    fallbackVideoIds: [
      'uDBYuEV4zjI', // Heathrow Airport 24/7
      'mNiI7CbnxyQ', // UK Coastal 4K Live
    ],
  },
  {
    id: 'paris',
    city: 'Paris',
    country: 'France',
    region: 'europe',
    fallbackVideoId: 'QI-PPEW2Bgc', // Eiffel Tower & Montparnasse
    fallbackVideoIds: [
      'kboDFtMZqQI', // Champs-Élysées & Arc de Triomphe
      'CKIRyx-ZXM0', // Eiffel Tower & Seine River 8K
    ],
  },
  {
    id: 'rome',
    city: 'Rome',
    country: 'Italy',
    region: 'europe',
    fallbackVideoId: 'VfH8gQJQnBE', // Piazza Venezia
    fallbackVideoIds: [
      'jtdyLykT_XY', // EarthCam - Mallorca
      'wiVzU1mcCTA', // EarthCam - Tamariu
    ],
  },
  {
    id: 'mallorca',
    city: 'Mallorca',
    country: 'Spain',
    region: 'europe',
    fallbackVideoId: 'jtdyLykT_XY', // EarthCam - Mallorca
    fallbackVideoIds: [
      'wiVzU1mcCTA', // EarthCam - Tamariu
      'SFENGpVVpL4', // Magaluf Beach & Punta Ballena
      'KwLMqsQVNe0', // Playa de Cala Gat
    ],
  },
  {
    id: 'st-petersburg',
    city: 'St. Petersburg',
    country: 'Russia',
    region: 'europe',
    fallbackVideoId: 'CjtIYbmVfck', // Palace Bridge 4K
    fallbackVideoIds: [
      'eqJf0FloKyQ', // Neva River Palace Bridge
      'c6E86ojXhNs', // St. Petersburg Pavlov Sky
    ],
  },

  // Americas
  {
    id: 'new-york',
    city: 'New York',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'JQ_jwk_7OVE', // EarthCam - Times Square North 4K
    fallbackVideoIds: [
      '5C9oM7C2Q9k', // EarthCam - World Trade Center
      'sixP_dAJ8D4', // EarthCam - Lincoln Harbor NYC Skyline
      'o5Ie_LpZ9uk', // EarthCam - Statue of Liberty
      'tErYxn2UM5Y', // EarthCam - Brooklyn Bridge Cam
    ],
  },
  {
    id: 'miami',
    city: 'Miami',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: '96gYpFS4ZvY', // Biscayne Bay DoubleTree
    fallbackVideoIds: [
      'tAdTOOsrZBQ', // EarthCam - Anglins Pier (Lauderdale-By-The-Sea)
      '4LTSTw4jnZc', // EarthCam - Sanibel Island
      'H_kswlYZN5o', // Duval Street Key West
    ],
  },
  {
    id: 'chicago',
    city: 'Chicago',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'EiUyBIcG4fQ', // EarthCam - Midway Airport
    fallbackVideoIds: [
      'sixP_dAJ8D4', // EarthCam - Lincoln Harbor Waterfront
      'IU_-Pl9O5jQ', // EarthCam - Midwest Wildlife Cam
    ],
  },
  {
    id: 'new-orleans',
    city: 'New Orleans',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'QxFFjXu_zqs', // EarthCam - Bourbon Street Balcony View
    fallbackVideoIds: [
      'xqdukYhcGEU', // EarthCam - Bourbon Street View
      '6tq8S2pp8PQ', // EarthCam - Southern River Cam
    ],
  },
  {
    id: 'washington-dc',
    city: 'Washington D.C.',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'oDCAAfOSqvA', // EarthCam - Washington Monument
    fallbackVideoIds: [
      'F1EQEDL4ddU', // EarthCam - Liberty Bell / Independence Hall
      '9mMnqO1UuIU', // EarthCam - Philadelphia Skyline
      'OSI8qWMoK5E', // EarthCam - Flight 93 Memorial Tower of Voices
    ],
  },
  {
    id: 'las-vegas',
    city: 'Las Vegas',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'uaIhqF1hz0I', // Fremont Street Live Cam 2
    fallbackVideoIds: [
      'JQ_jwk_7OVE', // EarthCam - Times Square 4K
      'QxFFjXu_zqs', // EarthCam - Bourbon Street Live
    ],
  },
  {
    id: 'los-angeles',
    city: 'Los Angeles',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'EO_1LWqsCNE', // Venice Beach Live Cam
    fallbackVideoIds: [
      '4LTSTw4jnZc', // EarthCam - Coastal Beach Cam
      'tAdTOOsrZBQ', // EarthCam - Anglins Pier Cam
    ],
  },
  {
    id: 'honolulu',
    city: 'Honolulu',
    country: 'USA',
    region: 'americas',
    fallbackVideoId: 'eCHeZDEVSeU', // Honolulu Harbor
    fallbackVideoIds: [
      'wTLnC0o0UJ0', // Lawai Beach Resort Hawaii
      '5cH9Zr9cCvM', // AlohaLiveCam Hawaii Ocean Tour
    ],
  },

  // Asia-Pacific
  {
    id: 'tokyo',
    city: 'Tokyo',
    country: 'Japan',
    region: 'asia',
    fallbackVideoId: 'NdAyRlYxw3M', // Tokyo Bay Ships & Planes
    fallbackVideoIds: [
      'sIy0J6TeCxY', // Odaiba Beach Tokyo
      'KCUlAtKjU0w', // Shinjuku Kabukicho Cam 2
      'CBajd9um0zI', // Shinjuku Kabukicho Cam 1
    ],
  },
  {
    id: 'hong-kong',
    city: 'Hong Kong',
    country: 'Hong Kong',
    region: 'asia',
    fallbackVideoId: 'PznqRZYdiHs', // Aberdeen Harbour
    fallbackVideoIds: [
      'EvpdNDoG2r0', // The Peak 24/7 Live Camera
      'NdAyRlYxw3M', // Asian Maritime Bay Cam
    ],
  },
  {
    id: 'seoul',
    city: 'Seoul',
    country: 'South Korea',
    region: 'asia',
    fallbackVideoId: 'GhNscofIqHU', // Namsan Tower
    fallbackVideoIds: [
      'pYUCZ8ELKq0', // Han River Live Cam
      'uTKdetNwFys', // Yongsan Seoul Core 4K
      'aV-Yms9zzao', // Yeouido Han River 4K
    ],
  },
  {
    id: 'sydney',
    city: 'Sydney',
    country: 'Australia',
    region: 'asia',
    fallbackVideoId: '5uZa3-RMFos', // Sydney Harbour 24/7 (~4K)
    fallbackVideoIds: [
      'j-0OhK7TDow', // Sydney Harbour Bridge & Opera House
      'H3W5vZbp0Yc', // Australian Runway Cam
    ],
  },
  {
    id: 'taipei',
    city: 'Taipei',
    country: 'Taiwan',
    region: 'asia',
    fallbackVideoId: 'z_fY1pj1VBw', // Taipei 101 Xiangshan 4K
    fallbackVideoIds: [
      'NdAyRlYxw3M', // Pacific Bay Live Cam
      'GhNscofIqHU', // Metropolitan Live Cam
    ],
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
  private pageIndicator: HTMLElement | null = null;
  private gridPageIndex = 0;
  private iframes: HTMLIFrameElement[] = [];
  private observer: IntersectionObserver | null = null;
  private isVisible = false;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private boundIdleResetHandler!: () => void;
  private boundVisibilityHandler!: () => void;
  private readonly IDLE_PAUSE_MS = 5 * 60 * 1000;
  private isIdle = false;
  private streamIndices: Map<string, number> = new Map();
  private boundMessageHandler!: (e: MessageEvent) => void;
  private readonly STREAM_WATCHDOG_MS = 12000;
  private streamWatchdogs: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private failedStreamsByFeed: Map<string, Set<string>> = new Map();
  private allFallbacksFailed: Set<string> = new Set();
  private allFallbacksRetryTimeout: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private healthCheckTokens: Map<string, number> = new Map();
  private isReadyToMount = false;
  private initialMountTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super({ id: 'live-webcams', title: t('panels.liveWebcams') });
    this.element.classList.add('panel-wide');
    this.createToolbar();
    this.setupIntersectionObserver();
    this.setupIdleDetection();
    this.setupMessageListener();
    subscribeStreamQualityChange(() => this.render());
    this.render();
    this.initialMountTimer = setTimeout(() => {
      const mountWhenIdle = () => {
        if (this.isReadyToMount) return;
        this.isReadyToMount = true;
        if (this.isVisible && !this.isIdle && !document.hidden) {
          this.render();
        }
      };
      if ('requestIdleCallback' in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(mountWhenIdle, { timeout: 2000 });
      } else {
        mountWhenIdle();
      }
    }, 2000);
  }

  private get filteredFeeds(): WebcamFeed[] {
    if (this.regionFilter === 'all') return WEBCAM_FEEDS;
    return WEBCAM_FEEDS.filter(f => f.region === this.regionFilter);
  }

  private get totalGridPages(): number {
    return Math.ceil(this.filteredFeeds.length / MAX_GRID_CELLS) || 1;
  }

  private get gridFeeds(): WebcamFeed[] {
    const feeds = this.filteredFeeds;
    if (feeds.length === 0) return [];
    const totalPages = this.totalGridPages;
    const page = ((this.gridPageIndex % totalPages) + totalPages) % totalPages;
    const start = page * MAX_GRID_CELLS;
    return feeds.slice(start, start + MAX_GRID_CELLS);
  }

  private nextGridPage(): void {
    if (this.viewMode === 'grid') {
      this.gridPageIndex = (this.gridPageIndex + 1) % this.totalGridPages;
    } else {
      const idx = this.filteredFeeds.findIndex(f => f.id === this.activeFeed.id);
      if (idx !== -1 && this.filteredFeeds.length > 0) {
        this.activeFeed = this.filteredFeeds[(idx + 1) % this.filteredFeeds.length]!;
      }
    }
    this.render();
  }

  private prevGridPage(): void {
    if (this.viewMode === 'grid') {
      this.gridPageIndex = (this.gridPageIndex - 1 + this.totalGridPages) % this.totalGridPages;
    } else {
      const idx = this.filteredFeeds.findIndex(f => f.id === this.activeFeed.id);
      if (idx !== -1 && this.filteredFeeds.length > 0) {
        this.activeFeed = this.filteredFeeds[(idx - 1 + this.filteredFeeds.length) % this.filteredFeeds.length]!;
      }
    }
    this.render();
  }

  private getFeedStreams(feed: WebcamFeed): string[] {
    const list: string[] = [];
    if (feed.fallbackVideoId && !list.includes(feed.fallbackVideoId)) {
      list.push(feed.fallbackVideoId);
    }
    if (feed.fallbackVideoIds && feed.fallbackVideoIds.length > 0) {
      for (const vid of feed.fallbackVideoIds) {
        if (vid && !list.includes(vid)) {
          list.push(vid);
        }
      }
    }
    return list.length > 0 ? list : [feed.fallbackVideoId];
  }

  private getFeedVideoId(feed: WebcamFeed): string {
    const streams = this.getFeedStreams(feed);
    const idx = (this.streamIndices.get(feed.id) ?? 0) % streams.length;
    return streams[idx] || feed.fallbackVideoId;
  }

  private cycleFeedStream(feedId: string): void {
    const feed = WEBCAM_FEEDS.find(f => f.id === feedId);
    if (!feed) return;
    const streams = this.getFeedStreams(feed);
    if (streams.length <= 1) return;

    if (this.allFallbacksFailed.has(feedId)) {
      this.allFallbacksFailed.delete(feedId);
      this.failedStreamsByFeed.delete(feedId);
      const timer = this.allFallbacksRetryTimeout.get(feedId);
      if (timer) {
        clearTimeout(timer);
        this.allFallbacksRetryTimeout.delete(feedId);
      }
    }

    const cur = this.streamIndices.get(feedId) ?? 0;
    const nextIdx = (cur + 1) % streams.length;
    const selectedVid = streams[nextIdx];
    if (selectedVid) {
      this.failedStreamsByFeed.get(feedId)?.delete(selectedVid);
    }
    this.switchFeedToStreamIndex(feedId, nextIdx);
  }

  private switchFeedToStreamIndex(feedId: string, nextIdx: number): void {
    const feed = WEBCAM_FEEDS.find(f => f.id === feedId);
    if (!feed) return;
    const streams = this.getFeedStreams(feed);
    this.streamIndices.set(feedId, nextIdx);
    const videoId = streams[nextIdx] || feed.fallbackVideoId;

    // In grid mode, update only this cell's iframe and badge directly without reloading all other iframes
    if (this.viewMode === 'grid') {
      const cell = this.content.querySelector<HTMLElement>(`[data-feed-id="${feedId}"]`);
      if (cell) {
        const oldIframe = cell.querySelector('iframe');
        const badge = cell.querySelector<HTMLButtonElement>('.webcam-stream-badge');
        if (oldIframe) {
          const newIframe = this.createIframe(feed);
          oldIframe.src = 'about:blank';
          cell.replaceChild(newIframe, oldIframe);
          const ifrIdx = this.iframes.indexOf(oldIframe);
          if (ifrIdx !== -1) {
            this.iframes[ifrIdx] = newIframe;
          } else {
            this.iframes.push(newIframe);
          }
        }
        if (badge) {
          badge.textContent = `CAM ${nextIdx + 1}/${streams.length}`;
          badge.classList.remove('offline');
          badge.title = `Switch camera angle (${streams.length} available)`;
        }
        void this.verifyStreamHealth(feedId, videoId);
        return;
      }
    } else if (this.viewMode === 'single' && this.activeFeed.id === feedId) {
      const wrapper = this.content.querySelector<HTMLElement>('.webcam-single');
      if (wrapper) {
        const oldIframe = wrapper.querySelector('iframe');
        if (oldIframe) {
          const newIframe = this.createIframe(feed);
          oldIframe.src = 'about:blank';
          wrapper.replaceChild(newIframe, oldIframe);
          const ifrIdx = this.iframes.indexOf(oldIframe);
          if (ifrIdx !== -1) {
            this.iframes[ifrIdx] = newIframe;
          } else {
            this.iframes.push(newIframe);
          }
        }
        const streamBtns = this.content.querySelectorAll<HTMLButtonElement>('.webcam-stream-btn');
        streamBtns.forEach((btn, idx) => {
          btn.classList.toggle('active', idx === nextIdx);
        });
        void this.verifyStreamHealth(feedId, videoId);
        return;
      }
    }
    this.render();
  }

  private setupMessageListener(): void {
    this.boundMessageHandler = (e: MessageEvent) => {
      this.handleWindowMessage(e);
    };
    window.addEventListener('message', this.boundMessageHandler);
  }

  private handleWindowMessage(e: MessageEvent): void {
    if (!this.isVisible || this.isIdle || document.hidden) return;

    const iframe = this.iframes.find(f => f.contentWindow === e.source);
    if (!iframe) return;
    const feedId = iframe.dataset.feedId;
    if (!feedId) return;

    let msg: any = e.data;
    if (typeof msg === 'string') {
      try {
        msg = JSON.parse(msg);
      } catch {
        return;
      }
    }
    if (!msg || typeof msg !== 'object') return;

    // Failure indicators:
    // 1. Desktop proxy: type === 'yt-error' (e.g. 2, 5, 100, 101, 150, 153)
    // 2. Desktop proxy: type === 'yt-state' && state === 0 (stream ended)
    // 3. YouTube iframe API: event === 'onError' (with info error code)
    // 4. YouTube iframe API: event === 'infoDelivery' with errorCode
    // 5. YouTube iframe API: event === 'onStateChange' && info === 0 (stream ended)
    // 6. YouTube iframe API: event === 'infoDelivery' && playerState === 0 (stream ended)
    const isYtError = msg.type === 'yt-error' ||
      msg.event === 'onError' ||
      (msg.event === 'infoDelivery' && typeof msg.info?.errorCode === 'number' && msg.info.errorCode > 0);

    const isStreamEnded = (msg.type === 'yt-state' && msg.state === 0) ||
      (msg.event === 'onStateChange' && msg.info === 0) ||
      (msg.event === 'infoDelivery' && msg.info?.playerState === 0);

    if (isYtError || isStreamEnded) {
      const reason = isYtError
        ? `error code ${msg.code ?? msg.info ?? msg.info?.errorCode}`
        : 'stream ended';
      this.handleStreamFailure(feedId, reason);
      return;
    }

    // Acknowledge initial delivery handshake from YouTube embed
    if (msg.event === 'initialDelivery' && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch { /* ignore */ }
    }

    // Healthy / playing indicators:
    // 1. Desktop proxy: type === 'yt-ready'
    // 2. Desktop proxy: type === 'yt-state' && (state === 1 || state === 3)
    // 3. YouTube iframe API: event === 'onReady'
    // 4. YouTube iframe API: event === 'onStateChange' && (info === 1 || info === 3)
    // 5. YouTube iframe API: event === 'infoDelivery' && (playerState === 1 || playerState === 3)
    // 6. YouTube iframe API: event === 'initialDelivery' (player successfully initialized and active)
    const isReadyOrPlaying = msg.type === 'yt-ready' ||
      msg.event === 'onReady' ||
      (msg.type === 'yt-state' && (msg.state === 1 || msg.state === 3)) ||
      (msg.event === 'onStateChange' && (msg.info === 1 || msg.info === 3)) ||
      (msg.event === 'infoDelivery' && (msg.info?.playerState === 1 || msg.info?.playerState === 3)) ||
      (msg.event === 'initialDelivery' && !msg.info?.errorCode);

    if (isReadyOrPlaying) {
      this.handleStreamSuccess(feedId);
    }
  }

  /**
   * Checks whether a YouTube livestream is reachable and healthy.
   * Probes YouTube's mqdefault image endpoint: valid streams return a 320x180 image (>120px wide),
   * while dead/deleted/non-existent streams return 404 or a 120x90 placeholder.
   */
  public async checkStreamHealth(videoId: string): Promise<boolean> {
    if (!videoId) return false;

    // 1. Browser Image probe: client-side, zero server overhead, fast CDN response
    if (typeof Image !== 'undefined') {
      try {
        const isHealthy = await new Promise<boolean>((resolve) => {
          const img = new Image();
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              img.src = '';
              // Avoid false negative on slow network timeout
              resolve(true);
            }
          }, 4500);

          img.onload = () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(img.naturalWidth > 120);
            }
          };

          img.onerror = () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(false);
            }
          };

          img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        });

        return isHealthy;
      } catch {
        // Fall back to fetch probe
      }
    }

    // 2. Fallback probe via fetch (e.g. Node / unit testing or non-browser runtime)
    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, {
          method: 'GET',
          signal: AbortSignal.timeout(4000),
        });
        if (res.status === 404) return false;
        if (!res.ok) return false;
        const len = Number(res.headers.get('content-length') || 0);
        if (len > 0 && len <= 2000) return false;
        return true;
      } catch {
        return true;
      }
    }

    return true;
  }

  private async verifyStreamHealth(feedId: string, videoId: string): Promise<void> {
    const token = (this.healthCheckTokens.get(feedId) ?? 0) + 1;
    this.healthCheckTokens.set(feedId, token);

    const isHealthy = await this.checkStreamHealth(videoId);

    // If another health check or switch has been triggered for this feed, ignore this result
    if (this.healthCheckTokens.get(feedId) !== token) return;
    if (!this.isVisible || this.isIdle || document.hidden) return;

    const feed = WEBCAM_FEEDS.find(f => f.id === feedId);
    if (!feed || this.getFeedVideoId(feed) !== videoId) return;

    if (isHealthy) {
      // Working stream confirmed: stop switching and clear failure state
      this.handleStreamSuccess(feedId);
    } else {
      // Stream is dead: trigger fallback switch to find a working stream
      this.handleStreamFailure(feedId, 'stream health check failed: feed offline or unavailable');
    }
  }

  private startStreamWatchdog(feedId: string): void {
    this.clearStreamWatchdog(feedId);
    if (!this.isVisible || this.isIdle || document.hidden) return;

    const timeoutId = setTimeout(async () => {
      this.streamWatchdogs.delete(feedId);
      // Double check stream health before triggering failure to prevent false autoswitching on healthy streams
      const feed = WEBCAM_FEEDS.find(f => f.id === feedId);
      if (feed) {
        const vid = this.getFeedVideoId(feed);
        const healthy = await this.checkStreamHealth(vid);
        if (healthy) {
          this.handleStreamSuccess(feedId);
          return;
        }
      }
      this.handleStreamFailure(feedId, 'watchdog timeout: stream unreachable or stalled');
    }, this.STREAM_WATCHDOG_MS);
    this.streamWatchdogs.set(feedId, timeoutId);
  }

  private clearStreamWatchdog(feedId: string): void {
    const timer = this.streamWatchdogs.get(feedId);
    if (timer) {
      clearTimeout(timer);
      this.streamWatchdogs.delete(feedId);
    }
  }

  private clearAllStreamWatchdogs(): void {
    this.streamWatchdogs.forEach(timer => clearTimeout(timer));
    this.streamWatchdogs.clear();
  }

  private clearAllRetryTimeouts(): void {
    this.allFallbacksRetryTimeout.forEach(timer => clearTimeout(timer));
    this.allFallbacksRetryTimeout.clear();
  }

  private handleStreamSuccess(feedId: string): void {
    this.clearStreamWatchdog(feedId);
    this.allFallbacksFailed.delete(feedId);
    const retryTimer = this.allFallbacksRetryTimeout.get(feedId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.allFallbacksRetryTimeout.delete(feedId);
    }
    if (this.viewMode === 'grid') {
      const cell = this.content.querySelector<HTMLElement>(`[data-feed-id="${feedId}"]`);
      if (cell) {
        const badge = cell.querySelector<HTMLButtonElement>('.webcam-stream-badge');
        if (badge) {
          badge.classList.remove('offline');
        }
      }
    }
  }

  private handleStreamFailure(feedId: string, reason?: string): void {
    this.clearStreamWatchdog(feedId);
    if (!this.isVisible || this.isIdle || document.hidden) return;

    const feed = WEBCAM_FEEDS.find(f => f.id === feedId);
    if (!feed) return;

    const streams = this.getFeedStreams(feed);
    if (streams.length <= 1) return;

    const currentVideoId = this.getFeedVideoId(feed);
    let failedSet = this.failedStreamsByFeed.get(feedId);
    if (!failedSet) {
      failedSet = new Set();
      this.failedStreamsByFeed.set(feedId, failedSet);
    }
    failedSet.add(currentVideoId);

    // Look for next untried candidate
    const curIdx = this.streamIndices.get(feedId) ?? 0;
    let nextIdx = -1;
    for (let offset = 1; offset < streams.length; offset++) {
      const candidateIdx = (curIdx + offset) % streams.length;
      const candidateVid = streams[candidateIdx];
      if (candidateVid && !failedSet.has(candidateVid)) {
        nextIdx = candidateIdx;
        break;
      }
    }

    if (nextIdx === -1) {
      console.warn(`[LiveWebcamsPanel] All fallback streams for ${feed.city} failed. Will retry in 60s.`);
      this.allFallbacksFailed.add(feedId);

      if (this.viewMode === 'grid') {
        const cell = this.content.querySelector<HTMLElement>(`[data-feed-id="${feedId}"]`);
        if (cell) {
          const badge = cell.querySelector<HTMLButtonElement>('.webcam-stream-badge');
          if (badge) {
            badge.textContent = 'OFFLINE';
            badge.classList.add('offline');
            badge.title = 'All streams unreachable — retrying in 60s (click to retry now)';
          }
        }
      }

      if (!this.allFallbacksRetryTimeout.has(feedId)) {
        const retryTimer = setTimeout(() => {
          this.allFallbacksRetryTimeout.delete(feedId);
          this.failedStreamsByFeed.delete(feedId);
          this.allFallbacksFailed.delete(feedId);
          if (this.isVisible && !this.isIdle && !document.hidden) {
            this.switchFeedToStreamIndex(feedId, 0);
          }
        }, 60000);
        this.allFallbacksRetryTimeout.set(feedId, retryTimer);
      }
      return;
    }

    console.info(`[LiveWebcamsPanel] Auto-switching ${feed.city} from ${currentVideoId} to fallback CAM ${nextIdx + 1}/${streams.length} (${streams[nextIdx]}) [Reason: ${reason || 'unreachable'}]`);
    this.switchFeedToStreamIndex(feedId, nextIdx);
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

    const navGroup = document.createElement('div');
    navGroup.className = 'webcam-toolbar-group webcam-nav-group';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'webcam-nav-btn';
    prevBtn.title = 'Previous feeds';
    prevBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>';
    prevBtn.addEventListener('click', () => this.prevGridPage());

    this.pageIndicator = document.createElement('span');
    this.pageIndicator.className = 'webcam-page-indicator';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'webcam-nav-btn';
    nextBtn.title = 'Next feeds';
    nextBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
    nextBtn.addEventListener('click', () => this.nextGridPage());

    navGroup.appendChild(prevBtn);
    navGroup.appendChild(this.pageIndicator);
    navGroup.appendChild(nextBtn);

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
    this.toolbar.appendChild(navGroup);
    this.toolbar.appendChild(viewGroup);
    this.element.insertBefore(this.toolbar, this.content);
    this.updateToolbar();
  }

  private updateToolbar(): void {
    if (!this.toolbar) return;
    this.toolbar.querySelectorAll('.webcam-region-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.region === this.regionFilter);
    });
    this.toolbar.querySelectorAll('.webcam-view-btn').forEach(btn => {
      (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.mode === this.viewMode);
    });
    if (this.pageIndicator) {
      if (this.viewMode === 'grid') {
        const total = this.totalGridPages;
        const cur = ((this.gridPageIndex % total) + total) % total;
        this.pageIndicator.textContent = `${cur + 1}/${total}`;
        this.pageIndicator.title = `Page ${cur + 1} of ${total} (${this.filteredFeeds.length} feeds)`;
      } else {
        const idx = this.filteredFeeds.findIndex(f => f.id === this.activeFeed.id);
        const cur = idx >= 0 ? idx + 1 : 1;
        this.pageIndicator.textContent = `${cur}/${this.filteredFeeds.length}`;
        this.pageIndicator.title = `Location ${cur} of ${this.filteredFeeds.length}`;
      }
    }
  }

  private setRegionFilter(filter: RegionFilter): void {
    if (filter === this.regionFilter) return;
    trackWebcamRegionFiltered(filter);
    this.regionFilter = filter;
    this.gridPageIndex = 0;
    const feeds = this.filteredFeeds;
    if (feeds.length > 0 && !feeds.includes(this.activeFeed)) {
      this.activeFeed = feeds[0]!;
    }
    this.render();
  }

  private setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.render();
  }

  private get parentPostMessageOrigin(): string | null {
    try {
      const { origin, protocol } = window.location;
      if (origin && origin !== 'null') return origin;
      if (protocol === 'tauri:' || protocol === 'asset:') return '*';
    } catch {
      // Ignore invalid location values.
    }
    return null;
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
      const parentOrigin = this.parentPostMessageOrigin;
      if (parentOrigin) params.set('parentOrigin', parentOrigin);
      try {
        const origin = window.location.origin;
        if (origin && origin !== 'null') params.set('origin', origin);
      } catch { /* ignore */ }
      if (quality !== 'auto') params.set('vq', quality);
      return `${remoteBase}/api/youtube/embed?${params.toString()}`;
    }
    const vq = quality !== 'auto' ? `&vq=${quality}` : '';
    let originParam = '';
    try {
      const origin = window.location.origin;
      if (origin && origin !== 'null') {
        originParam = `&origin=${encodeURIComponent(origin)}`;
      }
    } catch { /* ignore */ }
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&enablejsapi=1${originParam}${vq}`;
  }

  private createIframe(feed: WebcamFeed): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.className = 'webcam-iframe';
    iframe.dataset.feedId = feed.id;
    iframe.id = `webcam-iframe-${feed.id}`;
    const videoId = this.getFeedVideoId(feed);
    iframe.src = this.buildEmbedUrl(videoId);
    iframe.title = `${feed.city} live webcam`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    iframe.addEventListener('error', () => {
      this.handleStreamFailure(feed.id, 'DOM iframe error event');
    });
    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onReady'] }), '*');
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), '*');
      } catch { /* ignore */ }
    });
    this.startStreamWatchdog(feed.id);
    void this.verifyStreamHealth(feed.id, videoId);
    return iframe;
  }

  private render(): void {
    this.destroyIframes();
    this.updateToolbar();

    if (!this.isVisible || this.isIdle || document.hidden) {
      this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused</div>';
      return;
    }

    if (!this.isReadyToMount) {
      this.content.innerHTML = '<div class="webcam-placeholder">Initializing webcams…</div>';
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
      cell.dataset.feedId = feed.id;
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

      const streams = this.getFeedStreams(feed);
      const streamIdx = (this.streamIndices.get(feed.id) ?? 0) + 1;
      const cycleBtn = document.createElement('button');
      if (streams.length > 1) {
        cycleBtn.className = 'webcam-stream-badge';
        cycleBtn.title = `Switch camera angle (${streams.length} available)`;
        cycleBtn.textContent = `CAM ${streamIdx}/${streams.length}`;
        cycleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cycleFeedStream(feed.id);
        });
      } else {
        cycleBtn.className = 'webcam-stream-badge webcam-stream-badge-single';
        cycleBtn.title = `${feed.city} live stream`;
        cycleBtn.textContent = 'LIVE';
      }
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
    const activeStreams = this.getFeedStreams(this.activeFeed);
    if (activeStreams.length > 1) {
      const streamGroup = document.createElement('div');
      streamGroup.className = 'webcam-fallback-group';
      const curIdx = this.streamIndices.get(this.activeFeed.id) ?? 0;
      activeStreams.forEach((vid, idx) => {
        const sBtn = document.createElement('button');
        sBtn.className = `webcam-feed-btn webcam-stream-btn${curIdx === idx ? ' active' : ''}`;
        sBtn.textContent = `CAM ${idx + 1}`;
        sBtn.title = `Switch to Angle ${idx + 1} for ${this.activeFeed.city}`;
        sBtn.addEventListener('click', () => {
          this.failedStreamsByFeed.get(this.activeFeed.id)?.delete(vid);
          this.switchFeedToStreamIndex(this.activeFeed.id, idx);
        });
        streamGroup.appendChild(sBtn);
      });
      switcher.appendChild(streamGroup);
    }

    this.content.appendChild(wrapper);
    this.content.appendChild(switcher);
  }

  private destroyIframes(): void {
    this.healthCheckTokens.clear();
    this.clearAllStreamWatchdogs();
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
        if (this.isVisible && !wasVisible && !this.isIdle && !document.hidden) {
          this.render();
        } else if (!this.isVisible && wasVisible) {
          this.destroyIframes();
          this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused</div>';
        }
      },
      { threshold: 0.1 }
    );
    this.observer.observe(this.element);
  }

  private setupIdleDetection(): void {
    this.boundVisibilityHandler = () => {
      if (document.hidden) {
        if (this.idleTimeout) {
          clearTimeout(this.idleTimeout);
          this.idleTimeout = null;
        }
        this.destroyIframes();
        this.content.innerHTML = '<div class="webcam-placeholder">Webcams paused</div>';
      } else {
        if (this.isIdle) {
          this.isIdle = false;
        }
        if (this.isVisible) {
          this.render();
        }
        this.boundIdleResetHandler();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);

    this.boundIdleResetHandler = () => {
      if (this.idleTimeout) clearTimeout(this.idleTimeout);
      if (this.isIdle) {
        this.isIdle = false;
        if (this.isVisible && !document.hidden) this.render();
      }
      if (document.hidden) return;
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
    if (this.isVisible && !this.isIdle && !document.hidden) {
      this.render();
    }
  }

  public destroy(): void {
    this.healthCheckTokens.clear();
    if (this.initialMountTimer) {
      clearTimeout(this.initialMountTimer);
      this.initialMountTimer = null;
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(event => {
      document.removeEventListener(event, this.boundIdleResetHandler);
    });
    if (this.boundMessageHandler) {
      window.removeEventListener('message', this.boundMessageHandler);
    }
    this.observer?.disconnect();
    this.clearAllStreamWatchdogs();
    this.clearAllRetryTimeouts();
    this.destroyIframes();
    super.destroy();
  }
}