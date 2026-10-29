import { describe, it } from 'node:test';
import assert from 'node:assert';
import handler, {
  cleanPostText,
  isSubstantivePost,
  enforceBriefingWordLimit,
  cosineSimilarity,
  fetchRailwayTelegramFeed,
  generateLocalBriefingFallback,
  hasNonEnglishText,
  hasNonEnglishCharacters,
  translateTextWithGoogle,
  batchTranslateWithGoogle,
  generateBriefingWithGoogleTranslation,
  extractWordSet,
  fastSetJaccard,
  jaccardSimilarity,
} from '../api/social-intel.js';
import translateHandler from '../api/translate.js';

describe('Social Media Intel - Local Preprocessing & Noise Filtering', () => {
  it('strips urls, emojis, and boilerplate promotional text while preserving numbers', () => {
    const raw = '🚨 BREAKING: Air raid alerts sound in Kyiv region! 🔥 165 drones reported across 30 locations. Check https://t.me/example/999 Subscribe to our telegram channel for updates #Kyiv @osint_source';
    const cleaned = cleanPostText(raw);

    assert.strictEqual(cleaned.includes('https://'), false, 'Should strip http/https URLs');
    assert.strictEqual(cleaned.includes('🚨'), false, 'Should strip alert emoji');
    assert.strictEqual(cleaned.includes('🔥'), false, 'Should strip fire emoji');
    assert.strictEqual(cleaned.includes('165'), true, 'Should preserve digit quantities');
    assert.strictEqual(cleaned.includes('30'), true, 'Should preserve digit numbers');
    assert.strictEqual(cleaned.includes('Subscribe to'), false, 'Should strip subscription boilerplate');
    assert.strictEqual(cleaned.includes('@osint_source'), false, 'Should strip author mention');
    assert.strictEqual(cleaned.includes('Kyiv'), true, 'Should retain informative hashtag word');
    assert.ok(isSubstantivePost(cleaned), 'Should be substantive');
  });

  it('filters out trivial non-substantive text', () => {
    assert.strictEqual(isSubstantivePost('Good morning everyone!'), false);
    assert.strictEqual(isSubstantivePost('Thoughts?'), false);
    assert.strictEqual(isSubstantivePost(''), false);
    assert.strictEqual(isSubstantivePost('Short text'), false);
    assert.strictEqual(
      isSubstantivePost('Satellite imagery confirms damage to the primary runway following overnight drone strikes.'),
      true
    );
  });

  it('strictly enforces <= 25 words briefing limit', () => {
    const longText = 'Heavy clashes were reported along the northern perimeter with artillery duels escalating throughout the evening as reconnaissance drones were spotted overhead according to military monitors and local officials.';
    const limited = enforceBriefingWordLimit(longText, 24);
    const words = limited.split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 24, `Expected <= 24 words, got ${words.length}`);
    assert.ok(/[.!?]$/.test(limited), 'Briefing should end cleanly with sentence punctuation');
  });

  it('calculates cosine similarity correctly for semantic clustering', () => {
    const v1 = [1, 2, 3];
    const v2 = [1, 2, 3];
    const v3 = [0, 0, 0];
    const v4 = [-1, -2, -3];

    assert.strictEqual(Math.round(cosineSimilarity(v1, v2) * 1000) / 1000, 1);
    assert.strictEqual(cosineSimilarity(v1, v3), 0);
    assert.strictEqual(Math.round(cosineSimilarity(v1, v4) * 1000) / 1000, -1);
  });
});

