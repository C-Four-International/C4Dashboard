import './styles/base-layer.css';
import './styles/happy-theme.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { App } from './App';

// ─── Sentry Lazy-Load ────────────────────────────────────────────────────────
// Instead of loading the full Sentry SDK (~50 KB) on every page load, we
// install a lightweight interceptor that buffers errors and only imports the
// SDK on first error. Error-free sessions never pay the download cost.

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const sentryEnabled =
  Boolean(sentryDsn) &&
  !location.hostname.startsWith('localhost') &&
  !('__TAURI_INTERNALS__' in window);

type BufferedError =
  | { kind: 'error'; event: ErrorEvent }
  | { kind: 'rejection'; event: PromiseRejectionEvent };

const ERROR_BUFFER_MAX = 5;
let sentryReady = false;
let sentryLoading = false;
const errorBuffer: BufferedError[] = [];

async function loadSentry(): Promise<void> {
  if (sentryReady || sentryLoading || !sentryEnabled) return;
  sentryLoading = true;

  try {
    const Sentry = await import('@sentry/browser');

    Sentry.init({
      dsn: sentryDsn,
      release: `worldmonitor@${__APP_VERSION__}`,
      environment: location.hostname === 'worldmonitor.app' ? 'production'
        : location.hostname.includes('vercel.app') ? 'preview'
        : 'development',
      enabled: true,
      sendDefaultPii: true,
      tracesSampleRate: 0.1,
      ignoreErrors: [
        'Invalid WebGL2RenderingContext',
        'WebGL context lost',
        /imageManager/,
        /ResizeObserver loop/,
        /NotAllowedError/,
        /InvalidAccessError/,
        /importScripts/,
        /^TypeError: Load failed( \(.*\))?$/,
        /^TypeError: Failed to fetch( \(.*\))?$/,
        /^TypeError: cancelled$/,
        /^TypeError: NetworkError/,
        /runtime\.sendMessage\(\)/,
        /Java object is gone/,
        /^Object captured as promise rejection with keys:/,
        /Unable to load image/,
        /Non-Error promise rejection captured with value:/,
        /Connection to Indexed Database server lost/,
        /webkit\.messageHandlers/,
        /(?:unsafe-eval.*Content Security Policy|Content Security Policy.*unsafe-eval)/,
        /Fullscreen request denied/,
        /requestFullscreen/,
        /webkitEnterFullscreen/,
        /vc_text_indicators_context/,
        /Program failed to link/,
        /too much recursion/,
        /zaloJSV2/,
        /Java bridge method invocation error/,
        /Could not compile fragment shader/,
        /can't redefine non-configurable property/,
        /Can.t find variable: (CONFIG|currentInset|NP)/,
        /invalid origin/,
        /\.data\.split is not a function/,
        /signal is aborted without reason/,
        /Failed to fetch dynamically imported module/,
        /Importing a module script failed/,
        /contentWindow\.postMessage/,
        /Could not compile vertex shader/,
        /objectStoreNames/,
        /Unexpected identifier 'https'/,
        /Can't find variable: _0x/,
        /WKWebView was deallocated/,
        /Unexpected end of input/,
        /window\.android\.\w+ is not a function/,
        /Attempted to assign to readonly property/,
        /Cannot assign to read only property/,
        /FetchEvent\.respondWith/,
        /e\.toLowerCase is not a function/,
        /\.trim is not a function/,
        /\.(indexOf|findIndex) is not a function/,
        /QuotaExceededError/,
        /^TypeError: 已取消$/,
        /Maximum call stack size exceeded/,
        /^fetchError: Network request failed$/,
        /window\.ethereum/,
        /^SyntaxError: Unexpected token/,
        /^Operation timed out\.?$/,
        /setting 'luma'/,
        /ML request .* timed out/,
        /^Element not found$/,
        /^The operation was aborted\.?\s*$/,
        /Unexpected end of script/,
        /error loading dynamically imported module/,
        /Style is not done loading/,
        /Event `CustomEvent`.*captured as promise rejection/,
        /getProgramInfoLog/,
        /__firefox__/,
        /ifameElement\.contentDocument/,
        /Invalid video id/,
        /Fetch is aborted/,
        /Stylesheet append timeout/,
        /Worker is not a constructor/,
        /_pcmBridgeCallbackHandler/,
        /UCShellJava/,
        /Cannot define multiple custom elements/,
        /maxTextureDimension2D/,
        /Container app not found/,
        /this\.St\.unref/,
        /Invalid or unexpected token/,
        /evaluating 'elemFound\.value'/,
        /[Cc]an(?:'t|not) access (?:'\w+'|lexical declaration '\w+') before initialization/,
        /^Uint8Array$/,
        /createObjectStore/,
        /The database connection is closing/,
        /shortcut icon/,
        /Attempting to change value of a readonly property/,
        /reading 'nodeType'/,
        /feature named .pageContext. was not found/,
        /a2z\.onStatusUpdate/,
        /Attempting to run\(\), but is already running/,
        /this\.player\.destroy is not a function/,
        /isReCreate is not defined/,
        /reading 'style'.*HTMLImageElement/,
        /can't access property "write", \w+ is undefined/,
      ],
      beforeSend(event) {
        const msg = event.exception?.values?.[0]?.value ?? '';
        if (msg.length <= 3 && /^[a-zA-Z_$]+$/.test(msg)) return null;
        const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
        if (/this\.style\._layers|reading '_layers'|this\.light is null|can't access property "(id|type|setFilter)", \w+ is (null|undefined)|Cannot read properties of null \(reading '(id|type|setFilter|_layers)'\)|null is not an object \(evaluating '\w{1,3}\.(id|style)|^\w{1,2} is null$/.test(msg)) {
          if (frames.some(f => /\/(map|maplibre|deck-stack)-[A-Za-z0-9-]+\.js/.test(f.filename ?? ''))) return null;
        }
        if (/^TypeError:/.test(msg) && frames.length > 0) {
          const nonSentryFrames = frames.filter(f => !/\/sentry-[A-Za-z0-9-]+\.js/.test(f.filename ?? ''));
          if (nonSentryFrames.length > 0 && nonSentryFrames.every(f => /\/(map|maplibre|deck-stack)-[A-Za-z0-9-]+\.js/.test(f.filename ?? ''))) return null;
        }
        if (frames.length > 0 && frames.every(f => /^blob:/.test(f.filename ?? ''))) return null;
        if (frames.some(f => /www-widgetapi\.js/.test(f.filename ?? ''))) return null;
        if (frames.some(f => /\/ingest\/static\/logs\.js/.test(f.filename ?? ''))) return null;
        return event;
      },
    });

    // Remove the lightweight listeners — Sentry now handles everything natively
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);

    // Replay buffered errors through the now-ready SDK
    for (const entry of errorBuffer) {
      if (entry.kind === 'error' && entry.event.error) {
        Sentry.captureException(entry.event.error);
      } else if (entry.kind === 'rejection') {
        Sentry.captureException(entry.event.reason);
      }
    }
    errorBuffer.length = 0;
    sentryReady = true;
  } catch {
    // If Sentry fails to load, silently continue — monitoring is best-effort
  }
  sentryLoading = false;
}

