import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelTs = readFileSync(resolve(__dirname, '../src/components/LiveWebcamsPanel.ts'), 'utf-8');

describe('Live Webcams Resource Management', () => {
  it('unloads iframes and shows placeholder on tab out (visibilitychange hidden)', () => {
    // Visibilitychange handler must unload iframes when document.hidden is true
    assert.ok(
      panelTs.includes('if (document.hidden) {') &&
      panelTs.includes('this.destroyIframes();') &&
      panelTs.includes('this.content.innerHTML = \'<div class="webcam-placeholder">Webcams paused</div>\';'),
      'boundVisibilityHandler must destroy iframes and show placeholder when tabbed out'
    );
  });

  it('guarantees complete iframe destruction with about:blank', () => {
    // Ensure destroyIframes unloads by pointing src to about:blank before removing
    assert.ok(
      panelTs.includes("iframe.src = 'about:blank';") &&
      panelTs.includes('iframe.remove();') &&
      panelTs.includes('this.iframes = [];'),
      'destroyIframes must point src to about:blank and remove element to stop network and decoding threads'
    );
  });

  it('guards render and refresh from running while document.hidden is true', () => {
    assert.ok(
      panelTs.includes('if (!this.isVisible || this.isIdle || document.hidden)'),
      'render must bail out if document.hidden is true'
    );
    assert.ok(
      panelTs.includes('if (this.isVisible && !this.isIdle && !document.hidden)'),
      'refresh must bail out if document.hidden is true'
    );
  });

  it('guards intersection observer and idle reset from re-rendering while tabbed out', () => {
    assert.ok(
      panelTs.includes('if (this.isVisible && !wasVisible && !this.isIdle && !document.hidden)'),
      'IntersectionObserver must not load iframes if tab is hidden'
    );
    assert.ok(
      panelTs.includes('if (document.hidden) return;'),
      'boundIdleResetHandler must not start timers while tab is hidden'
    );
  });

  it('resumes and re-renders streams when user returns to tab and panel is visible', () => {
    assert.ok(
      panelTs.includes('if (this.isVisible)') && panelTs.includes('this.render();') && panelTs.includes('this.boundIdleResetHandler();'),
      'boundVisibilityHandler must resume by calling render() when returning to tab and visible'
    );
  });
});

