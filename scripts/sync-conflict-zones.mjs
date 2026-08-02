#!/usr/bin/env node
/**
 * sync-conflict-zones.mjs
 *
 * Fetches the CONFLICT_ZONES array from the upstream koala73/worldmonitor
 * repository and patches it into the local src/config/geo.ts, preserving
 * all other local-only content in that file.
 *
 * Usage:
 *   node scripts/sync-conflict-zones.mjs           # apply changes
 *   node scripts/sync-conflict-zones.mjs --dry-run # preview diff only
 *   node scripts/sync-conflict-zones.mjs --check   # exit 1 if out of sync
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LOCAL_FILE = resolve(ROOT, 'src/config/geo.ts');

const UPSTREAM_OWNER = 'koala73';
const UPSTREAM_REPO = 'worldmonitor';
const UPSTREAM_BRANCH = 'main';
const UPSTREAM_FILE_PATH = 'shared/geo-data.ts';
const UPSTREAM_RAW_URL = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}/${UPSTREAM_FILE_PATH}`;

const isDryRun = process.argv.includes('--dry-run');
const isCheck = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a named export block:
 *   export const <name>: <type> = [
 *     ...
 *   ];
 *
 * Returns { block: string, startIndex: number, endIndex: number }
 * where startIndex is inclusive of the export keyword and
 * endIndex is exclusive (points to the char after the closing `];`).
 */
function extractExportedArray(source, exportName) {
  // Match the declaration line, e.g. `export const CONFLICT_ZONES: ConflictZone[] = [`
  const declPattern = new RegExp(`export const ${exportName}[^=]+=\\s*\\[`, 'm');
  const match = declPattern.exec(source);
  if (!match) {
    throw new Error(`Could not find 'export const ${exportName}' in source`);
  }

  const startIndex = match.index;
  // Walk forward from the opening `[` to find the matching `]`
  let depth = 0;
  let i = match.index + match[0].length - 1; // position of the opening `[`
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        // Consume optional `;` and newline after the closing `]`
        let endIndex = i + 1;
        if (source[endIndex] === ';') endIndex++;
        // include the trailing newline(s) so replacement is clean
        while (endIndex < len && (source[endIndex] === '\r' || source[endIndex] === '\n')) endIndex++;
        return { block: source.slice(startIndex, endIndex), startIndex, endIndex };
      }
    }
    i++;
  }

  throw new Error(`Could not find closing bracket for '${exportName}'`);
}

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`Fetching upstream ${UPSTREAM_FILE_PATH} from ${UPSTREAM_OWNER}/${UPSTREAM_REPO}@${UPSTREAM_BRANCH}...`);

let upstreamSource;
try {
  const response = await fetch(UPSTREAM_RAW_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  upstreamSource = await response.text();
} catch (err) {
  console.error(`ERROR: Failed to fetch upstream file: ${err.message}`);
  process.exit(1);
}

// Extract CONFLICT_ZONES from upstream
let upstreamBlock;
try {
  upstreamBlock = extractExportedArray(upstreamSource, 'CONFLICT_ZONES');
} catch (err) {
  console.error(`ERROR: Could not parse upstream CONFLICT_ZONES: ${err.message}`);
  process.exit(1);
}

// Read local file
let localSource;
try {
  localSource = readFileSync(LOCAL_FILE, 'utf8');
} catch (err) {
  console.error(`ERROR: Could not read local file ${LOCAL_FILE}: ${err.message}`);
  process.exit(1);
}

// Extract local CONFLICT_ZONES block
let localBlock;
try {
  localBlock = extractExportedArray(localSource, 'CONFLICT_ZONES');
} catch (err) {
  console.error(`ERROR: Could not parse local CONFLICT_ZONES: ${err.message}`);
  process.exit(1);
}

const upstreamBlockText = upstreamBlock.block;
const localBlockText = localBlock.block;

if (md5(upstreamBlockText) === md5(localBlockText)) {
  console.log('✅ CONFLICT_ZONES is already up to date with upstream. No changes needed.');
  process.exit(0);
}

// Show a simple line-level diff summary
const upstreamLines = upstreamBlockText.split('\n');
const localLines = localBlockText.split('\n');
console.log('\n📋 Summary of changes:');
console.log(`  Upstream CONFLICT_ZONES: ${upstreamLines.length} lines`);
console.log(`  Local CONFLICT_ZONES:    ${localLines.length} lines`);

// Count zones in each
const countZones = (text) => (text.match(/\{\s*\n\s*id:/g) || []).length;
const upstreamZoneCount = countZones(upstreamBlockText);
const localZoneCount = countZones(localBlockText);
console.log(`  Upstream zones: ${upstreamZoneCount}`);
console.log(`  Local zones:    ${localZoneCount}`);

if (isDryRun || isCheck) {
  // Show which zone IDs exist in each
  const extractIds = (text) => [...text.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  const upstreamIds = new Set(extractIds(upstreamBlockText));
  const localIds = new Set(extractIds(localBlockText));

  const onlyInUpstream = [...upstreamIds].filter(id => !localIds.has(id));
  const onlyInLocal = [...localIds].filter(id => !upstreamIds.has(id));

  if (onlyInUpstream.length > 0) {
    console.log(`\n  ➕ Zones in upstream not in local: ${onlyInUpstream.join(', ')}`);
  }
  if (onlyInLocal.length > 0) {
    console.log(`  ➖ Zones in local not in upstream (would be removed): ${onlyInLocal.join(', ')}`);
  }

  if (isCheck) {
    console.log('\n❌ CONFLICT_ZONES is out of sync with upstream.');
    process.exit(1);
  }

  console.log('\nDry-run mode: no files written.');
  process.exit(0);
}

// Apply: replace the local block with the upstream block
const updatedSource =
  localSource.slice(0, localBlock.startIndex) +
  upstreamBlockText +
  localSource.slice(localBlock.endIndex);

try {
  writeFileSync(LOCAL_FILE, updatedSource, 'utf8');
} catch (err) {
  console.error(`ERROR: Could not write ${LOCAL_FILE}: ${err.message}`);
  process.exit(1);
}

console.log(`\n✅ Successfully patched CONFLICT_ZONES in ${LOCAL_FILE}`);
console.log('   Run `git diff src/config/geo.ts` to review changes before committing.');