function onError(event: ErrorEvent): void {
  if (!sentryEnabled) return;
  if (errorBuffer.length < ERROR_BUFFER_MAX) errorBuffer.push({ kind: 'error', event });
  void loadSentry();
}

function onRejection(event: PromiseRejectionEvent): void {
  if (event.reason?.name === 'NotAllowedError') { event.preventDefault(); return; }
  if (!sentryEnabled) return;
  if (errorBuffer.length < ERROR_BUFFER_MAX) errorBuffer.push({ kind: 'rejection', event });
  void loadSentry();
}

window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onRejection);


import { debugInjectTestEvents, debugGetCells, getCellCount } from '@/services/geo-convergence';
import { initMetaTags } from '@/services/meta-tags';
import { installRuntimeFetchPatch } from '@/services/runtime';
import { loadDesktopSecrets } from '@/services/runtime-config';
import { initAnalytics, trackApiKeysSnapshot } from '@/services/analytics';
import { applyStoredTheme } from '@/utils/theme-manager';
import { SITE_VARIANT } from '@/config/variant';
import { clearChunkReloadGuard, installChunkReloadGuard } from '@/bootstrap/chunk-reload';
import { CookieConsent } from './components/CookieConsent';
import './styles/cookie-consent.css';

// Auto-reload on stale chunk 404s after deployment (Vite fires this for modulepreload failures).
const chunkReloadStorageKey = installChunkReloadGuard(__APP_VERSION__);