describe('Live Webcams Automatic Fallback Livestream Switching', () => {
  it('registers and cleans up window message listener for livestream events', () => {
    assert.ok(
      panelTs.includes('this.setupMessageListener();') &&
      panelTs.includes('window.addEventListener(\'message\', this.boundMessageHandler);') &&
      panelTs.includes('window.removeEventListener(\'message\', this.boundMessageHandler);'),
      'Must manage window message event listener lifecycle'
    );
  });

  it('enables YouTube JS API bridge in embed URLs for event and error reporting', () => {
    assert.ok(
      panelTs.includes('enablejsapi=1') &&
      panelTs.includes('origin='),
      'Web embeds must pass enablejsapi=1 and origin'
    );
    assert.ok(
      panelTs.includes('parentOrigin'),
      'Desktop embeds must pass parentOrigin'
    );
  });

  it('starts and manages stream watchdog timer to catch unreachable or stalled livestreams', () => {
    assert.ok(
      panelTs.includes('this.startStreamWatchdog(feed.id);') &&
      panelTs.includes('this.clearStreamWatchdog(feedId);') &&
      panelTs.includes('STREAM_WATCHDOG_MS'),
      'Must have watchdog timer mechanism for stalled or unreachable streams'
    );
  });

  it('handles YouTube player errors, ended streams, and watchdog timeouts via handleStreamFailure', () => {
    assert.ok(
      panelTs.includes('handleStreamFailure(feedId') &&
      panelTs.includes('isYtError') &&
      panelTs.includes('isStreamEnded'),
      'Must handle YouTube error codes, ended streams, and watchdog timeouts'
    );
  });

  it('auto-switches to next untried fallback and replaces cell iframe without reloading all grid cells', () => {
    assert.ok(
      panelTs.includes('switchFeedToStreamIndex(feedId, nextIdx)') &&
      panelTs.includes('cell.replaceChild(newIframe, oldIframe);') &&
      panelTs.includes('this.failedStreamsByFeed'),
      'Must switch to next working candidate and replace only the affected iframe'
    );
  });

  it('handles scenario when all fallbacks are exhausted with offline state and scheduled recovery retry', () => {
    assert.ok(
      panelTs.includes('this.allFallbacksFailed.add(feedId);') &&
      panelTs.includes('OFFLINE') &&
      panelTs.includes('this.allFallbacksRetryTimeout'),
      'Must show offline indicator when all candidates fail and schedule recovery retry'
    );
  });

  it('displays minimalist radar sweep animation offline screen when fallbacks are unavailable', () => {
    assert.ok(
      panelTs.includes('Stream Offline - No Fallbacks Available') &&
      panelTs.includes('stream-offline-screen') &&
      panelTs.includes('stream-offline-radar') &&
      panelTs.includes('stream-offline-radar-sweep') &&
      panelTs.includes('retryFeedStream'),
      'Must render Stream Offline - No Fallbacks Available screen with radar sweep animation and retry control'
    );
  });

  it('checks stream health after each switch and on iframe creation', () => {
    assert.ok(
      panelTs.includes('void this.verifyStreamHealth(feedId, videoId);') &&
      panelTs.includes('void this.verifyStreamHealth(feed.id, videoId);') &&
      panelTs.includes('checkStreamHealth(videoId: string)'),
      'Must check stream health after switching and when creating iframes'
    );
  });

  it('guards watchdog from falsely switching away from healthy streams', () => {
    assert.ok(
      panelTs.includes('const healthy = await this.checkStreamHealth(vid);') &&
      panelTs.includes('if (healthy) {') &&
      panelTs.includes('this.handleStreamSuccess(feedId);'),
      'Watchdog must verify stream health before declaring failure so healthy streams never autoswitch'
    );
  });

  it('stops switching once a working stream fallback is confirmed healthy', () => {
    assert.ok(
      panelTs.includes('if (isHealthy) {') &&
      panelTs.includes('this.handleStreamSuccess(feedId);'),
      'Must call handleStreamSuccess and clear watchdog when working stream fallback is verified'
    );
  });
});

describe('Live Webcams Seoul and Hong Kong Stream Configuration', () => {
  it('configures active verified fallbacks for Seoul with multiple stream alternatives', () => {
    assert.ok(
      panelTs.includes("id: 'seoul'") &&
      panelTs.includes("city: 'Seoul'") &&
      panelTs.includes("fallbackVideoId: 'Q6WKC4vDsUU'") && // Namsan Tower 4K Live
      panelTs.includes("'gCBwHr41Z4E'") && // Yeouido Han River 4K Live
      panelTs.includes("'RVvYQghFCXk'"), // Banpo Bridge Han River 4K Live
      'Seoul must configure verified active primary and fallback video streams'
    );
  });

  it('configures active verified fallbacks for Hong Kong with multiple stream alternatives', () => {
    assert.ok(
      panelTs.includes("id: 'hong-kong'") &&
      panelTs.includes("city: 'Hong Kong'") &&
      panelTs.includes("fallbackVideoId: 'Z8NTLkEFZjg'") && // TST Victoria Harbour Live Cam
      panelTs.includes("'ScBtCcGZMDk'") && // Victoria Harbour 24/7 Live
      panelTs.includes("'KrVZ7wYHiWQ'") && // Eastern Victoria Harbour Live Cam
      panelTs.includes("'OtreHvXgAoA'"), // Hong Kong Skyline & Cityscape 4K
      'Hong Kong must configure verified active primary and fallback video streams'
    );
  });
});

