import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('AI country briefing generation error message does not prompt for GEMINI_API_KEY', () => {
  const countryIntelTs = fs.readFileSync('src/app/country-intel.ts', 'utf8');
  assert.ok(
    !countryIntelTs.includes('Configure GEMINI_API_KEY in Settings'),
    'src/app/country-intel.ts should not contain user-facing GEMINI_API_KEY error message'
  );
  assert.ok(
    countryIntelTs.includes("error: t('modals.countryBrief.briefUnavailable') || 'AI brief unavailable — fallback in place.'"),
    'src/app/country-intel.ts should use fallback notice when brief is unavailable'
  );
});

test('English locale has calm fallback notice without GEMINI_API_KEY prompt', () => {
  const enJson = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'));

  assert.equal(
    enJson.countryBrief?.briefUnavailable,
    'AI brief unavailable — fallback in place.',
    'countryBrief.briefUnavailable should state fallback in place'
  );
  assert.equal(
    enJson.modals?.countryBrief?.briefUnavailable,
    'AI brief unavailable — fallback in place.',
    'modals.countryBrief.briefUnavailable should state fallback in place'
  );
  assert.equal(
    enJson.modals?.countryIntel?.unavailable,
    'AI brief unavailable — fallback in place.',
    'modals.countryIntel.unavailable should state fallback in place'
  );
  assert.equal(
    enJson.modals?.countryBrief?.fallbackBadge,
    'Fallback in place',
    'modals.countryBrief.fallbackBadge should define Fallback in place'
  );
});

test('All locale files have replaced GEMINI_API_KEY in country intel and brief strings', () => {
  const localesDir = 'src/locales';
  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(localesDir, file), 'utf8');
    assert.ok(
      !raw.includes('GEMINI_API_KEY'),
      `${file} should not reference GEMINI_API_KEY in country briefing error messages`
    );

    const parsed = JSON.parse(raw);
    const countryBriefMsg = parsed.countryBrief?.briefUnavailable || parsed.modals?.countryBrief?.briefUnavailable;
    assert.ok(
      countryBriefMsg && typeof countryBriefMsg === 'string',
      `${file} should define briefUnavailable`
    );
  }
});

test('CountryBriefPage and CountryIntelModal display fallback badge when data.fallback is true', () => {
  const briefPageTs = fs.readFileSync('src/components/CountryBriefPage.ts', 'utf8');
  assert.ok(
    briefPageTs.includes('data.fallback'),
    'CountryBriefPage.updateBrief should inspect data.fallback'
  );
  assert.ok(
    briefPageTs.includes('intel-fallback'),
    'CountryBriefPage should render intel-fallback class for fallback badges'
  );

  const intelModalTs = fs.readFileSync('src/components/CountryIntelModal.ts', 'utf8');
  assert.ok(
    intelModalTs.includes('data.fallback'),
    'CountryIntelModal.updateBrief should inspect data.fallback'
  );
  assert.ok(
    intelModalTs.includes('intel-fallback'),
    'CountryIntelModal should render intel-fallback class for fallback badges'
  );
});

test('CSS includes styling for .intel-fallback and .intel-fallback-notice', () => {
  const mainCss = fs.readFileSync('src/styles/main.css', 'utf8');
  assert.ok(mainCss.includes('.intel-fallback {'), 'main.css should contain .intel-fallback');
  assert.ok(mainCss.includes('.intel-error.intel-fallback-notice {'), 'main.css should contain .intel-error.intel-fallback-notice');
});