// Tracking Initialization Logic
function initializeTracking() {
  inject();
  injectSpeedInsights();
  void initAnalytics().then(() => {
    // Only track snapshot if secrets are loaded/available. If desktop secrets load later, 
    // we may miss it, but this is the safest ordering.
    trackApiKeysSnapshot();
  });
  
  // Update Google Analytics Consent
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as any).gtag('consent', 'update', {
      'ad_storage': 'granted',
      'analytics_storage': 'granted'
    });
  }
}

const consentStatus = CookieConsent.getConsentStatus();
if (consentStatus === 'accepted') {
  initializeTracking();
} else if (consentStatus === null) {
  const initBanner = () => {
    const banner = new CookieConsent({
      onAccept: () => initializeTracking(),
      onReject: () => {}
    });
    banner.show();
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBanner);
  } else {
    initBanner();
  }
}

// Initialize dynamic meta tags for sharing
initMetaTags();

// In desktop mode, route /api/* calls to the local Tauri sidecar backend.
installRuntimeFetchPatch();
loadDesktopSecrets().then(async () => {
  if (CookieConsent.getConsentStatus() === 'accepted') {
    await initAnalytics();
    trackApiKeysSnapshot();
  }
}).catch(() => {});

// Apply stored theme preference before app initialization (safety net for inline script)
applyStoredTheme();

// Set data-variant on <html> so CSS theme overrides activate (inline script handles hostname/localStorage,
// this catches the VITE_VARIANT env var path used during local dev and Vercel deployments)
if (SITE_VARIANT && SITE_VARIANT !== 'full') {
  document.documentElement.dataset.variant = SITE_VARIANT;
}

// Remove no-transition class after first paint to enable smooth theme transitions
requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transition');
});

// Clear stale settings-open flag (survives ungraceful shutdown)
localStorage.removeItem('wm-settings-open');

// Standalone windows: ?settings=1 = panel display settings, ?live-channels=1 = channel management
// Both need i18n initialized so t() does not return undefined.
const urlParams = new URL(location.href).searchParams;
if (urlParams.get('settings') === '1') {
  void Promise.all([import('./services/i18n'), import('./settings-window')]).then(
    async ([i18n, m]) => {
      await i18n.initI18n();
      m.initSettingsWindow();
    }
  );
} else if (urlParams.get('live-channels') === '1') {
  void Promise.all([import('./services/i18n'), import('./live-channels-window')]).then(
    async ([i18n, m]) => {
      await i18n.initI18n();
      m.initLiveChannelsWindow();
    }
  );
} else {
  const app = new App('app');
  app
    .init()
    .then(() => {
      clearChunkReloadGuard(chunkReloadStorageKey);
    })
    .catch(console.error);
}

// Debug helpers for geo-convergence testing (remove in production)
(window as unknown as Record<string, unknown>).geoDebug = {
  inject: debugInjectTestEvents,
  cells: debugGetCells,
  count: getCellCount,
};

// Beta mode toggle: type `beta=true` / `beta=false` in console
Object.defineProperty(window, 'beta', {
  get() {
    const on = localStorage.getItem('worldmonitor-beta-mode') === 'true';
    console.log(`[Beta] ${on ? 'ON' : 'OFF'}`);
    return on;
  },
  set(v: boolean) {
    if (v) localStorage.setItem('worldmonitor-beta-mode', 'true');
    else localStorage.removeItem('worldmonitor-beta-mode');
    location.reload();
  },
});

// Suppress native WKWebView context menu in Tauri — allows custom JS context menus
if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    // Allow native menu on text inputs/textareas for copy/paste
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    e.preventDefault();
  });
}

if (!('__TAURI_INTERNALS__' in window) && !('__TAURI__' in window)) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          setInterval(async () => {
            if (!navigator.onLine) return;
            try { await registration.update(); } catch {}
          }, 60 * 60 * 1000);
        }
      },
      onOfflineReady() {
        console.log('[PWA] App ready for offline use');
      },
    });
  });
}
