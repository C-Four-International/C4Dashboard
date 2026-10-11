import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Canadian Briefing feeds configuration integrity', () => {
  const feedsTs = fs.readFileSync('src/config/feeds.ts', 'utf8');
  assert.ok(feedsTs.includes("'CBC News': 2"), 'SOURCE_TIERS should include CBC News');
  assert.ok(feedsTs.includes("'Canada Gazette': 1"), 'SOURCE_TIERS should include Canada Gazette');
  assert.ok(feedsTs.includes("'Canadian Gazette': 1"), 'SOURCE_TIERS should include Canadian Gazette');
  assert.ok(feedsTs.includes("'CBC News': 'mainstream'"), 'SOURCE_TYPES should categorize CBC News as mainstream');
  assert.ok(feedsTs.includes("'Canada Gazette': 'gov'"), 'SOURCE_TYPES should categorize Canada Gazette as gov');
  assert.ok(feedsTs.includes('CANADIAN_TOP_NEWS_FEEDS'), 'feeds.ts should export CANADIAN_TOP_NEWS_FEEDS');
  assert.ok(feedsTs.includes('rss-topstories'), 'CANADIAN_TOP_NEWS_FEEDS should include CBC top stories RSS');
  assert.ok(feedsTs.includes('p1-eng.xml'), 'CANADIAN_TOP_NEWS_FEEDS should include Canada Gazette Part 1 RSS');
});

test('RSS Proxy allowlists include CBC and Gazette domains', () => {
  const rssProxyJs = fs.readFileSync('api/rss-proxy.js', 'utf8');
  assert.ok(rssProxyJs.includes("'www.cbc.ca'"), 'api/rss-proxy.js should allow www.cbc.ca');
  assert.ok(rssProxyJs.includes("'www.gazette.gc.ca'"), 'api/rss-proxy.js should allow www.gazette.gc.ca');

  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  assert.ok(viteConfig.includes("'www.cbc.ca'"), 'vite.config.ts should allow www.cbc.ca');
  assert.ok(viteConfig.includes("'www.gazette.gc.ca'"), 'vite.config.ts should allow www.gazette.gc.ca');
});

test('Country Intel and Brief Page Canada definitions', () => {
  const countryIntelTs = fs.readFileSync('src/app/country-intel.ts', 'utf8');
  assert.ok(countryIntelTs.includes("CA: { n: 83.1, s: 41.7, e: -52.6, w: -141.0 }"), 'COUNTRY_BOUNDS should define CA');
  assert.ok(countryIntelTs.includes("CA: ['canada', 'canadian', 'ottawa', 'cbc', 'canada gazette'"), 'COUNTRY_ALIASES should include CA with CBC and Gazette');
  assert.ok(countryIntelTs.includes('aggregateCanadianTopNews'), 'country-intel.ts should implement aggregateCanadianTopNews');

  const briefPageTs = fs.readFileSync('src/components/CountryBriefPage.ts', 'utf8');
  assert.ok(briefPageTs.includes("CA: { n: 83.1, s: 41.7, e: -52.6, w: -141.0 }"), 'BRIEF_BOUNDS should define CA');
  assert.ok(briefPageTs.includes('showNewsLoading'), 'CountryBriefPage should have showNewsLoading');

  const countriesTs = fs.readFileSync('src/config/countries.ts', 'utf8');
  assert.ok(countriesTs.includes("CA: 'Canada'"), 'TIER1_COUNTRIES should include CA');
  assert.ok(countriesTs.includes("name: 'Canada'"), 'CURATED_COUNTRIES should include Canada');
});