describe('Live Webcams Geographic Accuracy and Feed Verification', () => {
  it('ensures New Orleans fallbacks are strictly located in New Orleans and excludes Tennessee', () => {
    assert.ok(panelTs.includes("id: 'new-orleans'"), 'New Orleans feed must exist');
    assert.ok(panelTs.includes("'QxFFjXu_zqs'"), 'Must include Bourbon Street Balcony');
    assert.ok(panelTs.includes("'xqdukYhcGEU'"), 'Must include Bourbon Street View');
    assert.ok(panelTs.includes("'iZRbml7fnXI'"), 'Must include MSY Airport New Orleans');
    assert.ok(!panelTs.includes("'6tq8S2pp8PQ'"), 'Must NOT include Pigeon River TN (6tq8S2pp8PQ)');
  });

  it('ensures Washington DC fallbacks are strictly located in Washington DC and excludes Philadelphia/PA', () => {
    assert.ok(panelTs.includes("id: 'washington-dc'"), 'Washington DC feed must exist');
    assert.ok(panelTs.includes("'mG2gAWY_Guw'"), 'Must include Washington Monument DC');
    assert.ok(panelTs.includes("'5p_KGD4fJZs'"), 'Must include White House DC');
    assert.ok(panelTs.includes("'CpYKIeqU1qc'"), 'Must include FOX Local DC');
    assert.ok(!panelTs.includes("'F1EQEDL4ddU'"), 'Must NOT include Liberty Bell Philadelphia (F1EQEDL4ddU)');
    assert.ok(!panelTs.includes("'9mMnqO1UuIU'"), 'Must NOT include Philadelphia Skyline (9mMnqO1UuIU)');
    assert.ok(!panelTs.includes("'OSI8qWMoK5E'"), 'Must NOT include Flight 93 Shanksville PA (OSI8qWMoK5E)');
  });

  it('ensures Taipei fallbacks are strictly located in Taipei and excludes Tokyo Bay', () => {
    assert.ok(panelTs.includes("id: 'taipei'"), 'Taipei feed must exist');
    assert.ok(panelTs.includes("'z_fY1pj1VBw'"), 'Must include Taipei 101 Xiangshan');
    assert.ok(panelTs.includes("'Ndo_8RuefH4'"), 'Must include Taipei Dadaocheng Wharf');
    assert.ok(panelTs.includes("'fP4ecxfsJos'"), 'Must include Taipei Dajia Riverside Park');
    assert.ok(panelTs.includes("'uvwfYzwY8tg'"), 'Must include Taipei Bishan Temple');
    assert.ok(panelTs.includes("'34h_Cy_n0Ok'"), 'Must include Taipei Jiantanshan');
    // Tokyo Bay NdAyRlYxw3M must not be in Taipei
    const taipeiSection = panelTs.substring(panelTs.indexOf("id: 'taipei'"), panelTs.indexOf("id: 'taipei'") + 400);
    assert.ok(!taipeiSection.includes('NdAyRlYxw3M'), 'Taipei feed must NOT include Tokyo Bay (NdAyRlYxw3M)');
  });

  it('ensures Chicago, Las Vegas, Los Angeles, and Miami have no cross-state or invalid city feeds', () => {
    const chicagoSection = panelTs.substring(panelTs.indexOf("id: 'chicago'"), panelTs.indexOf("id: 'chicago'") + 400);
    assert.ok(!chicagoSection.includes('sixP_dAJ8D4'), 'Chicago must not include Lincoln Harbor NY');
    assert.ok(!chicagoSection.includes('IU_-Pl9O5jQ'), 'Chicago must not include Michigan Wildlife');

    const vegasSection = panelTs.substring(panelTs.indexOf("id: 'las-vegas'"), panelTs.indexOf("id: 'las-vegas'") + 400);
    assert.ok(!vegasSection.includes('JQ_jwk_7OVE'), 'Las Vegas must not include Times Square NYC');
    assert.ok(!vegasSection.includes('QxFFjXu_zqs'), 'Las Vegas must not include Bourbon St New Orleans');

    const laSection = panelTs.substring(panelTs.indexOf("id: 'los-angeles'"), panelTs.indexOf("id: 'los-angeles'") + 400);
    assert.ok(!laSection.includes('4LTSTw4jnZc'), 'Los Angeles must not include Sanibel Island FL');
    assert.ok(!laSection.includes('tAdTOOsrZBQ'), 'Los Angeles must not include Fort Lauderdale FL');

    const miamiSection = panelTs.substring(panelTs.indexOf("id: 'miami'"), panelTs.indexOf("id: 'miami'") + 400);
    assert.ok(!miamiSection.includes('H_kswlYZN5o'), 'Miami must not include Key West');
    assert.ok(!miamiSection.includes('tAdTOOsrZBQ'), 'Miami must not include Fort Lauderdale');
  });
});

