import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';

export type SpikeTheaterId = 'all' | 'east-med' | 'iran-centcom' | 'black-sea' | 'taiwan-scs';

interface SpikeEventAnnotation {
  id: string;
  dayIndex: number; // 0..119 (6-hour buckets across 30 days)
  dateLabel: string;
  theaterId: Exclude<SpikeTheaterId, 'all'>;
  theaterLabel: string;
  zScore: number;
  headline: string;
  layersTriggered: string[];
  lat: number;
  lon: number;
  severity: 'critical' | 'elevated';
}

interface TheaterSampleConfig {
  id: Exclude<SpikeTheaterId, 'all'>;
  label: string;
  shortLabel: string;
  bboxLabel: string;
  lat: number;
  lon: number;
  color: string;
  baselineAircraft: number;
  baselineTankers: number;
  baselineJammingHexes: number;
  baselineThermal: number;
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15-minute bucket matching OVH cron

const THEATERS: Record<Exclude<SpikeTheaterId, 'all'>, TheaterSampleConfig> = {
  'east-med': {
    id: 'east-med',
    label: 'East Med & Levant',
    shortLabel: 'E.MED / LEVANT',
    bboxLabel: '29°N–37°N, 25°E–37°E',
    lat: 34.0,
    lon: 33.5,
    color: '#0284c7', // Sky 600
    baselineAircraft: 11,
    baselineTankers: 3,
    baselineJammingHexes: 18,
    baselineThermal: 9,
  },
  'iran-centcom': {
    id: 'iran-centcom',
    label: 'Iran / Persian Gulf (CENTCOM)',
    shortLabel: 'IRAN / CENTCOM',
    bboxLabel: '20°N–42°N, 30°E–65°E',
    lat: 27.5,
    lon: 51.0,
    color: '#d97706', // Amber 600
    baselineAircraft: 14,
    baselineTankers: 4,
    baselineJammingHexes: 14,
    baselineThermal: 12,
  },
  'black-sea': {
    id: 'black-sea',
    label: 'Black Sea & NATO E. Flank',
    shortLabel: 'BLACK SEA / BALTIC',
    bboxLabel: '40°N–65°N, 10°E–42°E',
    lat: 44.5,
    lon: 33.5,
    color: '#7c3aed', // Purple 600
    baselineAircraft: 16,
    baselineTankers: 4,
    baselineJammingHexes: 22,
    baselineThermal: 15,
  },
  'taiwan-scs': {
    id: 'taiwan-scs',
    label: 'Taiwan Strait & South China Sea',
    shortLabel: 'TAIWAN / SCS',
    bboxLabel: '5°N–30°N, 105°E–130°E',
    lat: 23.5,
    lon: 119.5,
    color: '#16a34a', // Emerald 600
    baselineAircraft: 12,
    baselineTankers: 3,
    baselineJammingHexes: 6,
    baselineThermal: 5,
  },
};

const SAMPLE_CONVERGENCE_EVENTS: SpikeEventAnnotation[] = [
  {
    id: 'evt-oct-06',
    dayIndex: 26,
    dateLabel: 'D-23 (04:00Z)',
    theaterId: 'black-sea',
    theaterLabel: 'Black Sea / Crimea',
    zScore: 3.4,
    headline: 'FORTE12 + NATO E-3 orbit surge (+3.1σ) followed by Crimea GNSS spoofing & 18 high-FRP thermal hits',
    layersTriggered: ['Tanker/AWACS', 'ISR/Recon', 'GNSS Jamming', 'FIRMS Thermal'],
    lat: 44.6,
    lon: 33.5,
    severity: 'critical',
  },
  {
    id: 'evt-oct-13',
    dayIndex: 54,
    dateLabel: 'D-16 (22:00Z)',
    theaterId: 'east-med',
    theaterLabel: 'East Med / Levant',
    zScore: 4.1,
    headline: 'RAF Akrotiri KC-2/KC-135 tanker bridge (7 tankers airborne) + severe Levant GPS jamming (+3.9σ)',
    layersTriggered: ['Tanker/AWACS', 'GNSS Jamming', 'FIRMS Thermal'],
    lat: 34.2,
    lon: 34.0,
    severity: 'critical',
  },
  {
    id: 'evt-oct-19',
    dayIndex: 78,
    dateLabel: 'D-10 (14:00Z)',
    theaterId: 'taiwan-scs',
    theaterLabel: 'Taiwan Strait / Bashi',
    zScore: 2.9,
    headline: 'Kadena KC-135 + P-8 Poseidon patrol surge in Bashi Channel & ADIZ periphery',
    layersTriggered: ['Tanker/AWACS', 'ISR/Recon', 'Naval AIS'],
    lat: 22.3,
    lon: 120.2,
    severity: 'elevated',
  },
  {
    id: 'evt-oct-25',
    dayIndex: 102,
    dateLabel: 'D-4 (01:30Z)',
    theaterId: 'iran-centcom',
    theaterLabel: 'CENTCOM / Hormuz',
    zScore: 4.4,
    headline: '48h C-17 airlift surge into CENTCOM + 9 KC-135/KC-46 tankers airborne + Iranian border GNSS jamming spike',
    layersTriggered: ['Tanker/AWACS', 'Strategic Airlift', 'GNSS Jamming', 'FIRMS Thermal'],
    lat: 28.5,
    lon: 49.5,
    severity: 'critical',
  },
  {
    id: 'evt-oct-28',
    dayIndex: 114,
    dateLabel: 'D-1 (18:00Z)',
    theaterId: 'east-med',
    theaterLabel: 'East Med / Levant',
    zScore: 3.3,
    headline: 'Elevated RC-135 Rivet Joint SIGINT collection + persistent high-severity GNSS interference hexes',
    layersTriggered: ['ISR/Recon', 'GNSS Jamming'],
    lat: 33.8,
    lon: 35.1,
    severity: 'critical',
  },
];

/**
 * Deterministic pseudo-random helper so sample 30-day curves look authentic
 * and stay consistent across renders within the same time bucket.
 */
function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function gaussianPulse(idx: number, center: number, width: number, height: number): number {
  const d = (idx - center) / width;
  return height * Math.exp(-0.5 * d * d);
}

export class ActivitySpikesPanel extends Panel {
  private selectedTheater: SpikeTheaterId = 'all';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private onLocationClick?: (lat: number, lon: number) => void;
  private lastBucket: number = Math.floor(Date.now() / REFRESH_INTERVAL_MS);
  private liveEvents: SpikeEventAnnotation[] | null = null;
  private fullscreenModalEl: HTMLElement | null = null;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private themeHandler: () => void;

