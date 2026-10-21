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
});
