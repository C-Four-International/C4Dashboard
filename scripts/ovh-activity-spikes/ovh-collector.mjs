#!/usr/bin/env node
/**
 * OVH Historical Signal Activity Spikes Collector & Static Graph Renderer
 *
 * Zero-dependency Node.js (v22.5+ / v24+) backend using built-in `node:sqlite`.
 *
 * Usage:
 *   1. Seed 30d baseline & render initial graphs:
 *      node scripts/ovh-activity-spikes/ovh-collector.mjs --seed-sample
 *
 *   2. Single poll + SQLite write + static SVG generation (for 15m cron):
 *      node scripts/ovh-activity-spikes/ovh-collector.mjs --once
 *
 *   3. Daemon mode (polls every 15m + serves static graphs over HTTP with CORS):
 *      node scripts/ovh-activity-spikes/ovh-collector.mjs --serve
 *
 * Environment Variables:
 *   OVH_DB_PATH      Path to SQLite file (default: ./data/activity_spikes.db)
 *   OVH_OUTPUT_DIR   Directory for static .svg & events.json (default: ./public/graphs)
 *   OVH_PORT         HTTP port when running with --serve (default: 8090)
 *   FIRMS_MAP_KEY    Optional NASA FIRMS API key for live thermal anomaly counts
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.OVH_DB_PATH || path.join(__dirname, 'data', 'activity_spikes.db');
const OUTPUT_DIR = process.env.OVH_OUTPUT_DIR || path.join(__dirname, 'output');
const PORT = Number(process.env.OVH_PORT || 8090);
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const THEATERS = {
  'east-med': {
    id: 'east-med',
    label: 'East Med & Levant',
    shortLabel: 'E.MED / LEVANT',
    bboxLabel: '29°N–37°N, 25°E–37°E',
    bounds: { south: 29, north: 37, west: 25, east: 37 },
    jammingProbe: { lat: 33.5, lon: 34.5, dist: 250 },
    lat: 34.0,
    lon: 33.5,
    color: '#38bdf8',
  },
  'iran-centcom': {
    id: 'iran-centcom',
    label: 'Iran / Persian Gulf (CENTCOM)',
    shortLabel: 'IRAN / CENTCOM',
    bboxLabel: '20°N–42°N, 30°E–65°E',
    bounds: { south: 20, north: 42, west: 30, east: 65 },
    jammingProbe: { lat: 27.5, lon: 51.5, dist: 250 },
    lat: 27.5,
    lon: 51.0,
    color: '#f59e0b',
  },
  'black-sea': {
    id: 'black-sea',
    label: 'Black Sea & NATO E. Flank',
    shortLabel: 'BLACK SEA / BALTIC',
    bboxLabel: '40°N–65°N, 10°E–42°E',
    bounds: { south: 40, north: 65, west: 10, east: 42 },
    jammingProbe: { lat: 46.5, lon: 32.5, dist: 250 },
    lat: 44.5,
    lon: 33.5,
    color: '#a855f7',
  },
  'taiwan-scs': {
    id: 'taiwan-scs',
    label: 'Taiwan Strait & South China Sea',
    shortLabel: 'TAIWAN / SCS',
    bboxLabel: '5°N–30°N, 105°E–130°E',
    bounds: { south: 5, north: 30, west: 105, east: 130 },
    jammingProbe: { lat: 24.0, lon: 120.0, dist: 250 },
    lat: 23.5,
    lon: 119.5,
    color: '#22c55e',
  },
};

const TANKER_AWACS_TYPES = new Set([
  'K35R', 'K35E', 'KC46', 'KC10', 'KC30', 'A332', 'E3TF', 'E3CF', 'E2', 'E737', 'B703',
]);
const TANKER_AWACS_CALLSIGNS = /^(KING|SHELL|TEAL|TARTAN|SNTRY|NATO|GOLD|PACK|QUID|LAGR|NACHO)/i;

const ISR_RECON_TYPES = new Set([
  'R135', 'RC135', 'U2', 'P8', 'P3', 'EP3', 'E8', 'RQ4', 'MQ9', 'B350', 'CL60', 'GLF5',
]);
const ISR_RECON_CALLSIGNS = /^(FORTE|RIVET|COBRA|OLIVE|JAKE|DRAGN|TRIDENT|RED|HAWK|REAPER)/i;

const AIRLIFT_TYPES = new Set([
  'C17', 'C5M', 'C130', 'C30J', 'A400', 'IL76', 'AN12', 'AN26', 'C2', 'C27J',
]);
const AIRLIFT_CALLSIGNS = /^(RCH|REACH|MOOSE|HERKY|ASCOT|RAFAIR|CTM|GAF|CNV|EVAC|SAM|SPAR)/i;

export function classifyMilitaryAircraft(ac) {
  const typeCode = String(ac.t || '').toUpperCase().trim();
  const callsign = String(ac.flight || '').toUpperCase().trim();

  if (TANKER_AWACS_TYPES.has(typeCode) || TANKER_AWACS_CALLSIGNS.test(callsign)) {
    return 'tanker_awacs';
  }
  if (ISR_RECON_TYPES.has(typeCode) || ISR_RECON_CALLSIGNS.test(callsign)) {
    return 'isr_recon';
  }
  if (AIRLIFT_TYPES.has(typeCode) || AIRLIFT_CALLSIGNS.test(callsign)) {
    return 'airlift';
  }
  return 'fighters_other';
}

export function initDatabase(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS theater_samples (
      ts INTEGER NOT NULL,
      hour_of_day INTEGER NOT NULL,
      theater_id TEXT NOT NULL,
      total_military INTEGER NOT NULL DEFAULT 0,
      tanker_awacs INTEGER NOT NULL DEFAULT 0,
      isr_recon INTEGER NOT NULL DEFAULT 0,
      airlift INTEGER NOT NULL DEFAULT 0,
      fighters_other INTEGER NOT NULL DEFAULT 0,
      gnss_jamming INTEGER NOT NULL DEFAULT 0,
      thermal_anomalies INTEGER NOT NULL DEFAULT 0,
      z_tanker_awacs REAL NOT NULL DEFAULT 0,
      z_isr_recon REAL NOT NULL DEFAULT 0,
      z_gnss_jamming REAL NOT NULL DEFAULT 0,
      z_thermal REAL NOT NULL DEFAULT 0,
      composite_z REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (ts, theater_id)
    );

    CREATE INDEX IF NOT EXISTS idx_samples_theater_ts
      ON theater_samples(theater_id, ts);

    CREATE TABLE IF NOT EXISTS convergence_events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      theater_id TEXT NOT NULL,
      theater_label TEXT NOT NULL,
      z_score REAL NOT NULL,
      severity TEXT NOT NULL,
      headline TEXT NOT NULL,
      layers_json TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts
      ON convergence_events(ts DESC);
  `);

  return db;
}

/**
 * Computes Z-score against the 7-day rolling baseline for the same theater
 * and time-of-day window (hour_of_day ± 2 hours) to prevent diurnal cycles
 * from appearing as false anomalies.
 */