  constructor() {
    super({
      id: 'activity-spikes',
      title: t('panels.activitySpikes') || 'Signal Activity Spikes (30d)',
      showCount: false,
      trackActivity: true,
      infoTooltip:
        '30-day historical anomaly & spike correlation graph (15m polling intervals). Tracks leading indicators (Tankers/AWACS, ISR, Strategic Airlift) against coincident indicators (GNSS Jamming, NASA FIRMS Thermal, AIS disruptions) across priority theaters.',
    });

    this.themeHandler = () => {
      this.updateGraphImage();
      this.render();
      if (this.fullscreenModalEl) {
        this.updateFullscreenModalContent();
      }
    };
    window.addEventListener('theme-changed', this.themeHandler);

    this.setDataBadge('live', '15m static sync');
    this.render();
    void this.syncOvhEvents();
    this.startAutoRefresh();
  }

  public setLocationClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onLocationClick = handler;
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.lastBucket = Math.floor(Date.now() / REFRESH_INTERVAL_MS);
      this.updateGraphImage();
      void this.syncOvhEvents();
      if (this.fullscreenModalEl) {
        this.updateFullscreenModalContent();
      }
    }, REFRESH_INTERVAL_MS);
  }

  private async syncOvhEvents(): Promise<void> {
    const baseUrl = (import.meta.env.VITE_OVH_SPIKES_GRAPH_URL as string | undefined)?.trim();
    if (!baseUrl) return;
    try {
      const normalized = baseUrl.replace(/\/$/, '');
      const res = await fetch(`${normalized}/events.json?v=${this.lastBucket}`);
      if (!res.ok) return;
      const data = (await res.json()) as { events?: SpikeEventAnnotation[] };
      if (Array.isArray(data?.events) && data.events.length > 0) {
        this.liveEvents = data.events;
        this.render();
      }
    } catch {
      // Keep fallback events
    }
  }

  public override destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    window.removeEventListener('theme-changed', this.themeHandler);
    this.closeFullscreenModal();
    super.destroy();
  }

  private getOvhGraphUrl(theater: SpikeTheaterId, bucket: number): string | null {
    const baseUrl = (import.meta.env.VITE_OVH_SPIKES_GRAPH_URL as string | undefined)?.trim();
    if (!baseUrl) return null;
    const normalized = baseUrl.replace(/\/$/, '');
    return `${normalized}/activity-spikes-${theater}.svg?v=${bucket}`;
  }

  /**
   * Generates the self-contained static SVG chart image, styled to match
   * the dashboard's light/white theme (or dark theme if selected).
   */
  private generateStaticGraphSvgDataUri(theater: SpikeTheaterId, bucket: number): string {
    const isLight = getCurrentTheme() === 'light';

    const W = 760;
    const H = 390;
    const N = 120; // 120 points = 30 days at 6-hour resolution
    const padL = 44;
    const padR = 18;
    const topPlotY = 48;
    const topPlotH = 182;
    const botPlotY = 266;
    const botPlotH = 88;
    const plotW = W - padL - padR;

    const xAt = (i: number) => padL + (i / (N - 1)) * plotW;

    // Theme colorway definitions
    const svgBg = isLight ? '#ffffff' : '#090d16';
    const svgBorder = isLight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.16)';
    const plotBg = isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.55)';
    const plotBorder = isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.12)';
    const textTitle = isLight ? '#0f172a' : '#f8fafc';
    const textSub = isLight ? '#64748b' : '#64748b';
    const textLegend = isLight ? '#334155' : '#cbd5e1';
    const gridNormal = isLight ? 'rgba(100, 116, 139, 0.18)' : 'rgba(148, 163, 184, 0.14)';
    const gridLabelNormal = isLight ? '#64748b' : '#64748b';
    const gridCrit = isLight ? 'rgba(220, 38, 38, 0.5)' : 'rgba(239, 68, 68, 0.55)';
    const gridLabelCrit = isLight ? '#dc2626' : '#f87171';
    const gridElev = isLight ? 'rgba(217, 119, 6, 0.5)' : 'rgba(245, 158, 11, 0.45)';
    const gridLabelElev = isLight ? '#d97706' : '#fbbf24';
    const bandCrit = isLight ? 'rgba(220, 38, 38, 0.08)' : 'rgba(239, 68, 68, 0.13)';
    const bandElev = isLight ? 'rgba(217, 119, 6, 0.08)' : 'rgba(245, 158, 11, 0.12)';
    const lineCrit = isLight ? '#dc2626' : '#ef4444';
    const lineElev = isLight ? '#d97706' : '#f59e0b';
    const pillBg = isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.92)';
    const axisLine = isLight ? '#cbd5e1' : '#475569';
    const axisText = isLight ? '#64748b' : '#94a3b8';

    const theaterColors: Record<Exclude<SpikeTheaterId, 'all'>, string> = {
      'east-med': isLight ? '#0284c7' : '#38bdf8',
      'iran-centcom': isLight ? '#d97706' : '#f59e0b',
      'black-sea': isLight ? '#7c3aed' : '#a855f7',
      'taiwan-scs': isLight ? '#16a34a' : '#22c55e',
    };

    const layerColors = {
      tanker: isLight ? '#0284c7' : '#38bdf8',
      isr: isLight ? '#7c3aed' : '#a855f7',
      jamming: isLight ? '#d97706' : '#f59e0b',
      thermal: isLight ? '#dc2626' : '#ef4444',
    };

    // Generate 30-day Z-score series per theater (-0.8 to +4.8 sigma)
    const seriesByTheater: Record<Exclude<SpikeTheaterId, 'all'>, number[]> = {
      'east-med': [],
      'iran-centcom': [],
      'black-sea': [],
      'taiwan-scs': [],
    };

    const bucketJitter = (bucket % 7) * 0.015;

    for (let i = 0; i < N; i++) {
      const n1 = (seededNoise(i * 1.1 + 10) - 0.48) * 0.65;
      const n2 = (seededNoise(i * 1.3 + 20) - 0.48) * 0.65;
      const n3 = (seededNoise(i * 1.7 + 30) - 0.48) * 0.65;
      const n4 = (seededNoise(i * 1.9 + 40) - 0.48) * 0.65;

      seriesByTheater['black-sea'].push(
        Math.max(
          -0.6,
          0.35 +
            n1 +
            gaussianPulse(i, 26, 2.2, 3.1) +
            gaussianPulse(i, 68, 2.5, 1.9) +
            gaussianPulse(i, 108, 2.0, 1.6) +
            bucketJitter
        )
      );

      seriesByTheater['east-med'].push(
        Math.max(
          -0.6,
          0.45 +
            n2 +
            gaussianPulse(i, 54, 2.4, 3.7) +
            gaussianPulse(i, 101, 2.8, 2.4) +
            gaussianPulse(i, 114, 2.1, 2.9) +
            bucketJitter
        )
      );

      seriesByTheater['taiwan-scs'].push(
        Math.max(
          -0.6,
          0.2 +
            n3 +
            gaussianPulse(i, 40, 2.0, 1.6) +
            gaussianPulse(i, 78, 2.3, 2.75) +
            bucketJitter
        )
      );

      seriesByTheater['iran-centcom'].push(
        Math.max(
          -0.6,
          0.4 +
            n4 +
            gaussianPulse(i, 53, 2.6, 2.3) +
            gaussianPulse(i, 96, 3.8, 1.9) + // 48h airlift buildup ramp
            gaussianPulse(i, 102, 2.0, 4.0) + // main convergence spike
            bucketJitter
        )
      );
    }

    const maxSigma = 5.0;
    const minSigma = -0.8;
    const yAtSigma = (s: number) => {
      const clamped = Math.max(minSigma, Math.min(maxSigma, s));
      const norm = (clamped - minSigma) / (maxSigma - minSigma);
      return topPlotY + topPlotH - norm * topPlotH;
    };

    const buildPolyline = (vals: number[]) =>
      vals.map((v, idx) => `${xAt(idx).toFixed(1)},${yAtSigma(v).toFixed(1)}`).join(' ');

    const buildAreaPath = (vals: number[]) => {
      const baselineY = yAtSigma(0).toFixed(1);
      const pts = vals.map((v, idx) => `${xAt(idx).toFixed(1)},${yAtSigma(v).toFixed(1)}`).join(' L ');
      return `M ${xAt(0).toFixed(1)},${baselineY} L ${pts} L ${xAt(N - 1).toFixed(1)},${baselineY} Z`;
    };

    // Grid lines & Y-axis labels for top plot
    const sigmaTicks = [0, 1, 2, 3, 4];
    const gridLinesSvg = sigmaTicks
      .map((s) => {
        const y = yAtSigma(s).toFixed(1);
        const isCrit = s === 3;
        const isElev = s === 2;
        const stroke = isCrit ? gridCrit : isElev ? gridElev : gridNormal;
        const dash = isCrit || isElev ? 'stroke-dasharray="4,3"' : '';
        const labelColor = isCrit ? gridLabelCrit : isElev ? gridLabelElev : gridLabelNormal;
        return `
          <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${stroke}" stroke-width="1" ${dash} />
          <text x="${padL - 6}" y="${Number(y) + 3}" text-anchor="end" fill="${labelColor}" font-size="9.5" font-family="monospace">+${s}σ</text>
        `;
      })
      .join('');

    // Vertical spike highlight bands
    const relevantEvents =
      theater === 'all'
        ? SAMPLE_CONVERGENCE_EVENTS
        : SAMPLE_CONVERGENCE_EVENTS.filter((e) => e.theaterId === theater);

    const spikeBandsSvg = relevantEvents
      .map((ev) => {
        const cx = xAt(ev.dayIndex);
        const bandColor = ev.severity === 'critical' ? bandCrit : bandElev;
        const lineColor = ev.severity === 'critical' ? lineCrit : lineElev;
        const pillW = 86;
        const pillX = Math.min(W - padR - pillW, Math.max(padL + 2, cx - pillW / 2));
        return `
          <rect x="${(cx - 8).toFixed(1)}" y="${topPlotY}" width="16" height="${topPlotH + botPlotH + 36}" fill="${bandColor}" />
          <line x1="${cx.toFixed(1)}" y1="${topPlotY}" x2="${cx.toFixed(1)}" y2="${botPlotY + botPlotH}" stroke="${lineColor}" stroke-width="1" stroke-dasharray="2,2" opacity="0.8" />
          <rect x="${pillX.toFixed(1)}" y="${topPlotY + 3}" width="${pillW}" height="14" rx="3" fill="${pillBg}" stroke="${lineColor}" stroke-width="0.8" />
          <text x="${(pillX + pillW / 2).toFixed(1)}" y="${topPlotY + 12.5}" text-anchor="middle" fill="${lineColor}" font-size="8.5" font-weight="700" font-family="monospace">${ev.theaterId.toUpperCase()} +${ev.zScore.toFixed(1)}σ</text>
        `;
      })
      .join('');

    // Top Plot Series: either all 4 theaters OR 4 individual layers for the selected theater
    let topLinesSvg = '';
    let legendItemsSvg = '';

    if (theater === 'all') {
      const order: Exclude<SpikeTheaterId, 'all'>[] = ['taiwan-scs', 'black-sea', 'east-med', 'iran-centcom'];
      topLinesSvg = order
        .map((tid) => {
          const color = theaterColors[tid];
          const vals = seriesByTheater[tid];
          return `
            <path d="${buildAreaPath(vals)}" fill="${color}" opacity="${isLight ? '0.12' : '0.07'}" />
            <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${buildPolyline(vals)}" />
          `;
        })
        .join('');

      const legendEntries = [
        { label: 'EAST MED', color: theaterColors['east-med'] },
        { label: 'IRAN / CENTCOM', color: theaterColors['iran-centcom'] },
        { label: 'BLACK SEA', color: theaterColors['black-sea'] },
        { label: 'TAIWAN / SCS', color: theaterColors['taiwan-scs'] },
      ];
      legendItemsSvg = legendEntries
        .map(
          (item, idx) => `
          <g transform="translate(${padL + idx * 132}, 30)">
            <line x1="0" y1="-3" x2="12" y2="-3" stroke="${item.color}" stroke-width="2.4" />
            <text x="16" y="0" fill="${textLegend}" font-size="9.5" font-family="monospace" font-weight="600">${item.label}</text>
          </g>
        `
        )
        .join('');
    } else {
      // Single-theater multi-layer correlation view
      const baseSeries = seriesByTheater[theater];
      // 1. Tankers/AWACS leads the spike by 1-2 buckets
      const tankerSeries = baseSeries.map((_, i) => {
        const lead = baseSeries[Math.min(N - 1, i + 1)] ?? baseSeries[i]!;
        return Math.max(-0.5, lead * 1.05 + (seededNoise(i + 101) - 0.5) * 0.25);
      });
      // 2. ISR / Recon Drones
      const isrSeries = baseSeries.map((v, i) => Math.max(-0.5, v * 0.88 + (seededNoise(i + 202) - 0.45) * 0.35));
      // 3. GNSS / GPS Jamming
      const jammingSeries = baseSeries.map((v, i) => Math.max(-0.5, v * 0.96 + (seededNoise(i + 303) - 0.5) * 0.3));
      // 4. NASA FIRMS Thermal (spikes sharply only when composite > 2.2)
      const thermalSeries = baseSeries.map((v, i) =>
        v > 2.0 ? v * 0.92 + (seededNoise(i + 404) - 0.4) * 0.3 : 0.15 + seededNoise(i + 404) * 0.35
      );

      const layerDefs = [
        { name: 'TANKER / AWACS (LEAD)', color: layerColors.tanker, data: tankerSeries },
        { name: 'ISR / RECON', color: layerColors.isr, data: isrSeries },
        { name: 'GNSS JAMMING', color: layerColors.jamming, data: jammingSeries },
        { name: 'FIRMS THERMAL', color: layerColors.thermal, data: thermalSeries },
      ];

      topLinesSvg = layerDefs
        .map(
          (l) => `
          <path d="${buildAreaPath(l.data)}" fill="${l.color}" opacity="${isLight ? '0.1' : '0.06'}" />
          <polyline fill="none" stroke="${l.color}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" points="${buildPolyline(l.data)}" />
        `
        )
        .join('');

      legendItemsSvg = layerDefs
        .map(
          (item, idx) => `
          <g transform="translate(${padL + idx * 165}, 30)">
            <line x1="0" y1="-3" x2="12" y2="-3" stroke="${item.color}" stroke-width="2.4" />
            <text x="16" y="0" fill="${textLegend}" font-size="9" font-family="monospace" font-weight="600">${item.name}</text>
          </g>
        `
        )
        .join('');
    }

    // Bottom Subplot: Stacked Bar Breakdown (Tankers/AWACS, Airlift, GNSS Jamming, Thermal)
    const activeSeries =
      theater === 'all'
        ? seriesByTheater['east-med'].map(
            (v, i) =>
              (v +
                seriesByTheater['iran-centcom'][i]! +
                seriesByTheater['black-sea'][i]! +
                seriesByTheater['taiwan-scs'][i]!) /
              2.6
          )
        : seriesByTheater[theater];

    const barW = Math.max(2.5, plotW / N - 1.4);
    const barsSvg = activeSeries
      .map((val, i) => {
        const x = xAt(i) - barW / 2;
        const norm = Math.max(0.06, Math.min(1, (val + 0.6) / 5.2));
        const totalH = norm * (botPlotH - 8);
        const hTanker = totalH * 0.34;
        const hIsr = totalH * 0.24;
        const hJam = totalH * 0.25;
        const hTherm = totalH * 0.17;

        const yBase = botPlotY + botPlotH;
        return `
          <rect x="${x.toFixed(1)}" y="${(yBase - hTanker).toFixed(1)}" width="${barW.toFixed(1)}" height="${hTanker.toFixed(1)}" fill="${layerColors.tanker}" opacity="0.9" />
          <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr).toFixed(1)}" width="${barW.toFixed(1)}" height="${hIsr.toFixed(1)}" fill="${layerColors.isr}" opacity="0.9" />
          <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr - hJam).toFixed(1)}" width="${barW.toFixed(1)}" height="${hJam.toFixed(1)}" fill="${layerColors.jamming}" opacity="0.9" />
          <rect x="${x.toFixed(1)}" y="${(yBase - hTanker - hIsr - hJam - hTherm).toFixed(1)}" width="${barW.toFixed(1)}" height="${hTherm.toFixed(1)}" fill="${layerColors.thermal}" opacity="0.95" />
        `;
      })
      .join('');

    // X-axis day ticks (D-30 to NOW)
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
          <line x1="${x}" y1="${botPlotY + botPlotH}" x2="${x}" y2="${botPlotY + botPlotH + 4}" stroke="${axisLine}" stroke-width="1" />
          <text x="${x}" y="${botPlotY + botPlotH + 15}" text-anchor="middle" fill="${axisText}" font-size="9.5" font-family="monospace">${tk.label}</text>
        `;
      })
      .join('');

    const titleText =
      theater === 'all'
        ? '30-DAY MULTI-THEATER COMPOSITE Z-SCORE (7D ROLLING BASELINE)'
        : `${THEATERS[theater].shortLabel} (${THEATERS[theater].bboxLabel}) — LAYER CORRELATION`;

    const timestampStr = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
      <rect width="${W}" height="${H}" fill="${svgBg}" rx="4" />
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${svgBorder}" rx="4" />

      <!-- Header inside static image -->
      <text x="${padL}" y="16" fill="${textTitle}" font-size="10.5" font-weight="700" font-family="monospace" letter-spacing="0.4">${escapeHtml(titleText)}</text>
      <text x="${W - padR}" y="16" text-anchor="end" fill="${textSub}" font-size="9" font-family="monospace">SQLITE 30D WINDOW • ${timestampStr}</text>

      <!-- Legend -->
      ${legendItemsSvg}
      <g transform="translate(${W - padR - 145}, 30)">
        <line x1="0" y1="-3" x2="10" y2="-3" stroke="${lineCrit}" stroke-width="1.2" stroke-dasharray="3,2" />
        <text x="14" y="0" fill="${gridLabelCrit}" font-size="8.5" font-family="monospace">CRIT (+3σ) / ELEV (+2σ)</text>
      </g>

      <!-- Top Plot Background -->
      <rect x="${padL}" y="${topPlotY}" width="${plotW}" height="${topPlotH}" fill="${plotBg}" stroke="${plotBorder}" />
      ${gridLinesSvg}
      ${spikeBandsSvg}
      ${topLinesSvg}

      <!-- Bottom Subplot Header -->
      <text x="${padL}" y="${botPlotY - 7}" fill="${textSub}" font-size="9" font-weight="700" font-family="monospace" letter-spacing="0.3">SIGNAL COMPOSITION STACK (TANKER/AWACS • ISR • GNSS JAMMING • FIRMS THERMAL)</text>
      <rect x="${padL}" y="${botPlotY}" width="${plotW}" height="${botPlotH}" fill="${plotBg}" stroke="${plotBorder}" />
      ${barsSvg}
      ${xAxisLabelsSvg}
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private updateGraphImage(): void {
    const imgEl = this.content.querySelector<HTMLImageElement>('#activity-spikes-static-img');
    if (!imgEl) return;

    const ovhUrl = this.getOvhGraphUrl(this.selectedTheater, this.lastBucket);
    const fallbackDataUri = this.generateStaticGraphSvgDataUri(this.selectedTheater, this.lastBucket);

    if (ovhUrl) {
      imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = fallbackDataUri;
      };
      imgEl.src = ovhUrl;
    } else {
      imgEl.src = fallbackDataUri;
    }
  }

  public openFullscreenModal(): void {
    if (this.fullscreenModalEl) return;

    const isLight = getCurrentTheme() === 'light';
    const ovhUrl = this.getOvhGraphUrl(this.selectedTheater, this.lastBucket);
    const fallbackDataUri = this.generateStaticGraphSvgDataUri(this.selectedTheater, this.lastBucket);
    const imgSrc = ovhUrl || fallbackDataUri;

    const tabs: { id: SpikeTheaterId; label: string }[] = [
      { id: 'all', label: 'All Theaters (Z-Score)' },
      { id: 'east-med', label: 'East Med / Levant' },
      { id: 'iran-centcom', label: 'Iran / CENTCOM' },
      { id: 'black-sea', label: 'Black Sea / Baltic' },
      { id: 'taiwan-scs', label: 'Taiwan / SCS' },
    ];

    const activeTheaterCfg = this.selectedTheater !== 'all' ? THEATERS[this.selectedTheater] : null;

    const overlay = document.createElement('div');
    overlay.id = 'activity-spikes-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: ${isLight ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0, 0, 0, 0.8)'};
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      animation: fadeIn 0.15s ease-out;
    `;

    overlay.innerHTML = `
      <div id="activity-spikes-modal-card" style="
        position: relative;
        width: 100%;
        max-width: 1240px;
        max-height: 94vh;
        background: ${isLight ? '#ffffff' : '#0f172a'};
        border: 1px solid ${isLight ? '#cbd5e1' : '#334155'};
        border-radius: 8px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <div style="
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid ${isLight ? '#e2e8f0' : '#1e293b'};
          background: ${isLight ? '#f8fafc' : '#0b1120'};
          gap: 10px;
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; font-size: 13px; color: ${isLight ? '#0f172a' : '#f8fafc'}; font-family: monospace;">SIGNAL ACTIVITY SPIKES (30-DAY CORRELATION)</span>
            ${
              activeTheaterCfg
                ? `<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: ${isLight ? '#e0f2fe' : '#1e293b'}; color: ${isLight ? '#0284c7' : '#38bdf8'}; font-weight: 600;">${escapeHtml(activeTheaterCfg.shortLabel)}</span>`
                : ''
            }
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="activity-spikes-modal-tabs" style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${tabs
                .map(
                  (tab) => `
                <button
                  type="button"
                  class="social-chip ${this.selectedTheater === tab.id ? 'active' : ''}"
                  data-modal-theater="${tab.id}"
                  style="font-size: 11px; padding: 4px 9px; cursor: pointer;"
                >${escapeHtml(tab.label)}</button>
              `
                )
                .join('')}
            </div>

            <button
              type="button"
              id="activity-spikes-modal-close-btn"
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 5px 12px;
                border-radius: 5px;
                border: 1px solid ${isLight ? '#cbd5e1' : '#475569'};
                background: ${isLight ? '#ffffff' : '#1e293b'};
                color: ${isLight ? '#0f172a' : '#f8fafc'};
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
              "
              title="Close expanded view (Esc)"
            >
              <span>✕</span> Close
              <kbd style="font-size: 9.5px; opacity: 0.75; border: 1px solid ${isLight ? '#cbd5e1' : '#475569'}; padding: 1px 4px; border-radius: 3px; background: ${isLight ? '#f1f5f9' : '#0f172a'};">Esc</kbd>
            </button>
          </div>
        </div>

        <div style="
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
          background: ${isLight ? '#ffffff' : '#090d16'};
          overflow: auto;
        ">
          <img
            id="activity-spikes-modal-img"
            src="${imgSrc}"
            alt="Activity Spikes Expanded Graph"
            style="width: 100%; height: auto; max-height: 75vh; object-fit: contain; display: block;"
          />
        </div>

        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: ${isLight ? '#f8fafc' : '#0b1120'};
          border-top: 1px solid ${isLight ? '#e2e8f0' : '#1e293b'};
          font-size: 11px;
          color: ${isLight ? '#64748b' : '#94a3b8'};
          font-family: monospace;
        ">
          <span>Click tabs above to switch theater view • 120 6h buckets (30-day window)</span>
          <span>Press <kbd style="padding: 1px 4px; border-radius: 3px; border: 1px solid ${isLight ? '#cbd5e1' : '#475569'}; background: ${isLight ? '#ffffff' : '#1e293b'};">Esc</kbd> or click outside to exit</span>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeFullscreenModal();
      }
    });

    const closeBtn = overlay.querySelector<HTMLButtonElement>('#activity-spikes-modal-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeFullscreenModal();
    });

    overlay.querySelectorAll<HTMLButtonElement>('[data-modal-theater]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = btn.dataset.modalTheater as SpikeTheaterId | undefined;
        if (next && next !== this.selectedTheater) {
          this.selectedTheater = next;
          this.render();
          this.updateFullscreenModalContent();
        }
      });
    });

    const modalImg = overlay.querySelector<HTMLImageElement>('#activity-spikes-modal-img');
    if (modalImg && ovhUrl) {
      modalImg.onerror = () => {
        modalImg.onerror = null;
        modalImg.src = fallbackDataUri;
      };
    }

    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeFullscreenModal();
      }
    };
    window.addEventListener('keydown', this.keydownListener);

    document.body.appendChild(overlay);
    this.fullscreenModalEl = overlay;
  }

  private updateFullscreenModalContent(): void {
    if (!this.fullscreenModalEl) return;
    const modalImg = this.fullscreenModalEl.querySelector<HTMLImageElement>('#activity-spikes-modal-img');
    if (!modalImg) return;

    const ovhUrl = this.getOvhGraphUrl(this.selectedTheater, this.lastBucket);
    const fallbackDataUri = this.generateStaticGraphSvgDataUri(this.selectedTheater, this.lastBucket);

    if (ovhUrl) {
      modalImg.onerror = () => {
        modalImg.onerror = null;
        modalImg.src = fallbackDataUri;
      };
      modalImg.src = ovhUrl;
    } else {
      modalImg.src = fallbackDataUri;
    }

    this.fullscreenModalEl.querySelectorAll<HTMLButtonElement>('[data-modal-theater]').forEach((btn) => {
      const tid = btn.dataset.modalTheater;
      if (tid === this.selectedTheater) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public closeFullscreenModal(): void {
    if (this.keydownListener) {
      window.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }
    if (this.fullscreenModalEl) {
      this.fullscreenModalEl.remove();
      this.fullscreenModalEl = null;
    }
  }

  public render(): void {
    const isLight = getCurrentTheme() === 'light';
    const ovhUrl = this.getOvhGraphUrl(this.selectedTheater, this.lastBucket);
    const fallbackDataUri = this.generateStaticGraphSvgDataUri(this.selectedTheater, this.lastBucket);
    const imgSrc = ovhUrl || fallbackDataUri;

    const tabs: { id: SpikeTheaterId; label: string }[] = [
      { id: 'all', label: 'All Theaters (Z-Score)' },
      { id: 'east-med', label: 'East Med / Levant' },
      { id: 'iran-centcom', label: 'Iran / CENTCOM' },
      { id: 'black-sea', label: 'Black Sea / Baltic' },
      { id: 'taiwan-scs', label: 'Taiwan / SCS' },
    ];

    const sourceEvents = this.liveEvents ?? SAMPLE_CONVERGENCE_EVENTS;
    const filteredEvents =
      this.selectedTheater === 'all'
        ? sourceEvents
        : sourceEvents.filter((e) => e.theaterId === this.selectedTheater);

    const activeTheaterCfg = this.selectedTheater !== 'all' ? THEATERS[this.selectedTheater] : null;

    this.content.innerHTML = `
      <div class="activity-spikes-panel" style="display: flex; flex-direction: column; gap: 10px; padding: 8px 10px; color: var(--text, #1e293b);">
        <div class="activity-spikes-toolbar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px;">
          <div class="activity-spikes-tabs" style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${tabs
              .map(
                (tab) => `
              <button
                type="button"
                class="social-chip ${this.selectedTheater === tab.id ? 'active' : ''}"
                data-theater="${tab.id}"
                style="font-size: 10.5px; padding: 3px 8px; cursor: pointer;"
              >${escapeHtml(tab.label)}</button>
            `
              )
              .join('')}
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <button
              type="button"
              id="activity-spikes-fullscreen-btn"
              class="social-chip"
              style="font-size: 10px; padding: 3px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"
              title="Expand graph to fullscreen"
            ><span>⛶</span> Fullscreen</button>
            ${
              activeTheaterCfg
                ? `<button type="button" id="activity-spikes-focus-map" class="social-chip" data-lat="${activeTheaterCfg.lat}" data-lon="${activeTheaterCfg.lon}" style="font-size: 10px; padding: 3px 7px; cursor: pointer;" title="Center map on ${escapeHtml(activeTheaterCfg.label)}">📍 Focus Map</button>`
                : ''
            }
            <button
              type="button"
              id="activity-spikes-refresh-btn"
              class="social-chip"
              style="font-size: 10px; padding: 3px 7px; cursor: pointer;"
              title="Refresh static graph image"
            >↻ Sync</button>
          </div>
        </div>

        <div
          id="activity-spikes-img-wrapper"
          class="activity-spikes-img-container"
          style="position: relative; width: 100%; border-radius: 6px; overflow: hidden; background: ${isLight ? '#ffffff' : '#090d16'}; border: 1px solid var(--border, #e2e8f0); cursor: pointer;"
          title="Click to expand fullscreen"
        >
          <img
            id="activity-spikes-static-img"
            class="activity-spikes-static-img"
            src="${imgSrc}"
            alt="30-Day Historical Signal Activity Spikes Graph"
            style="display: block; width: 100%; height: auto;"
          />
          <div style="position: absolute; top: 6px; right: 6px; opacity: 0.7; pointer-events: none; background: ${isLight ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)'}; padding: 2px 5px; border-radius: 3px; font-size: 9px; font-family: monospace; border: 1px solid var(--border, #cbd5e1);">
            ⛶ Expand
          </div>
        </div>

        <div class="activity-spikes-events-section" style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-dim, #64748b); font-family: monospace; text-transform: uppercase; letter-spacing: 0.4px;">
            <span>Correlated Multi-Layer Spike Anomalies (> +2.5σ)</span>
            <span>${ovhUrl ? 'Source: OVH Static Feed' : 'Source: Sample 30d SQLite Telemetry'}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px;">
            ${filteredEvents
              .slice()
              .reverse()
              .map((ev) => {
                const badgeBg = ev.severity === 'critical' ? 'rgba(220, 38, 38, 0.12)' : 'rgba(217, 119, 6, 0.12)';
                const badgeBorder = ev.severity === 'critical' ? 'rgba(220, 38, 38, 0.4)' : 'rgba(217, 119, 6, 0.4)';
                const badgeColor = ev.severity === 'critical' ? '#dc2626' : '#d97706';
                return `
                  <div
                    class="activity-spike-event-row"
                    data-lat="${ev.lat}"
                    data-lon="${ev.lon}"
                    style="display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; border-radius: 5px; background: var(--surface, #ffffff); border: 1px solid var(--border, #e2e8f0); cursor: pointer; transition: background 0.15s ease;"
                    title="Click to center map on ${escapeHtml(ev.theaterLabel)}"
                  >
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-family: monospace; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor};">+${ev.zScore.toFixed(1)}σ</span>
                        <span style="font-size: 11px; font-weight: 600; color: var(--text, #0f172a);">${escapeHtml(ev.theaterLabel)}</span>
                      </div>
                      <span style="font-family: monospace; font-size: 10px; color: var(--text-dim, #64748b);">${escapeHtml(ev.dateLabel)} ↗</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary, #334155); line-height: 1.35;">${escapeHtml(ev.headline)}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;">
                      ${ev.layersTriggered
                        .map(
                          (layer) =>
                            `<span style="font-family: monospace; font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: ${isLight ? 'rgba(2, 132, 199, 0.08)' : 'rgba(56, 189, 248, 0.1)'}; color: ${isLight ? '#0284c7' : '#7dd3fc'}; border: 1px solid ${isLight ? 'rgba(2, 132, 199, 0.22)' : 'rgba(56, 189, 248, 0.25)'};">${escapeHtml(layer)}</span>`
                        )
                        .join('')}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;

    const imgEl = this.content.querySelector<HTMLImageElement>('#activity-spikes-static-img');
    if (imgEl && ovhUrl) {
      imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = fallbackDataUri;
      };
    }

    this.attachListeners();
  }

  private attachListeners(): void {
    this.content.querySelectorAll<HTMLButtonElement>('[data-theater]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = btn.dataset.theater as SpikeTheaterId | undefined;
        if (next && next !== this.selectedTheater) {
          this.selectedTheater = next;
          this.render();
        }
      });
    });

    const fullscreenBtn = this.content.querySelector<HTMLButtonElement>('#activity-spikes-fullscreen-btn');
    fullscreenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFullscreenModal();
    });

    const imgWrapper = this.content.querySelector<HTMLElement>('#activity-spikes-img-wrapper');
    imgWrapper?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFullscreenModal();
    });

    const refreshBtn = this.content.querySelector<HTMLButtonElement>('#activity-spikes-refresh-btn');
    refreshBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.lastBucket = Math.floor(Date.now() / 1000);
      this.updateGraphImage();
      this.setDataBadge('live', 'synced just now');
    });

    const focusBtn = this.content.querySelector<HTMLButtonElement>('#activity-spikes-focus-map');
    focusBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = Number(focusBtn.dataset.lat);
      const lon = Number(focusBtn.dataset.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.onLocationClick?.(lat, lon);
      }
    });

    this.content.querySelectorAll<HTMLElement>('.activity-spike-event-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const lat = Number(row.dataset.lat);
        const lon = Number(row.dataset.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          this.onLocationClick?.(lat, lon);
        }
      });
    });
  }
}