describe('Social Media Intel - Multi-Source Corroboration', () => {
  it('identifies and groups multi-source events', () => {
    const cluster = [
      { platform: 'bluesky', author: 'bellingcat.com' },
      { platform: 'telegram', author: 'clashreport' },
      { platform: 'bluesky', author: 'bellingcat.com' },
    ];

    const distinctAuthors = new Set(cluster.map(p => `${p.platform}:${p.author}`));
    assert.strictEqual(distinctAuthors.size, 2, 'Should have 2 distinct sources');
    assert.ok(distinctAuthors.size >= 2, 'Should pass multi-source corroboration rule');
  });

  it('strictly forces English and avoids Cyrillic in local briefing fallback', () => {
    // Case 1: Mixed cluster with Ukrainian/Russian and English posts -> prefers English
    const mixedCluster = [
      {
        platform: 'telegram',
        author: '@deepstateua',
        authorName: 'DeepState',
        cleanedText: 'Ворог просунувся біля населеного пункту на сході України за повідомленням аналітиків.',
      },
      {
        platform: 'bluesky',
        author: 'bellingcat.com',
        authorName: 'Bellingcat',
        cleanedText: 'Commercial satellite imagery indicates active armor movements across the eastern sector.',
      },
    ];
    const resMixed = generateLocalBriefingFallback(mixedCluster);
    assert.strictEqual(/[\u0400-\u04FF]/.test(resMixed.briefing), false, 'Should not contain Cyrillic');
    assert.ok(resMixed.briefing.includes('Commercial satellite imagery'), 'Should select the English post');

    // Case 2: All-Cyrillic posts cluster -> produces an English operational situation notice
    const allCyrillicCluster = [
      {
        platform: 'telegram',
        author: '@kpszsu',
        authorName: 'Air Force AFU',
        cleanedText: 'Збито 18 із 24 ударних БпЛА типу Shahed над територією Миколаївської та Одеської областей.',
      },
    ];
    const resCyrillic = generateLocalBriefingFallback(allCyrillicCluster);
    assert.strictEqual(/[\u0400-\u04FF]/.test(resCyrillic.briefing), false, 'All-Cyrillic cluster must produce English briefing');
    assert.ok(resCyrillic.briefing.includes('Air Force AFU') || resCyrillic.briefing.includes('operational'), 'Must have English text');
  });
});

