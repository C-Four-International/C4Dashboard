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
