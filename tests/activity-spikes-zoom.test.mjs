import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelTs = readFileSync(resolve(__dirname, '../src/components/ActivitySpikesPanel.ts'), 'utf-8');
const collectorMjs = readFileSync(resolve(__dirname, '../scripts/ovh-activity-spikes/ovh-collector.mjs'), 'utf-8');

describe('Signal Activity Spikes Panel Reset Zoom Wiring', () => {
  it('correctly targets the reset zoom button from modal or panel root instead of immediate container parent', () => {
    assert.ok(
      panelTs.includes('getResetButton(container: HTMLElement)'),
      'ActivitySpikesPanel must provide a getResetButton helper'
    );
    assert.ok(
      panelTs.includes("container.closest<HTMLElement>('#activity-spikes-modal-overlay, .activity-spikes-panel')"),
      'getResetButton must find closest overlay or panel container'
    );
    assert.ok(
      panelTs.includes("root?.querySelector<HTMLButtonElement>('.activity-spikes-reset-zoom')"),
      'getResetButton must search root for .activity-spikes-reset-zoom'
    );
  });

  it('wires up onclick handler on the reset button with d3.zoomIdentity transition', () => {
    assert.ok(
      panelTs.includes('svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);'),
      'onclick must call zoomBehavior.transform with d3.zoomIdentity smoothly'
    );
    assert.ok(
      panelTs.includes('this.updateZoomControlsState(container, false);'),
      'onclick must reset zoom controls state'
    );
  });

  it('isolates modal zoom transform from panel zoom transform to avoid cross-container dimension mismatches', () => {
    assert.ok(
      panelTs.includes('private currentZoomTransform: d3.ZoomTransform = d3.zoomIdentity;') &&
      panelTs.includes('private modalZoomTransform: d3.ZoomTransform = d3.zoomIdentity;'),
      'Panel must have separate transform state for main panel and fullscreen modal'
    );
  });

  it('resets zoom transforms when switching theaters', () => {
    assert.ok(
      panelTs.includes('this.currentZoomTransform = d3.zoomIdentity;'),
      'Theater switch must reset currentZoomTransform'
    );
    assert.ok(
      panelTs.includes('this.modalZoomTransform = d3.zoomIdentity;'),
      'Modal theater switch must reset modalZoomTransform'
    );
  });

  it('updates opacity and cursor styling depending on whether chart is zoomed', () => {
    assert.ok(
      panelTs.includes("resetBtn.style.opacity = isZoomed ? '1' : '0.45';"),
      'updateZoomControlsState must dim unzoomed and highlight zoomed button'
    );
    assert.ok(
      panelTs.includes("resetBtn.style.cursor = isZoomed ? 'pointer' : 'default';"),
      'updateZoomControlsState must set appropriate cursor'
    );
  });

  it('configures 6-month (180-day) historical window across panel and collector', () => {
    assert.ok(
      panelTs.includes('TOTAL_BUCKETS = 720'),
      'Panel must configure 720 6-hour buckets across 180 days'
    );
    assert.ok(
      panelTs.includes('title="Reset zoom to 6 months"'),
      'Reset button tooltip must indicate 6 months'
    );
    assert.ok(
      collectorMjs.includes('RETENTION_SECONDS = 180 * 24 * 60 * 60'),
      'Collector must retain 180 days of historical telemetry'
    );
    assert.ok(
      collectorMjs.includes('N = 720'),
      'Collector must render 720 buckets'
    );
  });
});