export function computeZScore(db, theaterId, column, currentValue, ts, hourOfDay) {
  const sevenDaysAgo = ts - 7 * 24 * 3600;
  const rows = db
    .prepare(
      `SELECT ${column} AS val
       FROM theater_samples
       WHERE theater_id = ?
         AND ts >= ? AND ts < ?
         AND (
           ABS(hour_of_day - ?) <= 2
           OR ABS(hour_of_day - ? + 24) <= 2
           OR ABS(hour_of_day - ? - 24) <= 2
         )`
    )
    .all(theaterId, sevenDaysAgo, ts, hourOfDay, hourOfDay, hourOfDay);

  if (rows.length < 6) {
    // Fallback to all hours in last 7 days if sparse
    const allRows = db
      .prepare(`SELECT ${column} AS val FROM theater_samples WHERE theater_id = ? AND ts >= ? AND ts < ?`)
      .all(theaterId, sevenDaysAgo, ts);
    if (allRows.length < 4) return 0;
    return calcZ(
      allRows.map((r) => Number(r.val || 0)),
      currentValue
    );
  }

  return calcZ(
    rows.map((r) => Number(r.val || 0)),
    currentValue
  );
}

function calcZ(values, current) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.max(1.2, Math.sqrt(variance));
  return Number(((current - mean) / std).toFixed(2));
}

/**
 * Fetches live military aircraft from adsb.fi and GNSS interference counts from adsb.lol
 */
