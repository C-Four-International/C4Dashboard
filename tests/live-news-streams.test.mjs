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


describe('Optional Channels in Manage Channels Modal', () => {
  it('corrects all official handles and removes dead 404 handles', () => {
    // Verified official handles
    assert.ok(panelTs.includes("handle: '@WELTVideoTV'"), 'WELT must use official @WELTVideoTV handle');
    assert.ok(panelTs.includes("handle: '@recordnews'"), 'Record News must use @recordnews handle');
    assert.ok(panelTs.includes("handle: '@T13_cl'"), 'T13 must use official @T13_cl handle');
    assert.ok(panelTs.includes("handle: '@ChannelsTelevision'"), 'Channels TV must use @ChannelsTelevision');
    assert.ok(panelTs.includes("handle: '@ktnnews_kenya'"), 'KTN News must use @ktnnews_kenya');
    assert.ok(panelTs.includes("handle: '@sabcdigitalnews'"), 'SABC News must use @sabcdigitalnews');
    assert.ok(panelTs.includes("handle: '@WION'"), 'WION must use @WION');

    // Confirm dead/mangled handles are gone
    assert.ok(!panelTs.includes('@WELTNachrichtensender'), 'Defunct @WELTNachrichtensender must be removed');
    assert.ok(!panelTs.includes('@recordnewsoficial'), '404 @recordnewsoficial must be removed');
    assert.ok(!panelTs.includes("@channelstv'"), '404 @channelstv must be removed');
    assert.ok(!panelTs.includes('@KTNNewsKE'), '404 @KTNNewsKE must be removed');
    assert.ok(!panelTs.includes("@SABCNews'"), '404 @SABCNews must be removed');
  });

  it('provides a valid fallbackVideoId for every channel in OPTIONAL_LIVE_CHANNELS', () => {
    const optMatch = panelTs.match(/export const OPTIONAL_LIVE_CHANNELS: LiveChannel\[\] = (\[[\s\S]*?\]);/);
    assert.ok(optMatch, 'OPTIONAL_LIVE_CHANNELS array must exist');
    const channels = eval(optMatch[1]);
    for (const ch of channels) {
      assert.ok(
        ch.fallbackVideoId && /^[a-zA-Z0-9_-]{11}$/.test(ch.fallbackVideoId),
        `Channel ${ch.id} (${ch.name}) must have a valid 11-char fallbackVideoId`
      );
    }
  });

  it('ensures all channel IDs in OPTIONAL_CHANNEL_REGIONS exist in OPTIONAL_LIVE_CHANNELS', () => {
    const optMatch = panelTs.match(/export const OPTIONAL_LIVE_CHANNELS: LiveChannel\[\] = (\[[\s\S]*?\]);/);
    const regMatch = panelTs.match(/export const OPTIONAL_CHANNEL_REGIONS:[^=]*= (\[[\s\S]*?\]);/);
    const channels = eval(optMatch[1]);
    const regions = eval(regMatch[1]);

    const channelIdSet = new Set(channels.map((c) => c.id));
    for (const reg of regions) {
      for (const id of reg.channelIds) {
        assert.ok(channelIdSet.has(id), `Region ${reg.key} contains unknown channel ID "${id}"`);
      }
    }
  });
});
