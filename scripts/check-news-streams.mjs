#!/usr/bin/env node

/**
 * Script to check and update live news streams for the News Broadcast Livestream Panel.
 *
 * Usage:
 *   node scripts/check-news-streams.mjs           # Check all channels and report status
 *   node scripts/check-news-streams.mjs --update  # Check and update broken fallbackVideoId in LiveNewsPanel.ts
 *   node scripts/check-news-streams.mjs --channel=sky  # Check/update specific channel
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL_PATH = resolve(__dirname, '../src/components/LiveNewsPanel.ts');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Tests if a YouTube video ID is currently playable and embeddable.
 */
export async function verifyVideoPlayable(videoId) {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return { playable: false, reason: 'Invalid video ID format' };
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { playable: false, reason: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const match = html.match(/var ytInitialPlayerResponse = ({.*?});/);
    if (!match) {
      // Fallback check in raw HTML
      const isUnavailable = html.includes('Video unavailable') || html.includes('UNPLAYABLE');
      return { playable: !isUnavailable, reason: isUnavailable ? 'Video unavailable' : 'Unknown status' };
    }

    const data = JSON.parse(match[1]);
    const playability = data.playabilityStatus || {};
    const status = playability.status;
    const isPlayable = status === 'OK';
    const isEmbeddable = playability.playableInEmbed !== false;
    const title = data.videoDetails?.title || '';
    const isLive = data.videoDetails?.isLive || false;

    if (!isPlayable) {
      return { playable: false, reason: playability.reason || status || 'Unplayable' };
    }
    if (!isEmbeddable) {
      return { playable: false, reason: 'Embedding disabled by owner' };
    }

    return { playable: true, isLive, title };
  } catch (err) {
    return { playable: false, reason: err.message };
  }
}

/**
 * Discovers the active live stream video ID for a YouTube channel handle.
 */
