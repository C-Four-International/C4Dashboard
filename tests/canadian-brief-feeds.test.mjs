import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Canadian Briefing feeds configuration integrity', () => {
  const feedsTs = fs.readFileSync('src/config/feeds.ts', 'utf8');
  assert.ok(feedsTs.includes("'CBC News': 2"), 'SOURCE_TIERS should include CBC News');
  assert.ok(feedsTs.includes("'Canada Gazette': 1"), 'SOURCE_TIERS should include Canada Gazette');
  assert.ok(feedsTs.includes("'Canadian Gazette': 1"), 'SOURCE_TIERS should include Canadian Gazette');
  assert.ok(feedsTs.includes("'Canada Gazette Part 1': 1"), 'SOURCE_TIERS should include Canada Gazette Part 1');
  assert.ok(feedsTs.includes("'Canada Gazette Part 2': 1"), 'SOURCE_TIERS should include Canada Gazette Part 2');
  assert.ok(feedsTs.includes("'Canada Gazette Part 3': 1"), 'SOURCE_TIERS should include Canada Gazette Part 3');
  assert.ok(feedsTs.includes("'CBC News': 'mainstream'"), 'SOURCE_TYPES should categorize CBC News as mainstream');
  assert.ok(feedsTs.includes("'Canada Gazette': 'gov'"), 'SOURCE_TYPES should categorize Canada Gazette as gov');
  assert.ok(feedsTs.includes('CANADIAN_TOP_NEWS_FEEDS'), 'feeds.ts should export CANADIAN_TOP_NEWS_FEEDS');
  assert.ok(feedsTs.includes('rss-canada'), 'CANADIAN_TOP_NEWS_FEEDS should include CBC Canada RSS');
  assert.ok(feedsTs.includes('rss-politics'), 'CANADIAN_TOP_NEWS_FEEDS should include CBC Politics RSS');
  assert.ok(feedsTs.includes('p1-eng.xml'), 'CANADIAN_TOP_NEWS_FEEDS should include Canada Gazette Part 1 RSS');
  assert.ok(feedsTs.includes('p2-eng.xml'), 'CANADIAN_TOP_NEWS_FEEDS should include Canada Gazette Part 2 RSS');
  assert.ok(feedsTs.includes('en-ls-eng.xml'), 'CANADIAN_TOP_NEWS_FEEDS should include Canada Gazette Part 3 RSS');
});

test('RSS Proxy allowlists include CBC and Gazette domains', () => {
  const rssProxyJs = fs.readFileSync('api/rss-proxy.js', 'utf8');
  assert.ok(rssProxyJs.includes("'www.cbc.ca'"), 'api/rss-proxy.js should allow www.cbc.ca');
  assert.ok(rssProxyJs.includes("'www.gazette.gc.ca'"), 'api/rss-proxy.js should allow www.gazette.gc.ca');
  assert.ok(rssProxyJs.includes("'gazette.gc.ca'"), 'api/rss-proxy.js should allow gazette.gc.ca');

  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  assert.ok(viteConfig.includes("'www.cbc.ca'"), 'vite.config.ts should allow www.cbc.ca');
  assert.ok(viteConfig.includes("'www.gazette.gc.ca'"), 'vite.config.ts should allow www.gazette.gc.ca');
  assert.ok(viteConfig.includes("'gazette.gc.ca'"), 'vite.config.ts should allow gazette.gc.ca');
});

test('Country Intel and Brief Page Canada definitions', () => {
  const countryIntelTs = fs.readFileSync('src/app/country-intel.ts', 'utf8');
  assert.ok(countryIntelTs.includes("CA: { n: 83.1, s: 41.7, e: -52.6, w: -141.0 }"), 'COUNTRY_BOUNDS should define CA');
  assert.ok(countryIntelTs.includes("CA: ['canada', 'canadian', 'ottawa', 'cbc', 'canada gazette'"), 'COUNTRY_ALIASES should include CA with CBC and Gazette');
  assert.ok(countryIntelTs.includes('aggregateCanadianTopNews'), 'country-intel.ts should implement aggregateCanadianTopNews');
  assert.ok(countryIntelTs.includes('isCanadianNewsItem'), 'country-intel.ts should implement isCanadianNewsItem');
  assert.ok(countryIntelTs.includes('CANADIAN_PATTERNS'), 'country-intel.ts should define CANADIAN_PATTERNS');

  const briefPageTs = fs.readFileSync('src/components/CountryBriefPage.ts', 'utf8');
  assert.ok(briefPageTs.includes("CA: { n: 83.1, s: 41.7, e: -52.6, w: -141.0 }"), 'BRIEF_BOUNDS should define CA');
  assert.ok(briefPageTs.includes('showNewsLoading'), 'CountryBriefPage should have showNewsLoading');

  const countriesTs = fs.readFileSync('src/config/countries.ts', 'utf8');
  assert.ok(countriesTs.includes("CA: 'Canada'"), 'TIER1_COUNTRIES should include CA');
  assert.ok(countriesTs.includes("name: 'Canada'"), 'CURATED_COUNTRIES should include Canada');
});