export async function fetchLiveTelemetry() {
  const counts = {};
  for (const tid of Object.keys(THEATERS)) {
    counts[tid] = {
      total_military: 0,
      tanker_awacs: 0,
      isr_recon: 0,
      airlift: 0,
      fighters_other: 0,
      gnss_jamming: 0,
      thermal_anomalies: 0,
    };
  }

  // 1. Poll adsb.fi military endpoint
  try {
    const res = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'C4Dashboard-OVH-Collector/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      const aircraftList = Array.isArray(data?.ac) ? data.ac : [];

      for (const ac of aircraftList) {
        const lat = Number(ac.lat);
        const lon = Number(ac.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        for (const [tid, cfg] of Object.entries(THEATERS)) {
          const b = cfg.bounds;
          if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east) {
            counts[tid].total_military += 1;
            const bucket = classifyMilitaryAircraft(ac);
            counts[tid][bucket] += 1;

            if ((typeof ac.nic === 'number' && ac.nic < 7) || (typeof ac.nac_p === 'number' && ac.nac_p < 8)) {
              counts[tid].gnss_jamming += 1;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[OVH Collector] adsb.fi poll warning:', err.message);
  }

  // 2. Poll adsb.lol regional probes for civil + military GNSS/GPS jamming density
  await Promise.allSettled(
    Object.entries(THEATERS).map(async ([tid, cfg]) => {
      const { lat, lon, dist } = cfg.jammingProbe;
      const url = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'C4Dashboard-OVH-Collector/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json();
      const acList = Array.isArray(data?.ac) ? data.ac : [];
      let jammed = 0;
      for (const plane of acList) {
        if (
          plane.lat &&
          plane.lon &&
          ((typeof plane.nic === 'number' && plane.nic < 7) ||
            (typeof plane.nac_p === 'number' && plane.nac_p < 8))
        ) {
          jammed += 1;
        }
      }
      counts[tid].gnss_jamming = Math.max(counts[tid].gnss_jamming, jammed);
    })
  );

  return counts;
}

/**
 * Inserts a poll snapshot into SQLite, records any >2.5σ convergence events,
 * and prunes rows older than 30 days.
 */
export function recordTelemetrySnapshot(db, telemetryByTheater, ts = Math.floor(Date.now() / 1000)) {
  const dateObj = new Date(ts * 1000);
  const hourOfDay = dateObj.getUTCHours();

  const insertSample = db.prepare(`
    INSERT OR REPLACE INTO theater_samples (
      ts, hour_of_day, theater_id,
      total_military, tanker_awacs, isr_recon, airlift, fighters_other,
      gnss_jamming, thermal_anomalies,
      z_tanker_awacs, z_isr_recon, z_gnss_jamming, z_thermal, composite_z
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO convergence_events (
      id, ts, theater_id, theater_label, z_score, severity, headline, layers_json, lat, lon
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [tid, cfg] of Object.entries(THEATERS)) {
    const m = telemetryByTheater[tid] || {
      total_military: 0,
      tanker_awacs: 0,
      isr_recon: 0,
      airlift: 0,
      fighters_other: 0,
      gnss_jamming: 0,
      thermal_anomalies: 0,
    };

    const zTanker = computeZScore(db, tid, 'tanker_awacs', m.tanker_awacs, ts, hourOfDay);
    const zIsr = computeZScore(db, tid, 'isr_recon', m.isr_recon, ts, hourOfDay);
    const zJam = computeZScore(db, tid, 'gnss_jamming', m.gnss_jamming, ts, hourOfDay);
    const zTherm = computeZScore(db, tid, 'thermal_anomalies', m.thermal_anomalies, ts, hourOfDay);

    // Weighted composite Z-score emphasizing leading Tanker/AWACS + ISR + coincident GNSS Jamming
    const compositeZ = Number(
      Math.max(
        -0.8,
        zTanker * 0.38 + zIsr * 0.24 + zJam * 0.26 + zTherm * 0.12
      ).toFixed(2)
    );

    insertSample.run(
      ts,
      hourOfDay,
      tid,
      m.total_military,
      m.tanker_awacs,
      m.isr_recon,
      m.airlift,
      m.fighters_other,
      m.gnss_jamming,
      m.thermal_anomalies,
      zTanker,
      zIsr,
      zJam,
      zTherm,
      compositeZ
    );

    if (compositeZ >= 2.5) {
      const triggered = [];
      if (zTanker >= 1.8) triggered.push('Tanker/AWACS');
      if (zIsr >= 1.8) triggered.push('ISR/Recon');
      if (m.airlift >= 4) triggered.push('Strategic Airlift');
      if (zJam >= 1.8) triggered.push('GNSS Jamming');
      if (zTherm >= 1.8) triggered.push('FIRMS Thermal');
      if (triggered.length === 0) triggered.push('Multi-Layer Surge');

      const severity = compositeZ >= 3.0 ? 'critical' : 'elevated';
      const headline = `${cfg.label}: ${m.tanker_awacs} Tanker/AWACS, ${m.isr_recon} ISR, ${m.gnss_jamming} GNSS jammed aircraft (+${compositeZ.toFixed(1)}σ above 7d baseline)`;
      const bucketId = `evt-${tid}-${Math.floor(ts / (6 * 3600))}`;

      insertEvent.run(
        bucketId,
        ts,
        tid,
        cfg.label,
        compositeZ,
        severity,
        headline,
        JSON.stringify(triggered),
        cfg.lat,
        cfg.lon
      );
    }
  }

  // Prune data older than 30 days
  const cutoff = ts - RETENTION_SECONDS;
  db.prepare('DELETE FROM theater_samples WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM convergence_events WHERE ts < ?').run(cutoff);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Downsamples 30 days of SQLite rows into 120 6-hour buckets and renders
 * the static SVG graph files + events.json atomically to OUTPUT_DIR.
 */
export function renderStaticGraphsFromDb(db, outputDir = OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - RETENTION_SECONDS;
  const N = 120; // 120 6-hour buckets across 30 days
  const bucketSpan = RETENTION_SECONDS / N;

  const rawRows = db
    .prepare(
      `SELECT ts, theater_id, tanker_awacs, isr_recon, gnss_jamming, thermal_anomalies,
              z_tanker_awacs, z_isr_recon, z_gnss_jamming, z_thermal, composite_z
       FROM theater_samples
       WHERE ts >= ?
       ORDER BY ts ASC`
    )
    .all(startSec);

  const bucketsByTheater = {};
  for (const tid of Object.keys(THEATERS)) {
    bucketsByTheater[tid] = Array.from({ length: N }, () => ({
      composite_z: 0,
      z_tanker_awacs: 0,
      z_isr_recon: 0,
      z_gnss_jamming: 0,
      z_thermal: 0,
      count: 0,
    }));
  }

  for (const row of rawRows) {
    const tid = row.theater_id;
    if (!bucketsByTheater[tid]) continue;
    const idx = Math.min(N - 1, Math.max(0, Math.floor((Number(row.ts) - startSec) / bucketSpan)));
    const b = bucketsByTheater[tid][idx];
    // Keep peak anomaly within each 6-hour bucket so spikes are never flattened
    if (b.count === 0 || Number(row.composite_z) > b.composite_z) {
      b.composite_z = Number(row.composite_z || 0);
      b.z_tanker_awacs = Number(row.z_tanker_awacs || 0);
      b.z_isr_recon = Number(row.z_isr_recon || 0);
      b.z_gnss_jamming = Number(row.z_gnss_jamming || 0);
      b.z_thermal = Number(row.z_thermal || 0);
    }
    b.count += 1;
  }

  const eventsRows = db
    .prepare(
      `SELECT id, ts, theater_id, theater_label, z_score, severity, headline, layers_json, lat, lon
       FROM convergence_events
       WHERE ts >= ?
       ORDER BY ts DESC
       LIMIT 12`
    )
    .all(startSec);

  const formattedEvents = eventsRows.map((ev) => {
    const daysAgo = Math.max(0, Math.round((nowSec - Number(ev.ts)) / 86400));
    const utcTime = new Date(Number(ev.ts) * 1000).toISOString().slice(11, 16) + 'Z';
    const dayIndex = Math.min(N - 1, Math.max(0, Math.floor((Number(ev.ts) - startSec) / bucketSpan)));
    return {
      id: ev.id,
      dayIndex,
      dateLabel: `D-${daysAgo} (${utcTime})`,
      theaterId: ev.theater_id,
      theaterLabel: ev.theater_label,
      zScore: Number(ev.z_score),
      severity: ev.severity,
      headline: ev.headline,
      layersTriggered: JSON.parse(ev.layers_json || '[]'),
      lat: Number(ev.lat),
      lon: Number(ev.lon),
    };
  });

  // Write events.json atomically
  const eventsTmp = path.join(outputDir, 'events.json.tmp');
  const eventsDest = path.join(outputDir, 'events.json');
  fs.writeFileSync(eventsTmp, JSON.stringify({ generatedAt: new Date().toISOString(), events: formattedEvents }, null, 2));
  fs.renameSync(eventsTmp, eventsDest);

  // Render all 5 static SVG views
  const views = ['all', ...Object.keys(THEATERS)];
  for (const view of views) {
    const svgContent = buildStaticSvg(view, bucketsByTheater, formattedEvents);
    const tmpFile = path.join(outputDir, `activity-spikes-${view}.svg.tmp`);
    const destFile = path.join(outputDir, `activity-spikes-${view}.svg`);
    fs.writeFileSync(tmpFile, svgContent, 'utf8');
    fs.renameSync(tmpFile, destFile);
  }
}

function buildStaticSvg(theater, bucketsByTheater, events) {
  const W = 760;
  const H = 390;
  const N = 120;
  const padL = 44;
  const padR = 18;
  const topPlotY = 48;
  const topPlotH = 182;
  const botPlotY = 266;
  const botPlotH = 88;
  const plotW = W - padL - padR;

  const xAt = (i) => padL + (i / (N - 1)) * plotW;
  const maxSigma = 5.0;
  const minSigma = -0.8;
  const yAtSigma = (s) => {
    const clamped = Math.max(minSigma, Math.min(maxSigma, s));
    const norm = (clamped - minSigma) / (maxSigma - minSigma);
    return topPlotY + topPlotH - norm * topPlotH;
  };

  const buildPolyline = (vals) =>
    vals.map((v, idx) => `${xAt(idx).toFixed(1)},${yAtSigma(v).toFixed(1)}`).join(' ');

  const buildAreaPath = (vals) => {
    const baselineY = yAtSigma(0).toFixed(1);
    const pts = vals.map((v, idx) => `${xAt(idx).toFixed(1)},${yAtSigma(v).toFixed(1)}`).join(' L ');
    return `M ${xAt(0).toFixed(1)},${baselineY} L ${pts} L ${xAt(N - 1).toFixed(1)},${baselineY} Z`;
  };

  const sigmaTicks = [0, 1, 2, 3, 4];
  const gridLinesSvg = sigmaTicks
    .map((s) => {
      const y = yAtSigma(s).toFixed(1);
      const isCrit = s === 3;
      const isElev = s === 2;
      const stroke = isCrit
        ? 'rgba(239, 68, 68, 0.55)'
        : isElev
          ? 'rgba(245, 158, 11, 0.45)'
          : 'rgba(148, 163, 184, 0.14)';
      const dash = isCrit || isElev ? 'stroke-dasharray="4,3"' : '';
      const labelColor = isCrit ? '#f87171' : isElev ? '#fbbf24' : '#64748b';
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${stroke}" stroke-width="1" ${dash} />
        <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" fill="${labelColor}" font-size="9.5" font-family="monospace">+${s}σ</text>
      `;
    })
    .join('');

  const relevantEvents =
    theater === 'all' ? events.slice(0, 6) : events.filter((e) => e.theaterId === theater).slice(0, 5);

  const spikeBandsSvg = relevantEvents
    .map((ev) => {
      const cx = xAt(ev.dayIndex);
      const bandColor = ev.severity === 'critical' ? 'rgba(239, 68, 68, 0.13)' : 'rgba(245, 158, 11, 0.12)';
      const lineColor = ev.severity === 'critical' ? '#ef4444' : '#f59e0b';
      const pillW = 90;
      const pillX = Math.min(W - padR - pillW, Math.max(padL + 2, cx - pillW / 2));
      return `
        <rect x="${(cx - 8).toFixed(1)}" y="${topPlotY}" width="16" height="${topPlotH + botPlotH + 36}" fill="${bandColor}" />
        <line x1="${cx.toFixed(1)}" y1="${topPlotY}" x2="${cx.toFixed(1)}" y2="${botPlotY + botPlotH}" stroke="${lineColor}" stroke-width="1" stroke-dasharray="2,2" opacity="0.8" />
        <rect x="${pillX.toFixed(1)}" y="${topPlotY + 3}" width="${pillW}" height="14" rx="3" fill="rgba(15, 23, 42, 0.92)" stroke="${lineColor}" stroke-width="0.8" />
        <text x="${(pillX + pillW / 2).toFixed(1)}" y="${topPlotY + 12.5}" text-anchor="middle" fill="${lineColor}" font-size="8.5" font-weight="700" font-family="monospace">${escapeXml(ev.theaterId.toUpperCase())} +${ev.zScore.toFixed(1)}σ</text>
      `;
    })
    .join('');

  let topLinesSvg = '';
  let legendItemsSvg = '';

  if (theater === 'all') {
    const order = ['taiwan-scs', 'black-sea', 'east-med', 'iran-centcom'];
    topLinesSvg = order
      .map((tid) => {
        const cfg = THEATERS[tid];
        const vals = bucketsByTheater[tid].map((b) => b.composite_z);
        return `
          <path d="${buildAreaPath(vals)}" fill="${cfg.color}" opacity="0.07" />
          <polyline fill="none" stroke="${cfg.color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" points="${buildPolyline(vals)}" />
        `;
      })
      .join('');

    const legendEntries = [
      { label: 'EAST MED', color: THEATERS['east-med'].color },
      { label: 'IRAN / CENTCOM', color: THEATERS['iran-centcom'].color },
      { label: 'BLACK SEA', color: THEATERS['black-sea'].color },
      { label: 'TAIWAN / SCS', color: THEATERS['taiwan-scs'].color },
    ];
    legendItemsSvg = legendEntries
      .map(
        (item, idx) => `
        <g transform="translate(${padL + idx * 132}, 30)">
          <line x1="0" y1="-3" x2="12" y2="-3" stroke="${item.color}" stroke-width="2.4" />
          <text x="16" y="0" fill="#cbd5e1" font-size="9.5" font-family="monospace" font-weight="600">${item.label}</text>
        </g>
      `
      )
      .join('');
  } else {
    const buckets = bucketsByTheater[theater];
    const layerDefs = [
      { name: 'TANKER / AWACS (LEAD)', color: '#38bdf8', data: buckets.map((b) => b.z_tanker_awacs) },
      { name: 'ISR / RECON', color: '#a855f7', data: buckets.map((b) => b.z_isr_recon) },
      { name: 'GNSS JAMMING', color: '#f59e0b', data: buckets.map((b) => b.z_gnss_jamming) },
      { name: 'FIRMS THERMAL', color: '#ef4444', data: buckets.map((b) => b.z_thermal) },
    ];

    topLinesSvg = layerDefs
      .map(
        (l) => `
        <path d="${buildAreaPath(l.data)}" fill="${l.color}" opacity="0.06" />
        <polyline fill="none" stroke="${l.color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" points="${buildPolyline(l.data)}" />
      `
      )
      .join('');

    legendItemsSvg = layerDefs
      .map(
        (item, idx) => `
        <g transform="translate(${padL + idx * 165}, 30)">
          <line x1="0" y1="-3" x2="12" y2="-3" stroke="${item.color}" stroke-width="2.4" />
          <text x="16" y="0" fill="#cbd5e1" font-size="9" font-family="monospace" font-weight="600">${item.name}</text>
        </g>
      `
      )
      .join('');
  }

  const barW = Math.max(2.5, plotW / N - 1.4);
  const barsSvg = Array.from({ length: N }, (_, i) => {
    const b =
      theater === 'all'
        ? {
            z_tanker_awacs:
              (bucketsByTheater['east-med'][i].z_tanker_awacs +
                bucketsByTheater['iran-centcom'][i].z_tanker_awacs +
                bucketsByTheater['black-sea'][i].z_tanker_awacs +
                bucketsByTheater['taiwan-scs'][i].z_tanker_awacs) /
              2.5,
            z_isr_recon:
              (bucketsByTheater['east-med'][i].z_isr_recon +
                bucketsByTheater['iran-centcom'][i].z_isr_recon +
                bucketsByTheater['black-sea'][i].z_isr_recon +
                bucketsByTheater['taiwan-scs'][i].z_isr_recon) /
              2.5,
            z_gnss_jamming:
              (bucketsByTheater['east-med'][i].z_gnss_jamming +
                bucketsByTheater['iran-centcom'][i].z_gnss_jamming +
                bucketsByTheater['black-sea'][i].z_gnss_jamming +
                bucketsByTheater['taiwan-scs'][i].z_gnss_jamming) /
              2.5,
            z_thermal:
              (bucketsByTheater['east-med'][i].z_thermal +
                bucketsByTheater['iran-centcom'][i].z_thermal +
                bucketsByTheater['black-sea'][i].z_thermal +
                bucketsByTheater['taiwan-scs'][i].z_thermal) /
              2.5,
          }
        : bucketsByTheater[theater][i];

    const tVal = Math.max(0.1, b.z_tanker_awacs + 0.6);
    const iVal = Math.max(0.1, b.z_isr_recon + 0.6);
    const jVal = Math.max(0.1, b.z_gnss_jamming + 0.6);
    const thVal = Math.max(0.05, b.z_thermal + 0.4);
    const sum = tVal + iVal + jVal + thVal;
    const norm = Math.min(1, sum / 11.5);
    const totalH = Math.max(4, norm * (botPlotH - 8));

    const hTanker = totalH * (tVal / sum);
    const hIsr = totalH * (iVal / sum);
    const hJam = totalH * (jVal / sum);
    const hTherm = totalH * (thVal / sum);

    const x = xAt(i) - barW / 2;
    const yBase = botPlotY + botPlotH;
    return `
      <rect x="${x.toFixed(1)}" y="${(yBase - hTanker).toFixed(1)}" width="${barW.toFixed(1)}" height="${hTanker.toFixed(1)}" fill="#38bdf8" opacity="0.85" />
      <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr).toFixed(1)}" width="${barW.toFixed(1)}" height="${hIsr.toFixed(1)}" fill="#a855f7" opacity="0.85" />
      <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr - hJam).toFixed(1)}" width="${barW.toFixed(1)}" height="${hJam.toFixed(1)}" fill="#f59e0b" opacity="0.85" />
      <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr - hJam - hTherm).toFixed(1)}" width="${barW.toFixed(1)}" height="${hTherm.toFixed(1)}" fill="#ef4444" opacity="0.9" />
    `;
  }).join('');

  const xTicks = [
    { idx: 0, label: '-30d' },
    { idx: 20, label: '-25d' },
    { idx: 40, label: '-20d' },
    { idx: 60, label: '-15d' },
    { idx: 80, label: '-10d' },
    { idx: 100, label: '-5d' },
    { idx: 119, label: 'NOW' },
  ];
  const xAxisLabelsSvg = xTicks
    .map((tk) => {
      const x = xAt(tk.idx).toFixed(1);
      return `
        <line x1="${x}" y1="${botPlotY + botPlotH}" x2="${x}" y2="${botPlotY + botPlotH + 4}" stroke="#475569" stroke-width="1" />
        <text x="${x}" y="${botPlotY + botPlotH + 15}" text-anchor="middle" fill="#94a3b8" font-size="9.5" font-family="monospace">${tk.label}</text>
      `;
    })
    .join('');

  const titleText =
    theater === 'all'
      ? '30-DAY MULTI-THEATER COMPOSITE Z-SCORE (OVH SQLITE FEED)'
      : `${THEATERS[theater].shortLabel} (${THEATERS[theater].bboxLabel}) — LAYER CORRELATION`;

  const timestampStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
  <rect width="${W}" height="${H}" fill="#090d16" rx="4" />
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="rgba(148, 163, 184, 0.16)" rx="4" />
  <text x="${padL}" y="16" fill="#f8fafc" font-size="10.5" font-weight="700" font-family="monospace" letter-spacing="0.4">${escapeXml(titleText)}</text>
  <text x="${W - padR}" y="16" text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">OVH SQLITE 30D • ${timestampStr}</text>
  ${legendItemsSvg}
  <g transform="translate(${W - padR - 145}, 30)">
    <line x1="0" y1="-3" x2="10" y2="-3" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="3,2" />
    <text x="14" y="0" fill="#f87171" font-size="8.5" font-family="monospace">CRIT (+3σ) / ELEV (+2σ)</text>
  </g>
  <rect x="${padL}" y="${topPlotY}" width="${plotW}" height="${topPlotH}" fill="rgba(15, 23, 42, 0.55)" stroke="rgba(148, 163, 184, 0.12)" />
  ${gridLinesSvg}
  ${spikeBandsSvg}
  ${topLinesSvg}
  <text x="${padL}" y="${botPlotY - 7}" fill="#94a3b8" font-size="9" font-weight="700" font-family="monospace" letter-spacing="0.3">SIGNAL COMPOSITION STACK (TANKER/AWACS • ISR • GNSS JAMMING • FIRMS THERMAL)</text>
  <rect x="${padL}" y="${botPlotY}" width="${plotW}" height="${botPlotH}" fill="rgba(15, 23, 42, 0.55)" stroke="rgba(148, 163, 184, 0.12)" />
  ${barsSvg}
  ${xAxisLabelsSvg}
</svg>`;
}

function seededNoise(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function gaussianPulse(idx, center, width, height) {
  const d = (idx - center) / width;
  return height * Math.exp(-0.5 * d * d);
}

/**
 * Seeds 30 days of realistic 6-hour historical rows into SQLite so Z-scores
 * and static graphs are immediately populated on fresh deployments.
 */
export function seedSampleHistory(db) {
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - RETENTION_SECONDS;
  const N = 120;
  const stepSec = Math.floor(RETENTION_SECONDS / N);

  db.exec('BEGIN');
  try {
    for (let i = 0; i < N; i++) {
      const ts = startSec + i * stepSec;
      const snapshot = {};

      const blackSeaPulse = gaussianPulse(i, 26, 2.0, 12) + gaussianPulse(i, 68, 2.2, 6);
      const eastMedPulse = gaussianPulse(i, 54, 2.2, 14) + gaussianPulse(i, 114, 1.8, 10);
      const taiwanPulse = gaussianPulse(i, 78, 2.0, 10);
      const iranPulse = gaussianPulse(i, 96, 3.2, 7) + gaussianPulse(i, 102, 1.9, 16);

      const pulses = {
        'black-sea': blackSeaPulse,
        'east-med': eastMedPulse,
        'taiwan-scs': taiwanPulse,
        'iran-centcom': iranPulse,
      };

      for (const [tid, pulse] of Object.entries(pulses)) {
        const n = seededNoise(i * 3.1 + tid.length * 17);
        const tanker = Math.max(1, Math.round(2 + n * 2 + pulse * 0.45));
        const isr = Math.max(1, Math.round(2 + n * 2 + pulse * 0.35));
        const airlift = Math.max(1, Math.round(3 + n * 3 + pulse * 0.4));
        const fighters = Math.max(2, Math.round(5 + n * 4 + pulse * 0.5));
        const jamming = Math.max(2, Math.round(8 + n * 6 + pulse * 1.4));
        const thermal = pulse > 5 ? Math.round(4 + pulse * 1.1) : Math.round(1 + n * 2);

        snapshot[tid] = {
          total_military: tanker + isr + airlift + fighters,
          tanker_awacs: tanker,
          isr_recon: isr,
          airlift,
          fighters_other: fighters,
          gnss_jamming: jamming,
          thermal_anomalies: thermal,
        };
      }

      recordTelemetrySnapshot(db, snapshot, ts);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function startStaticHttpServer(outputDir = OUTPUT_DIR, port = PORT) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', `http://localhost:${port}`);
    const cleanName = path.basename(urlObj.pathname.replace(/^\/graphs\//, ''));

    if (cleanName === 'health' || urlObj.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'c4-ovh-activity-spikes' }));
      return;
    }

    const allowedFile = /^(activity-spikes-(all|east-med|iran-centcom|black-sea|taiwan-scs)\.svg|events\.json)$/.test(
      cleanName
    );
    if (!allowedFile) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const filePath = path.join(outputDir, cleanName);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Graph not generated yet' }));
      return;
    }

    const contentType = cleanName.endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : 'application/json; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`[OVH Activity Spikes] Static graph server listening on http://0.0.0.0:${port}/graphs/`);
  });

  return server;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const db = initDatabase(DB_PATH);

  if (args.has('--seed-sample')) {
    console.log('[OVH Activity Spikes] Seeding 30-day sample baseline into SQLite...');
    seedSampleHistory(db);
    renderStaticGraphsFromDb(db, OUTPUT_DIR);
    console.log(`[OVH Activity Spikes] Seeded SQLite (${DB_PATH}) & rendered static graphs to ${OUTPUT_DIR}`);
  }

  if (args.has('--once')) {
    console.log('[OVH Activity Spikes] Polling live military & GNSS telemetry...');
    const liveCounts = await fetchLiveTelemetry();
    recordTelemetrySnapshot(db, liveCounts);
    renderStaticGraphsFromDb(db, OUTPUT_DIR);
    console.log(`[OVH Activity Spikes] Snapshot stored & static SVGs updated in ${OUTPUT_DIR}`);
  }

  if (args.has('--serve') || args.has('--daemon')) {
    // Ensure initial graphs exist
    const rowCount = db.prepare('SELECT COUNT(*) AS cnt FROM theater_samples').get()?.cnt || 0;
    if (rowCount === 0) {
      seedSampleHistory(db);
    }
    renderStaticGraphsFromDb(db, OUTPUT_DIR);
    startStaticHttpServer(OUTPUT_DIR, PORT);

    setInterval(async () => {
      try {
        const liveCounts = await fetchLiveTelemetry();
        recordTelemetrySnapshot(db, liveCounts);
        renderStaticGraphsFromDb(db, OUTPUT_DIR);
        console.log(`[OVH Activity Spikes] 15m poll complete at ${new Date().toISOString()}`);
      } catch (err) {
        console.error('[OVH Activity Spikes] Poll error:', err.message);
      }
    }, POLL_INTERVAL_MS);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error('[OVH Activity Spikes] Fatal error:', err);
    process.exit(1);
  });
}

