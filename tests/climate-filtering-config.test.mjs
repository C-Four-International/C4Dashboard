import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('server climate RPC defines 80 global zones with calibrated thresholds', async () => {
  const fileContent = fs.readFileSync(
    path.resolve('server/worldmonitor/climate/v1/list-climate-anomalies.ts'),
    'utf8',
  );

  // Check 80 zones
  const zoneMatches = fileContent.match(/\{\s*name:\s*['"][^'"]+['"],\s*lat:/g);
  assert.ok(zoneMatches, 'ZONES array should be present');
  assert.strictEqual(zoneMatches.length, 80, `Expected 80 monitored climate zones, found ${zoneMatches.length}`);

  // Check calibrated classification thresholds
  assert.match(
    fileContent,
    /absTemp\s*>=\s*4(?:\.0)?\s*\|\|\s*absPrecip\s*>=\s*50/,
    'Extreme severity must trigger at >= 4.0°C or >= 50mm departure',
  );
  assert.match(
    fileContent,
    /absTemp\s*>=\s*1\.5\s*\|\|\s*absPrecip\s*>=\s*15/,
    'Moderate severity must trigger at >= 1.5°C or >= 15mm departure',
  );

  // Check minSeverity casing normalization (camelCase and snake_case)
  assert.match(
    fileContent,
    /const minSev = \(req as any\)\?\.minSeverity \|\| req\?\.min_severity;/,
    'minSeverity must handle both camelCase and snake_case request fields',
  );
});

test('sidecar sebuf bundle contains 80 zones, calibrated thresholds, and minSev normalization', () => {
  const bundleContent = fs.readFileSync(
    path.resolve('api/[domain]/v1/[rpc].js'),
    'utf8',
  );

  assert.ok(bundleContent.includes('US Pacific NW'), 'Sidecar bundle should contain updated 80 zones');
  assert.match(
    bundleContent,
    /absTemp\s*>=\s*4\s*\|\|\s*absPrecip\s*>=\s*50/,
    'Sidecar bundle must include calibrated extreme threshold',
  );
  assert.match(
    bundleContent,
    /absTemp\s*>=\s*1\.5\s*\|\|\s*absPrecip\s*>=\s*15/,
    'Sidecar bundle must include calibrated moderate threshold',
  );
  assert.ok(bundleContent.includes('minSev'), 'Sidecar bundle must include minSev normalization');
});

test('data-loader loadClimate unconditionally sets climate anomalies on map', () => {
  const dataLoaderContent = fs.readFileSync(
    path.resolve('src/app/data-loader.ts'),
    'utf8',
  );

  const loadClimateBlock = dataLoaderContent.slice(
    dataLoaderContent.indexOf('async loadClimate(): Promise<void>'),
    dataLoaderContent.indexOf('async loadOutages(): Promise<void>'),
  );

  assert.ok(
    !loadClimateBlock.includes('if (this.ctx.mapLayers.climate)'),
    'loadClimate must not gate map.setClimateAnomalies behind mapLayers.climate check',
  );
  assert.ok(
    loadClimateBlock.includes('this.ctx.map?.setClimateAnomalies(anomalies);'),
    'loadClimate must call this.ctx.map?.setClimateAnomalies(anomalies)',
  );
});

test('locale files reflect 80 zones and calibrated thresholds', () => {
  const localesDir = path.resolve('src/locales');
  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 16, 'Expected at least 16 locale files');

  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    const tooltip = json.components?.climate?.infoTooltip;
    if (tooltip) {
      assert.ok(
        !tooltip.includes('>5°C') && !tooltip.includes('>5 °C') && !tooltip.includes('>5 derece'),
        `${file} should not retain stale >5°C threshold`,
      );
      assert.ok(
        !tooltip.includes('>80mm') && !tooltip.includes('>80 mm') && !tooltip.includes('>80 มม'),
        `${file} should not retain stale >80mm threshold`,
      );
      assert.ok(
        !tooltip.includes('>3°C') && !tooltip.includes('>3 °C') && !tooltip.includes('>3 derece'),
        `${file} should not retain stale >3°C threshold`,
      );
      assert.ok(
        !tooltip.includes('>40mm') && !tooltip.includes('>40 mm') && !tooltip.includes('>40 มม'),
        `${file} should not retain stale >40mm threshold`,
      );
      assert.ok(
        !tooltip.includes('15') || tooltip.includes('1.5') || tooltip.includes('15mm') || tooltip.includes('15 mm') || tooltip.includes('15 มม') || tooltip.includes('15%'),
        `${file} should not retain stale 15 zones reference`,
      );
    }
  }
});