export async function findChannelLiveStream(handle) {
  if (!handle) return null;
  const channelHandle = handle.startsWith('@') ? handle : `@${handle}`;

  try {
    const liveUrl = `https://www.youtube.com/${channelHandle}/live`;
    const res = await fetch(liveUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // 1. Try canonical / og:url link
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
    const ogMatch = html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
    const candidateId = canonicalMatch?.[1] || ogMatch?.[1];

    if (candidateId) {
      const check = await verifyVideoPlayable(candidateId);
      if (check.playable) {
        return { videoId: candidateId, title: check.title, isLive: check.isLive };
      }
    }

    // 2. Try parsing videoDetails in page payload
    const detailsIdx = html.indexOf('"videoDetails"');
    if (detailsIdx !== -1) {
      const block = html.substring(detailsIdx, detailsIdx + 5000);
      const vidMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (vidMatch && vidMatch[1] !== candidateId) {
        const check = await verifyVideoPlayable(vidMatch[1]);
        if (check.playable) {
          return { videoId: vidMatch[1], title: check.title, isLive: check.isLive };
        }
      }
    }

    // 3. Search query fallback: query channel live streams
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(handle + ' live')}&sp=CAM%253D`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (searchRes.ok) {
      const searchHtml = await searchRes.text();
      const regex = /"videoRenderer":{"videoId":"([a-zA-Z0-9_-]{11})"/g;
      let m;
      while ((m = regex.exec(searchHtml)) !== null) {
        const check = await verifyVideoPlayable(m[1]);
        if (check.playable && check.isLive) {
          return { videoId: m[1], title: check.title, isLive: true };
        }
      }
    }
  } catch (err) {
    console.error(`  [Error checking ${channelHandle}]:`, err.message);
  }

  return null;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes('--update') || args.includes('--fix');
  const targetChannelArg = args.find((a) => a.startsWith('--channel='));
  const targetChannelId = targetChannelArg ? targetChannelArg.split('=')[1].trim().toLowerCase() : null;

  console.log('--- News Broadcast Livestream Checker ---');
  console.log(`Mode: ${shouldUpdate ? 'CHECK & UPDATE' : 'CHECK ONLY'}`);
  if (targetChannelId) console.log(`Target channel: ${targetChannelId}`);

  let panelContent = readFileSync(PANEL_PATH, 'utf-8');

  // Extract channels from LiveNewsPanel.ts
  const channelRegex = /{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*handle:\s*'([^']+)'(?:,\s*fallbackVideoId:\s*'([^']+)')?(?:,\s*useFallbackOnly:\s*(true|false))?[^}]*}/g;
  let match;
  const channels = [];

  while ((match = channelRegex.exec(panelContent)) !== null) {
    channels.push({
      fullMatch: match[0],
      id: match[1],
      name: match[2],
      handle: match[3],
      fallbackVideoId: match[4] || null,
      useFallbackOnly: match[5] === 'true',
    });
  }

  const selectedChannels = targetChannelId
    ? channels.filter((c) => c.id.toLowerCase() === targetChannelId)
    : channels;

  if (selectedChannels.length === 0) {
    console.error(`No channels found matching "${targetChannelId}"`);
    process.exit(1);
  }

  console.log(`Found ${selectedChannels.length} channel(s) to verify.\n`);

  let brokenCount = 0;
  let fixedCount = 0;

  for (const ch of selectedChannels) {
    process.stdout.write(`Checking [${ch.id}] (${ch.name})... `);

    let isFallbackOk = false;
    let fallbackInfo = null;

    if (ch.fallbackVideoId) {
      fallbackInfo = await verifyVideoPlayable(ch.fallbackVideoId);
      isFallbackOk = fallbackInfo.playable;
    }

    if (isFallbackOk) {
      console.log(`OK (Fallback ${ch.fallbackVideoId} is active: "${fallbackInfo.title}")`);
      continue;
    }

    // Fallback is broken or missing
    brokenCount++;
    console.log(`BROKEN (Fallback ${ch.fallbackVideoId || 'none'} failed: ${fallbackInfo?.reason || 'missing'})`);
    console.log(`  -> Searching for new active stream for ${ch.handle}...`);

    const newLive = await findChannelLiveStream(ch.handle);
    if (newLive && newLive.videoId) {
      console.log(`  -> FOUND active stream: ${newLive.videoId} ("${newLive.title}")`);

      if (shouldUpdate) {
        // Construct replacement channel string
        let replacement;
        if (ch.fallbackVideoId) {
          replacement = ch.fullMatch.replace(
            `fallbackVideoId: '${ch.fallbackVideoId}'`,
            `fallbackVideoId: '${newLive.videoId}'`,
          );
        } else {
          // Channel didn't have fallbackVideoId, insert it before closing brace
          replacement = ch.fullMatch.replace(
            /}\s*$/,
            `, fallbackVideoId: '${newLive.videoId}' }`,
          );
        }

        panelContent = panelContent.replace(ch.fullMatch, replacement);
        fixedCount++;
        console.log(`  -> Updated LiveNewsPanel.ts for [${ch.id}]`);
      }
    } else {
      console.log(`  -> No alternative live stream found for ${ch.handle}`);
    }
  }

  if (shouldUpdate && fixedCount > 0) {
    writeFileSync(PANEL_PATH, panelContent, 'utf-8');
    console.log(`\nSuccessfully updated ${fixedCount} channel(s) in LiveNewsPanel.ts!`);
  }

  console.log('\n--- Summary ---');
  console.log(`Total checked: ${selectedChannels.length}`);
  console.log(`Broken: ${brokenCount}`);
  if (shouldUpdate) {
    console.log(`Updated in LiveNewsPanel.ts: ${fixedCount}`);
  } else if (brokenCount > 0) {
    console.log('Run with --update to automatically apply fixes to LiveNewsPanel.ts');
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-news-streams.mjs')) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