test('Canadian news filtering and direct hyperlink sanitation logic', () => {
  // Test direct article URL validation
  function isDirectArticleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    if (trimmed.includes('news.google.com') || trimmed.includes('google.com/url')) return false;
    return true;
  }

  function cleanArticleUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    try {
      const u = new URL(trimmed);
      const trackingParams = [
        'cmp', 'ref', 'oc', 'utm_source', 'utm_medium', 'utm_campaign',
        'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid'
      ];
      trackingParams.forEach((p) => {
        u.searchParams.delete(p);
      });
      return u.toString();
    } catch {
      return trimmed.replace(/[?&]cmp=rss(&|$)/, '').replace(/\?$/, '');
    }
  }

  // Verify direct link validation
  assert.equal(isDirectArticleUrl('https://www.cbc.ca/news/canada/toronto/sample-story-1.7001'), true);
  assert.equal(isDirectArticleUrl('https://gazette.gc.ca/rp-pr/p1/2026/2026-10-10/html/index-eng.html'), true);
  assert.equal(isDirectArticleUrl('https://news.google.com/rss/articles/CBMi4wFA...'), false);
  assert.equal(isDirectArticleUrl('https://www.google.com/url?q=https://example.com'), false);
  assert.equal(isDirectArticleUrl('javascript:alert(1)'), false);

  // Verify cleanArticleUrl strips tracking/RSS params
  assert.equal(
    cleanArticleUrl('https://www.cbc.ca/news/canada/montreal/story-1.1234?cmp=rss'),
    'https://www.cbc.ca/news/canada/montreal/story-1.1234'
  );
  assert.equal(
    cleanArticleUrl('https://www.cbc.ca/news/politics/story-1.5678?utm_source=feed&cmp=rss'),
    'https://www.cbc.ca/news/politics/story-1.5678'
  );
  assert.equal(
    cleanArticleUrl('https://gazette.gc.ca/rp-pr/p1/2026/2026-10-10/html/index-eng.html'),
    'https://gazette.gc.ca/rp-pr/p1/2026/2026-10-10/html/index-eng.html'
  );

  // Verify Canadian pattern matching logic
  const CANADIAN_PATTERNS = [
    /\bcanad(a|ian|ians|ien|ienne|iens|iennes)\b/i,
    /\b(ottawa|parliament hill|house of commons|senate of canada)\b/i,
    /\b(prime minister|pm trudeau|justin trudeau|trudeau|poilievre|pierre poilievre|mark carney|carney|jagmeet singh|jagmeet|blanchet|freeland|anand|joly)\b/i,
    /\b(bank of canada|\bboc\b|rcmp|grc|cra|csis|crtc|statcan|statistics canada|canada post|health canada|transport canada|global affairs)\b/i,
    /\b(canadian armed forces|\bcaf\b|royal canadian navy|canadian coast guard)\b/i,
    /\b(first nations|inuit|m[eé]tis)\b/i,
    /\b(ontario|quebec|qu[eé]bec|british columbia|\bb\.?c\.?\b|alberta|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|labrador|prince edward island|\bp\.?e\.?i\.?\b|yukon|northwest territories|\bnwt\b|nunavut)\b/i,
    /\b(toronto|montreal|montr[eé]al|vancouver|calgary|edmonton|winnipeg|quebec city|halifax|victoria|regina|saskatoon|st\.?\s*john'?s|fredericton|charlottetown|whitehorse|yellowknife|iqaluit|mississauga|brampton|surrey|laval|gatineau|hamilton|banff|gta|maritimes)\b/i,
    /\b(canada gazette|canadian gazette|order[- ]in[- ]council|bill c-\d+|bill s-\d+|loonie|toonie|\btsx\b)\b/i,
  ];

  function isCanadianNewsItem(item) {
    const title = (item.title || '').toLowerCase();
    const url = (item.link || '').toLowerCase();
    const source = (item.source || '').toLowerCase();
    if (source.includes('gazette') || url.includes('gazette.gc.ca')) return true;
    if ((url.includes('/news/world/') || url.includes('/news/us/')) && !/\bcanad(a|ian|ians)\b/i.test(title)) return false;
    return CANADIAN_PATTERNS.some((p) => p.test(title) || p.test(url));
  }

  // Canada Gazette source inherently passes
  assert.equal(isCanadianNewsItem({
    title: 'Canada Gazette - Part I, volume 160, number 41',
    link: 'https://gazette.gc.ca/rp-pr/p1/2026/2026-10-10/html/index-eng.html',
    source: 'Canada Gazette Part 1'
  }), true);

  // Canadian politics and domestic news passes
  assert.equal(isCanadianNewsItem({
    title: 'Bank of Canada lowers benchmark rate by 25 basis points',
    link: 'https://www.cbc.ca/news/business/bank-of-canada-interest-rate-cut-1.7890',
    source: 'CBC News'
  }), true);

  assert.equal(isCanadianNewsItem({
    title: 'Poilievre presses Trudeau on housing supply in Question Period',
    link: 'https://www.cbc.ca/news/politics/question-period-housing-1.7891',
    source: 'CBC Politics'
  }), true);

  // Unrelated world/US news from CBC feed is rejected
  assert.equal(isCanadianNewsItem({
    title: 'Migrant boat capsizes off coast of Djibouti leaving dozens dead',
    link: 'https://www.cbc.ca/news/world/djibouti-migrant-shipwreck-1.7892',
    source: 'CBC News'
  }), false);

  assert.equal(isCanadianNewsItem({
    title: 'Trump rallies supporters in Ohio ahead of primary election',
    link: 'https://www.cbc.ca/news/world/trump-ohio-rally-1.7893',
    source: 'CBC News'
  }), false);

  // Foreign news that specifically involves Canada passes
  assert.equal(isCanadianNewsItem({
    title: 'Trudeau visits Kyiv to announce new Canadian aid package',
    link: 'https://www.cbc.ca/news/world/trudeau-kyiv-visit-1.7894',
    source: 'CBC News'
  }), true);
});