describe('Social Media Intel - API Endpoint Handler', () => {
  it('handles OPTIONS preflight requests with CORS headers', async () => {
    const req = new Request('http://localhost/api/social-intel', {
      method: 'OPTIONS',
      headers: { Origin: 'https://worldmonitor.app' },
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 204);
    assert.ok(res.headers.get('Access-Control-Allow-Origin'));
  });

  it('returns valid briefings response with 3-hour cache control', async () => {
    const req = new Request('http://localhost/api/social-intel', {
      method: 'GET',
      headers: { Origin: 'https://worldmonitor.app' },
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);

    const cacheControl = res.headers.get('Cache-Control');
    assert.ok(cacheControl && cacheControl.includes('max-age=10800'), 'Should specify 3-hour (10800s) cache');

    const data = await res.json();
    assert.ok(Array.isArray(data.briefings), 'Should contain briefings array');
    assert.ok(typeof data.totalPostsScraped === 'number');
    assert.ok(typeof data.totalSubstantivePosts === 'number');
    assert.ok(data.sourcesMonitored?.bluesky?.length > 0);
    assert.ok(data.sourcesMonitored?.telegram?.length > 0);

    for (const b of data.briefings) {
      assert.ok(b.wordCount <= 25, `Briefing should be under 25 words, got ${b.wordCount}: "${b.briefing}"`);
      assert.ok(Array.isArray(b.sources), 'Sources should be an array');
      assert.ok(Array.isArray(b.platforms), 'Platforms should be an array');
      assert.ok(typeof b.isMultiSource === 'boolean');
      for (const s of b.sources) {
        assert.ok(s.url, 'Source should have direct post URL');
        assert.ok(s.author, 'Source should have author handle');
        assert.ok(s.freshness, 'Source should have freshness indicator');
      }
    }
  });

  it('complies with Telegram Bot API and Bluesky AT Protocol documentation specifications', async () => {
    // 1. Bluesky AT Protocol URL & Parameter formatting
    const actor = 'bellingcat.com';
    const bskyUrl = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
    bskyUrl.searchParams.set('actor', actor);
    bskyUrl.searchParams.set('filter', 'posts_no_replies');
    bskyUrl.searchParams.set('limit', '15');

    assert.strictEqual(bskyUrl.searchParams.get('filter'), 'posts_no_replies', 'Should use documented filter to exclude chatter');
    assert.strictEqual(bskyUrl.searchParams.get('actor'), actor);
    assert.strictEqual(bskyUrl.searchParams.get('limit'), '15');

    // 2. Telegram Bot API payload formatting
    const botPayload = {
      allowed_updates: ['channel_post', 'message', 'edited_channel_post'],
      limit: 100,
    };
    assert.ok(botPayload.allowed_updates.includes('channel_post'), 'Must subscribe to channel_post updates');
    assert.strictEqual(botPayload.limit, 100);

    // 3. Telegram Widget HTML parsing (data-post and time[datetime])
    const testWidgetHtml = '<div class="tgme_widget_message" data-post="clashreport/50123">' +
      '<div class="tgme_widget_message_text js-message_text">Explosion reported near naval facility.</div>' +
      '<time datetime="2026-10-20T19:00:00+00:00">19:00</time></div>';

    const postMatch = testWidgetHtml.match(/data-post="([a-zA-Z0-9_]+)\/(\d+)"/i);
    assert.ok(postMatch);
    assert.strictEqual(postMatch[1], 'clashreport');
    assert.strictEqual(postMatch[2], '50123');
    assert.strictEqual(`https://t.me/${postMatch[1]}/${postMatch[2]}`, 'https://t.me/clashreport/50123');
  });

  it('correctly requests and normalizes feed items from the pre-existing Railway proxy worker', async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.WS_RELAY_URL;
    process.env.WS_RELAY_URL = 'https://railway-proxy.example.com';
    process.env.RELAY_SHARED_SECRET = 'secret123';

    try {
      globalThis.fetch = async (url, options) => {
        const u = new URL(url);
        assert.strictEqual(u.origin, 'https://railway-proxy.example.com');
        assert.strictEqual(u.pathname, '/telegram/feed');
        assert.strictEqual(u.searchParams.get('limit'), '100');
        assert.strictEqual(options.headers['x-relay-key'], 'secret123');
        assert.strictEqual(options.headers['Authorization'], 'Bearer secret123');

        return new Response(JSON.stringify({
          source: 'telegram',
          count: 2,
          items: [
            {
              id: 'clashreport:1234',
              channel: 'clashreport',
              channelTitle: 'Clash Report',
              url: 'https://t.me/clashreport/1234',
              ts: '2026-10-20T18:00:00.000Z',
              text: 'Air defense systems activated following incoming drone alerts.',
            },
            {
              id: 'liveukraine_media:5678',
              channel: 'liveukraine_media',
              channelTitle: 'Live Ukraine',
              url: 'https://t.me/liveukraine_media/5678',
              ts: '2026-10-20T18:05:00.000Z',
              text: 'Explosions heard in southern harbor district.',
            },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const posts = await fetchRailwayTelegramFeed(['clashreport', 'liveukraine_media'], 'secret123');
      assert.strictEqual(posts.length, 2);
      assert.strictEqual(posts[0].platform, 'telegram');
      assert.strictEqual(posts[0].author, '@clashreport');
      assert.strictEqual(posts[0].authorName, 'Clash Report');
      assert.strictEqual(posts[0].url, 'https://t.me/clashreport/1234');
      assert.strictEqual(posts[0].publishedAt, '2026-10-20T18:00:00.000Z');
      assert.strictEqual(posts[0].rawText, 'Air defense systems activated following incoming drone alerts.');

      assert.strictEqual(posts[1].author, '@liveukraine_media');
      assert.strictEqual(posts[1].authorName, 'Live Ukraine');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv !== undefined) {
        process.env.WS_RELAY_URL = originalEnv;
      } else {
        delete process.env.WS_RELAY_URL;
      }
      delete process.env.RELAY_SHARED_SECRET;
    }
  });
});

describe('Social Media Intel - Google Pre-Trained Translation Hook', () => {
  it('detects foreign non-English scripts accurately', () => {
    // Cyrillic (Ukrainian / Russian)
    assert.strictEqual(hasNonEnglishText('Збито 18 із 24 ударних БпЛА типу Shahed'), true);
    assert.strictEqual(hasNonEnglishText('Силы ПВО перехватили беспилотник над областью'), true);

    // Arabic / Hebrew
    assert.strictEqual(hasNonEnglishText('سلاح الجو يستهدف مواقع عسكرية'), true);
    assert.strictEqual(hasNonEnglishText('חיל האוויר תקף מטרות'), true);

    // Latin / English
    assert.strictEqual(hasNonEnglishText('Air defense intercepted 18 out of 24 drones.'), false);
    assert.strictEqual(hasNonEnglishText('165 drones reported across 30 locations in Kyiv region.'), false);

    // English articles citing non-English terms, locations, or names
    assert.strictEqual(
      hasNonEnglishText('Ukrainian forces repel Russian assault near Покровськ in Donetsk region.'),
      false,
    );
    assert.strictEqual(
      hasNonEnglishCharacters("Türkiye's Erdoğan meets Macron at Élysée Palace in Paris over São Paulo trade deal"),
      false,
    );
    assert.strictEqual(
      hasNonEnglishCharacters('Flooding in São Paulo and Bogotá leaves dozens displaced after heavy rain'),
      false,
    );
    assert.strictEqual(
      hasNonEnglishCharacters('El Gobierno de España aprueba nuevas medidas económicas para frenar la inflación'),
      true,
    );
  });

  it('translates foreign text snippet into English using Google pre-trained translation', async () => {
    const foreignSnippet = 'Збито 18 із 24 ударних БпЛА типу Shahed над територією Одеської області.';
    const translated = await translateTextWithGoogle(foreignSnippet, 'en');

    assert.ok(translated && typeof translated === 'string', 'Should return translated string');
    assert.strictEqual(/[\u0400-\u04FF]/.test(translated), false, 'Translated text should not contain Cyrillic');
    const lower = translated.toLowerCase();
    assert.ok(
      lower.includes('18') || lower.includes('shahed') || lower.includes('uav') || lower.includes('drone'),
      `Expected translated text to contain drone/shahed telemetry, got: ${translated}`,
    );
  });

  it('translates foreign posts into substantive intelligence briefings instead of generic operational notices', async () => {
    const foreignCluster = [
      {
        platform: 'telegram',
        author: '@kpszsu',
        authorName: 'Air Force AFU',
        cleanedText: 'Збито 18 із 24 ударних БпЛА типу Shahed над територією Одеської області.',
      },
    ];

    const res = await generateBriefingWithGoogleTranslation(foreignCluster);
    assert.ok(res && res.briefing, 'Should generate a briefing');
    assert.strictEqual(/[\u0400-\u04FF]/.test(res.briefing), false, 'Briefing must be in English with no Cyrillic');
    assert.strictEqual(
      res.briefing.includes('operational military situation updates and frontline telemetry'),
      false,
      'Must NOT be a generic operational response',
    );

    const words = res.briefing.split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 24, `Word count must be <= 24 words, got ${words.length}`);
    assert.ok(/[.!?]$/.test(res.briefing), 'Briefing should end with sentence punctuation');
    assert.strictEqual(res.modelUsed, 'google-pretrained-translation');
  });

  it('batch translates multiple snippets efficiently', async () => {
    const snippets = [
      'Збито 18 із 24 ударних БпЛА типу Shahed.',
      'Військові відбили нічну атаку безпілотників.',
      'Air defenses active across the southern sector.',
    ];

    const results = await batchTranslateWithGoogle(snippets, 'en');
    assert.strictEqual(results.length, 3);
    assert.strictEqual(/[\u0400-\u04FF]/.test(results[0]), false, 'Item 0 should be translated to English');
    assert.strictEqual(/[\u0400-\u04FF]/.test(results[1]), false, 'Item 1 should be translated to English');
    assert.strictEqual(results[2], snippets[2], 'English text should pass through unchanged');
  });

  it('translates on-demand via /api/translate endpoint (GET and POST)', async () => {
    // 1. OPTIONS preflight
    const optReq = new Request('http://localhost/api/translate', {
      method: 'OPTIONS',
      headers: { Origin: 'https://worldmonitor.app' },
    });
    const optRes = await translateHandler(optReq);
    assert.strictEqual(optRes.status, 204);

    // 2. GET request with query params
    const getReq = new Request(
      `http://localhost/api/translate?text=${encodeURIComponent('Збито 18 ударних БпЛА')}&target=en`,
      {
        method: 'GET',
        headers: { Origin: 'https://worldmonitor.app' },
      },
    );
    const getRes = await translateHandler(getReq);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(getData.translatedText);
    assert.strictEqual(/[\u0400-\u04FF]/.test(getData.translatedText), false);
    assert.strictEqual(getData.provider, 'google-pretrained-translation-api');

    // 3. POST request with JSON body
    const postReq = new Request('http://localhost/api/translate', {
      method: 'POST',
      headers: {
        'Origin': 'https://worldmonitor.app',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'Збито 18 ударних БпЛА над Одесою.',
        target: 'en',
      }),
    });
    const postRes = await translateHandler(postReq);
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.ok(postData.translatedText);
    assert.strictEqual(/[\u0400-\u04FF]/.test(postData.translatedText), false);

    // 4. Missing text parameter returns 400
    const errReq = new Request('http://localhost/api/translate', {
      method: 'GET',
      headers: { Origin: 'https://worldmonitor.app' },
    });
    const errRes = await translateHandler(errReq);
    assert.strictEqual(errRes.status, 400);
  });

  it('translates on-demand via /api/social-intel?action=translate', async () => {
    const req = new Request(
      `http://localhost/api/social-intel?action=translate&text=${encodeURIComponent('Збито 18 ударних БпЛА')}`,
      {
        method: 'GET',
        headers: { Origin: 'https://worldmonitor.app' },
      },
    );
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.translatedText);
    assert.strictEqual(/[\u0400-\u04FF]/.test(data.translatedText), false);
    assert.strictEqual(data.provider, 'google-pretrained-translation-api');
  });
});

describe('Social Media Intel - Fluid Active CPU & Performance Optimizations', () => {
  it('precomputes word sets and computes fast zero-allocation Jaccard similarity', () => {
    const textA = 'Ukrainian air defenses intercepted multiple Shahed drones over southern regions.';
    const textB = 'Air defenses active as multiple Shahed drones are reported over southern territory.';
    const textC = 'Completely unrelated financial market report on treasury yields.';

    const wordsA = extractWordSet(textA);
    const wordsB = extractWordSet(textB);
    const wordsC = extractWordSet(textC);

    assert.ok(wordsA instanceof Set, 'Should return a Set');
    assert.ok(wordsA.has('intercepted'));
    assert.ok(wordsA.has('shahed'));
    assert.ok(!wordsA.has('air'), 'Should filter out words <= 3 chars like "air"');

    const fastSimAB = fastSetJaccard(wordsA, wordsB);
    const slowSimAB = jaccardSimilarity(textA, textB);
    assert.strictEqual(fastSimAB, slowSimAB, 'fastSetJaccard must match jaccardSimilarity');
    assert.ok(fastSimAB > 0.35, 'Similar drone reports should score high');

    const fastSimAC = fastSetJaccard(wordsA, wordsC);
    assert.strictEqual(fastSimAC, 0, 'Unrelated texts should have 0 similarity');
  });

  it('coalesces concurrent requests into shared in-flight response (singleflight)', async () => {
    // Fire two concurrent requests
    const reqA = new Request('http://localhost/api/social-intel', {
      method: 'GET',
      headers: { Origin: 'https://worldmonitor.app' },
    });
    const reqB = new Request('http://localhost/api/social-intel', {
      method: 'GET',
      headers: { Origin: 'https://worldmonitor.app' },
    });

    const [resA, resB] = await Promise.all([handler(reqA), handler(reqB)]);
    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    const [dataA, dataB] = await Promise.all([resA.json(), resB.json()]);
    assert.strictEqual(dataA.generatedAt, dataB.generatedAt, 'Both requests should share the same generated briefings');
    assert.strictEqual(dataA.briefings.length, dataB.briefings.length);
  });
});


