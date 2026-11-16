import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Human Conflict time slider integration & filtering', async (t) => {
  const deckGlPath = path.resolve('src/components/DeckGLMap.ts');
  const deckGlCode = fs.readFileSync(deckGlPath, 'utf8');

  await t.test('DeckGLMap filters humanConflict layer using filterByTime', () => {
    assert.match(deckGlCode, /const filteredHumanConflict\s*=\s*this\.filterByTime\(this\.humanConflictEvents,\s*\(event\)\s*=>\s*event\.date\);/);
    assert.match(deckGlCode, /const humanConflictToRender\s*=\s*filteredHumanConflict;/);
    assert.match(deckGlCode, /layers\.push\(this\.createHumanConflictLayer\(humanConflictToRender\)\);/);
    // Ensure the old broken fallback is gone
    assert.doesNotMatch(deckGlCode, /humanConflictToRender\s*=\s*filteredHumanConflict\.length\s*>\s*0\s*\?\s*filteredHumanConflict\s*:\s*activeConflicts/);
  });

  await t.test('DeckGLMap.parseTime handles ISO timestamps, epoch ms, and date-only strings', () => {
    assert.match(deckGlCode, /parseTime\(value:\s*Date\s*\|\s*string\s*\|\s*number/);
    assert.match(deckGlCode, /T23:59:59\.999Z/);
  });

  await t.test('DeckGLMap.setTimeRange clears timeFilterCache and triggers debounced render', () => {
    assert.match(deckGlCode, /setTimeRange\(range:\s*TimeRange\):\s*void\s*\{[\s\S]*?this\.timeFilterCache\.clear\(\);[\s\S]*?this\.render\(\);/);
  });

  await t.test('DeckGLMap.createHumanConflictLayer includes timeRange in updateTriggers', () => {
    assert.match(deckGlCode, /updateTriggers:\s*\{[\s\S]*?getPosition:\s*\[this\.state\.timeRange,\s*events\.length\]/);
  });
});

test('SVG Map fallback humanConflict time slider integration', async (t) => {
  const mapPath = path.resolve('src/components/Map.ts');
  const mapCode = fs.readFileSync(mapPath, 'utf8');

  await t.test('Map defines humanConflictEvents store and setHumanConflictEvents', () => {
    assert.match(mapCode, /private humanConflictEvents:\s*import\('@\/types'\)\.HumanConflictEvent\[\]\s*=\s*\[\];/);
    assert.match(mapCode, /setHumanConflictEvents\(events:\s*import\('@\/types'\)\.HumanConflictEvent\[\]\):\s*void\s*\{[\s\S]*?this\.humanConflictEvents\s*=\s*events;[\s\S]*?this\.render\(\);/);
  });

  await t.test('Map renders filtered humanConflict markers using timeRange cutoff', () => {
    assert.match(mapCode, /this\.state\.layers\.humanConflict\s*&&\s*this\.humanConflictEvents\.length\s*>\s*0/);
    assert.match(mapCode, /cutoff\s*===\s*0\s*\?\s*this\.humanConflictEvents\s*:\s*this\.humanConflictEvents\.filter/);
    assert.match(mapCode, /human-conflict-marker/);
  });
});

test('Curated human conflict events provide coverage across all time slider intervals', async (t) => {
  const { getCuratedConflictEvents } = await import('../api/human-conflict.js');
  const events = getCuratedConflictEvents();

  assert.ok(Array.isArray(events) && events.length > 0, 'Must return an array of curated events');

  const now = Date.now();
  const ranges = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '48h': 48 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };

  const within1h = events.filter(e => new Date(e.date).getTime() >= (now - ranges['1h']));
  const within6h = events.filter(e => new Date(e.date).getTime() >= (now - ranges['6h']));
  const within24h = events.filter(e => new Date(e.date).getTime() >= (now - ranges['24h']));
  const within48h = events.filter(e => new Date(e.date).getTime() >= (now - ranges['48h']));
  const within7d = events.filter(e => new Date(e.date).getTime() >= (now - ranges['7d']));

  assert.ok(within1h.length >= 1, 'At least 1 event should fall within the last 1 hour');
  assert.ok(within6h.length > within1h.length, '6-hour range should contain more events than 1-hour range');
  assert.ok(within24h.length > within6h.length, '24-hour range should contain more events than 6-hour range');
  assert.ok(within48h.length > within24h.length, '48-hour range should contain more events than 24-hour range');
  assert.ok(within7d.length > within48h.length, '7-day range should contain more events than 48-hour range');
  assert.ok(events.length >= within7d.length, 'All events should cover 7-day range and beyond');
});
