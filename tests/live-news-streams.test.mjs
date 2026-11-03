import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelTs = readFileSync(resolve(__dirname, '../src/components/LiveNewsPanel.ts'), 'utf-8');
const liveNewsTs = readFileSync(resolve(__dirname, '../src/services/live-news.ts'), 'utf-8');
const checkerScript = readFileSync(resolve(__dirname, '../scripts/check-news-streams.mjs'), 'utf-8');

describe('Live News Streams Configuration', () => {
  it('configures active Sky News stream as fallback in FULL_LIVE_CHANNELS', () => {
    // Must have umLWFz4izTM as Sky News fallback
    assert.match(
      panelTs,
      /id:\s*'sky',\s*name:\s*'SkyNews',\s*handle:\s*'@SkyNews',\s*fallbackVideoId:\s*'umLWFz4izTM'/,
      'Sky News fallbackVideoId must be the verified active live stream umLWFz4izTM'
    );
  });

  it('corrects channel handles for Euronews and TRT World', () => {
    assert.ok(panelTs.includes("handle: '@euronews'"), 'Euronews handle must be @euronews');
    assert.ok(!panelTs.includes('@euabortnews'), 'Mangled @euabortnews handle must not exist');
    assert.ok(panelTs.includes("handle: '@trtworld'"), 'TRT World handle must be @trtworld');
    assert.ok(!panelTs.includes('@taborrtworld'), 'Mangled @taborrtworld handle must not exist');
  });

  it('supports multiple fallback streams via optional fallbackVideoIds property', () => {
    assert.ok(
      panelTs.includes('fallbackVideoIds?: string[];'),
      'LiveChannel interface must support fallbackVideoIds array'
    );
  });
});

describe('Live News Stream Auto-Recovery and Failure Handling', () => {
  it('listens for YouTube player errors and stream ending to trigger recovery', () => {
    assert.ok(
      panelTs.includes('void this.handleStreamPlaybackFailure(this.activeChannel, errorCode);'),
      'onError must trigger handleStreamPlaybackFailure'
    );
    assert.ok(
      panelTs.includes('onStateChange: (event: { data: number }) => {') &&
      panelTs.includes('void this.handleStreamPlaybackFailure(this.activeChannel, 0);'),
      'onStateChange must trigger handleStreamPlaybackFailure when live stream ends (0)'
    );
  });

  it('checks for new live stream links directly from YouTube when playback fails', () => {
    assert.ok(
      panelTs.includes('clearLiveVideoCache(channel.handle);') &&
      panelTs.includes('const freshLiveId = await fetchLiveVideoId(channel.handle, true);'),
      'handleStreamPlaybackFailure must force-refresh and query YouTube for new stream link'
    );
    assert.ok(
      panelTs.includes('this.failedVideoIdsByChannel'),
      'Must track failed video IDs per channel to avoid loops'
    );
  });

  it('falls back through known and alternative streams before giving up', () => {
    assert.ok(
      panelTs.includes('channel.fallbackVideoId') &&
      panelTs.includes('channel.fallbackVideoIds'),
      'Must test fallbackVideoId and fallbackVideoIds'
    );
  });

  it('provides manual Check for New Stream action button in error screen', () => {
    assert.ok(
      panelTs.includes('Check for New Stream') &&
      panelTs.includes('.btn-check-stream'),
      'Error screen must offer an interactive button to re-check stream links'
    );
  });

  it('service supports forceRefresh and cache clearing', () => {
    assert.ok(
      liveNewsTs.includes('export async function fetchLiveVideoId(channelHandle: string, forceRefresh = false)'),
      'fetchLiveVideoId must support forceRefresh flag'
    );
    assert.ok(
      liveNewsTs.includes('export function clearLiveVideoCache'),
      'Service must export clearLiveVideoCache'
    );
  });
});

describe('News Stream Checker Script', () => {
  it('defines verifyVideoPlayable and findChannelLiveStream in script', () => {
    assert.ok(
      checkerScript.includes('export async function verifyVideoPlayable'),
      'Script must export verifyVideoPlayable'
    );
    assert.ok(
      checkerScript.includes('export async function findChannelLiveStream'),
      'Script must export findChannelLiveStream'
    );
  });

  it('supports --update flag to automatically fix broken streams in LiveNewsPanel.ts', () => {
    assert.ok(
      checkerScript.includes('--update') && checkerScript.includes('--fix'),
      'Script must support --update and --fix flags'
    );
  });
});

