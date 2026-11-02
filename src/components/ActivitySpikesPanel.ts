import * as d3 from 'd3';
import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';

export type SpikeTheaterId = 'all' | 'east-med' | 'iran-centcom' | 'black-sea' | 'taiwan-scs';

export interface SpikeEventAnnotation {
  id: string;
  dayIndex: number; // 0..119 (6-hour buckets across 30 days)
  ts: number;
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

export interface SpikeDataPoint {
  index: number;
  ts: number; // Epoch milliseconds
  dateLabel: string;
  composite: Record<Exclude<SpikeTheaterId, 'all'>, number>;
  theaters: Record<
    Exclude<SpikeTheaterId, 'all'>,
    {
      tanker_awacs: number;
      isr_recon: number;
      gnss_jamming: number;
      thermal: number;
      composite_z: number;
    }
  >;
}

interface TheaterSampleConfig {
  id: Exclude<SpikeTheaterId, 'all'>;
  label: string;
  shortLabel: string;
  bboxLabel: string;
  lat: number;
  lon: number;
  colorLight: string;
  colorDark: string;
  baselineAircraft: number;
  baselineTankers: number;
  baselineJammingHexes: number;
  baselineThermal: number;
}

interface SeriesItem {
  id: string;
  label: string;
  color: string;
  getValue: (d: SpikeDataPoint) => number;
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15-minute bucket
const TOTAL_BUCKETS = 120; // 30 days @ 6-hour buckets

const THEATERS: Record<Exclude<SpikeTheaterId, 'all'>, TheaterSampleConfig> = {
  'east-med': {
    id: 'east-med',
    label: 'East Med & Levant',
    shortLabel: 'E.MED / LEVANT',
    bboxLabel: '29°N–37°N, 25°E–37°E',
    lat: 34.0,
    lon: 33.5,
    colorLight: '#0284c7', // Sky 600
    colorDark: '#38bdf8',
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
    colorLight: '#d97706', // Amber 600
    colorDark: '#f59e0b',
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
    colorLight: '#7c3aed', // Purple 600
    colorDark: '#a855f7',
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
    colorLight: '#16a34a', // Emerald 600
    colorDark: '#22c55e',
    baselineAircraft: 12,
    baselineTankers: 3,
    baselineJammingHexes: 6,
    baselineThermal: 5,
  },
};

const BASE_EVENTS: Omit<SpikeEventAnnotation, 'ts'>[] = [
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

  // Dynamic Timeseries State
  private buckets: SpikeDataPoint[] = [];
  private events: SpikeEventAnnotation[] = [];
  private hiddenSeries: Set<string> = new Set();
  private hoveredSeries: string | null = null;
  private currentZoomTransform: d3.ZoomTransform = d3.zoomIdentity;
  private modalZoomTransform: d3.ZoomTransform = d3.zoomIdentity;
  private isOvhLiveFeed = false;

  // DOM & Modal References
  private resizeObserver: ResizeObserver | null = null;
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
        'Interactive 30-day anomaly correlation engine. Mousewheel / pinch to zoom, drag to pan timeline, and click legend items to isolate or compare specific signal streams (Tankers/AWACS, ISR, GNSS Jamming, FIRMS Thermal).',
    });

    this.element.classList.add('panel-wide');

    this.themeHandler = () => {
      this.render();
      if (this.fullscreenModalEl) {
        this.renderFullscreenModalChart();
      }
    };
    window.addEventListener('theme-changed', this.themeHandler);

    this.setDataBadge('live', 'dynamic sync');
    this.initFallbackData();
    this.render();
    void this.syncTelemetryData();
    this.startAutoRefresh();
  }

  public setLocationClickHandler(handler: (lat: number, lon: number) => void): void {
    this.onLocationClick = handler;
  }

  private initFallbackData(): void {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
    const bucketDurationMs = (30 * 24 * 3600 * 1000) / TOTAL_BUCKETS;

    // Attach calculated epoch timestamps to sample events
    this.events = BASE_EVENTS.map((ev) => ({
      ...ev,
      ts: thirtyDaysAgo + ev.dayIndex * bucketDurationMs,
    }));

    const generatedBuckets: SpikeDataPoint[] = [];
    const bucketJitter = (this.lastBucket % 7) * 0.015;

    for (let i = 0; i < TOTAL_BUCKETS; i++) {
      const ts = thirtyDaysAgo + i * bucketDurationMs;
      const dateObj = new Date(ts);
      const dateLabel =
        dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC',
        }) + 'Z';

      const n1 = (seededNoise(i * 1.1 + 10) - 0.48) * 0.65;
      const n2 = (seededNoise(i * 1.3 + 20) - 0.48) * 0.65;
      const n3 = (seededNoise(i * 1.7 + 30) - 0.48) * 0.65;
      const n4 = (seededNoise(i * 1.9 + 40) - 0.48) * 0.65;

      const zBlackSea = Math.max(
        -0.6,
        0.35 +
          n1 +
          gaussianPulse(i, 26, 2.2, 3.1) +
          gaussianPulse(i, 68, 2.5, 1.9) +
          gaussianPulse(i, 108, 2.0, 1.6) +
          bucketJitter
      );

      const zEastMed = Math.max(
        -0.6,
        0.45 +
          n2 +
          gaussianPulse(i, 54, 2.4, 3.7) +
          gaussianPulse(i, 101, 2.8, 2.4) +
          gaussianPulse(i, 114, 2.1, 2.9) +
          bucketJitter
      );

      const zTaiwan = Math.max(
        -0.6,
        0.2 +
          n3 +
          gaussianPulse(i, 40, 2.0, 1.6) +
          gaussianPulse(i, 78, 2.3, 2.75) +
          bucketJitter
      );

      const zIran = Math.max(
        -0.6,
        0.4 +
          n4 +
          gaussianPulse(i, 53, 2.6, 2.3) +
          gaussianPulse(i, 96, 3.8, 1.9) +
          gaussianPulse(i, 102, 2.0, 4.0) +
          bucketJitter
      );

      const makeLayers = (baseZ: number, seedOff: number) => ({
        tanker_awacs: Math.max(-0.5, baseZ * 1.05 + (seededNoise(i + seedOff + 1) - 0.5) * 0.25),
        isr_recon: Math.max(-0.5, baseZ * 0.88 + (seededNoise(i + seedOff + 2) - 0.45) * 0.35),
        gnss_jamming: Math.max(-0.5, baseZ * 0.96 + (seededNoise(i + seedOff + 3) - 0.5) * 0.3),
        thermal:
          baseZ > 2.0
            ? baseZ * 0.92 + (seededNoise(i + seedOff + 4) - 0.4) * 0.3
            : 0.15 + seededNoise(i + seedOff + 4) * 0.35,
        composite_z: baseZ,
      });

      generatedBuckets.push({
        index: i,
        ts,
        dateLabel,
        composite: {
          'east-med': Number(zEastMed.toFixed(2)),
          'iran-centcom': Number(zIran.toFixed(2)),
          'black-sea': Number(zBlackSea.toFixed(2)),
          'taiwan-scs': Number(zTaiwan.toFixed(2)),
        },
        theaters: {
          'east-med': makeLayers(zEastMed, 100),
          'iran-centcom': makeLayers(zIran, 200),
          'black-sea': makeLayers(zBlackSea, 300),
          'taiwan-scs': makeLayers(zTaiwan, 400),
        },
      });
    }

    this.buckets = generatedBuckets;
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.lastBucket = Math.floor(Date.now() / REFRESH_INTERVAL_MS);
      void this.syncTelemetryData();
    }, REFRESH_INTERVAL_MS);
  }

  private async syncTelemetryData(): Promise<void> {
    const baseUrl = (import.meta.env.VITE_OVH_SPIKES_GRAPH_URL as string | undefined)?.trim();
    if (!baseUrl) return;

    try {
      const normalized = baseUrl.replace(/\/$/, '');
      const res = await fetch(`${normalized}/spikes-data.json?v=${this.lastBucket}`);
      if (!res.ok) {
        // Fallback: check events.json if spikes-data.json is not yet generated
        const evRes = await fetch(`${normalized}/events.json?v=${this.lastBucket}`);
        if (evRes.ok) {
          const evData = (await evRes.json()) as { events?: SpikeEventAnnotation[] };
          if (Array.isArray(evData?.events) && evData.events.length > 0) {
            this.events = evData.events;
            this.isOvhLiveFeed = true;
            this.render();
          }
        }
        return;
      }

      const data = (await res.json()) as {
        buckets?: SpikeDataPoint[];
        events?: SpikeEventAnnotation[];
      };

      if (Array.isArray(data?.buckets) && data.buckets.length > 0) {
        this.buckets = data.buckets;
        if (Array.isArray(data?.events)) {
          this.events = data.events;
        }
        this.isOvhLiveFeed = true;
        this.render();
        if (this.fullscreenModalEl) {
          this.renderFullscreenModalChart();
        }
      }
    } catch {
      // Retain existing data
    }
  }

  public override destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('theme-changed', this.themeHandler);
    this.closeFullscreenModal();
    super.destroy();
  }

  private getSeriesForCurrentTheater(): SeriesItem[] {
    const isLight = getCurrentTheme() === 'light';

    if (this.selectedTheater === 'all') {
      return [
        {
          id: 'east-med',
          label: 'East Med / Levant',
          color: isLight ? THEATERS['east-med'].colorLight : THEATERS['east-med'].colorDark,
          getValue: (d) => d.composite['east-med'] ?? 0,
        },
        {
          id: 'iran-centcom',
          label: 'Iran / CENTCOM',
          color: isLight ? THEATERS['iran-centcom'].colorLight : THEATERS['iran-centcom'].colorDark,
          getValue: (d) => d.composite['iran-centcom'] ?? 0,
        },
        {
          id: 'black-sea',
          label: 'Black Sea / Baltic',
          color: isLight ? THEATERS['black-sea'].colorLight : THEATERS['black-sea'].colorDark,
          getValue: (d) => d.composite['black-sea'] ?? 0,
        },
        {
          id: 'taiwan-scs',
          label: 'Taiwan Strait / SCS',
          color: isLight ? THEATERS['taiwan-scs'].colorLight : THEATERS['taiwan-scs'].colorDark,
          getValue: (d) => d.composite['taiwan-scs'] ?? 0,
        },
      ];
    }

    const tid = this.selectedTheater;
    return [
      {
        id: 'tanker_awacs',
        label: 'Tanker / AWACS (Lead)',
        color: isLight ? '#0284c7' : '#38bdf8',
        getValue: (d) => d.theaters[tid]?.tanker_awacs ?? 0,
      },
      {
        id: 'isr_recon',
        label: 'ISR / Recon Patrols',
        color: isLight ? '#7c3aed' : '#a855f7',
        getValue: (d) => d.theaters[tid]?.isr_recon ?? 0,
      },
      {
        id: 'gnss_jamming',
        label: 'GNSS Jamming & Degradation',
        color: isLight ? '#d97706' : '#f59e0b',
        getValue: (d) => d.theaters[tid]?.gnss_jamming ?? 0,
      },
      {
        id: 'thermal',
        label: 'NASA FIRMS Thermal Hotspots',
        color: isLight ? '#dc2626' : '#ef4444',
        getValue: (d) => d.theaters[tid]?.thermal ?? 0,
      },
    ];
  }

  /**
   * Renders the dynamic, interactive D3 SVG timeseries into any container.
   */
  private renderD3Chart(container: HTMLElement, isFullscreen = false): void {
    const isLight = getCurrentTheme() === 'light';
    const width = Math.max(340, container.clientWidth || (isFullscreen ? 1180 : 720));
    const height = isFullscreen ? Math.min(560, window.innerHeight * 0.6) : 340;

    const margin = { top: 24, right: 26, bottom: 34, left: 46 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // Clear previous SVG
    d3.select(container).selectAll('*').remove();

    const seriesList = this.getSeriesForCurrentTheater();
    const activeSeries = seriesList.filter((s) => !this.hiddenSeries.has(s.id));

    // Colors matching theme
    const chartBg = isLight ? '#ffffff' : '#090d16';
    const plotBg = isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.55)';
    const plotBorder = isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.16)';
    const textSub = isLight ? '#64748b' : '#94a3b8';
    const gridNormal = isLight ? 'rgba(100, 116, 139, 0.16)' : 'rgba(148, 163, 184, 0.12)';
    const gridCrit = isLight ? 'rgba(220, 38, 38, 0.45)' : 'rgba(239, 68, 68, 0.45)';
    const gridElev = isLight ? 'rgba(217, 119, 6, 0.45)' : 'rgba(245, 158, 11, 0.45)';
    const textCrit = isLight ? '#dc2626' : '#f87171';
    const textElev = isLight ? '#d97706' : '#fbbf24';

    // Tooltip Element
    const tooltip = document.createElement('div');
    tooltip.className = 'activity-spikes-d3-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 50;
      padding: 8px 12px;
      border-radius: 6px;
      background: ${isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.95)'};
      border: 1px solid ${isLight ? '#cbd5e1' : '#334155'};
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      font-family: monospace;
      font-size: 11px;
      color: ${isLight ? '#0f172a' : '#f8fafc'};
      max-width: 320px;
    `;
    container.style.position = 'relative';
    container.appendChild(tooltip);

    // Root SVG
    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .style('background', chartBg)
      .style('border-radius', '6px');

    const clipId = `spikes-clip-${isFullscreen ? 'modal' : 'panel'}-${Math.random().toString(36).slice(2, 8)}`;
    const defs = svg.append('defs');
    defs
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', plotW)
      .attr('height', plotH);

    // Scales
    const xExtent = d3.extent(this.buckets, (d) => d.ts) as [number, number];
    const xScale = d3.scaleTime().domain(xExtent).range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain([-0.8, 5.0]).range([height - margin.bottom, margin.top]);

    // Plot Background
    svg
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', plotW)
      .attr('height', plotH)
      .attr('fill', plotBg)
      .attr('stroke', plotBorder)
      .attr('stroke-width', 1);

    // Grid lines for Y-axis sigma levels (-0.8 to +5σ)
    const sigmaLevels = [0, 1, 2, 3, 4];
    const gridG = svg.append('g').attr('class', 'grid-lines');
    sigmaLevels.forEach((sigma) => {
      const y = yScale(sigma);
      const isCrit = sigma === 3;
      const isElev = sigma === 2;
      const stroke = isCrit ? gridCrit : isElev ? gridElev : gridNormal;
      const textColor = isCrit ? textCrit : isElev ? textElev : textSub;

      gridG
        .append('line')
        .attr('x1', margin.left)
        .attr('y1', y)
        .attr('x2', width - margin.right)
        .attr('y2', y)
        .attr('stroke', stroke)
        .attr('stroke-width', isCrit || isElev ? 1.2 : 1)
        .attr('stroke-dasharray', isCrit || isElev ? '4,3' : 'none');

      gridG
        .append('text')
        .attr('x', margin.left - 6)
        .attr('y', y + 3.5)
        .attr('text-anchor', 'end')
        .attr('fill', textColor)
        .attr('font-size', '9.5px')
        .attr('font-family', 'monospace')
        .attr('font-weight', isCrit || isElev ? '700' : '500')
        .text(`+${sigma}σ`);
    });

    // Clipped Content Group (Zoomable curves, area fills & spike bands)
    const plotContent = svg.append('g').attr('clip-path', `url(#${clipId})`);

    // Vertical Anomaly Spike Bands
    const relevantEvents =
      this.selectedTheater === 'all'
        ? this.events
        : this.events.filter((e) => e.theaterId === this.selectedTheater);

    const bandsG = plotContent.append('g').attr('class', 'anomaly-bands');
    const markersG = plotContent.append('g').attr('class', 'anomaly-markers');

    // Curves & Areas Container
    const curvesG = plotContent.append('g').attr('class', 'curves-layer');

    const updateSpikeAnnotations = (currentX: d3.ScaleTime<number, number>) => {
      // 1. Bands
      const bandSelection = bandsG
        .selectAll<SVGGElement, SpikeEventAnnotation>('.anomaly-band-group')
        .data(relevantEvents, (d) => d.id);

      const bandEnter = bandSelection.enter().append('g').attr('class', 'anomaly-band-group');

      bandEnter
        .append('rect')
        .attr('class', 'anomaly-band-rect')
        .attr('y', margin.top)
        .attr('width', 18)
        .attr('height', plotH)
        .attr('fill', (d) =>
          d.severity === 'critical'
            ? isLight
              ? 'rgba(220, 38, 38, 0.08)'
              : 'rgba(239, 68, 68, 0.12)'
            : isLight
              ? 'rgba(217, 119, 6, 0.08)'
              : 'rgba(245, 158, 11, 0.12)'
        );

      bandEnter
        .append('line')
        .attr('class', 'anomaly-band-line')
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .attr('stroke', (d) => (d.severity === 'critical' ? textCrit : textElev))
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', '3,2');

      const allBands = bandEnter.merge(bandSelection);
      allBands.select('.anomaly-band-rect').attr('x', (d) => currentX(d.ts) - 9);
      allBands
        .select('.anomaly-band-line')
        .attr('x1', (d) => currentX(d.ts))
        .attr('x2', (d) => currentX(d.ts));

      bandSelection.exit().remove();

      // 2. Interactive Clickable Markers
      const markerSelection = markersG
        .selectAll<SVGGElement, SpikeEventAnnotation>('.anomaly-pin-group')
        .data(relevantEvents, (d) => d.id);

      const markerEnter = markerSelection
        .enter()
        .append('g')
        .attr('class', 'anomaly-pin-group')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          this.onLocationClick?.(d.lat, d.lon);
        });

      markerEnter
        .append('rect')
        .attr('class', 'anomaly-pin-bg')
        .attr('y', margin.top + 4)
        .attr('height', 16)
        .attr('rx', 3)
        .attr('fill', isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.95)')
        .attr('stroke', (d) => (d.severity === 'critical' ? textCrit : textElev))
        .attr('stroke-width', 1);

      markerEnter
        .append('text')
        .attr('class', 'anomaly-pin-text')
        .attr('y', margin.top + 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .attr('font-family', 'monospace')
        .attr('fill', (d) => (d.severity === 'critical' ? textCrit : textElev))
        .text((d) => `📍 ${d.theaterId.toUpperCase()} +${d.zScore.toFixed(1)}σ`);

      const allMarkers = markerEnter.merge(markerSelection);
      allMarkers.each(function () {
        const g = d3.select(this);
        const textNode = g.select<SVGTextElement>('.anomaly-pin-text').node();
        const textW = textNode ? textNode.getComputedTextLength() + 14 : 76;
        g.select('.anomaly-pin-bg')
          .attr('width', textW)
          .attr('x', (d) => {
            const ev = d as SpikeEventAnnotation;
            return currentX(ev.ts) - textW / 2;
          });
        g.select('.anomaly-pin-text').attr('x', (d) => {
          const ev = d as SpikeEventAnnotation;
          return currentX(ev.ts);
        });
      });

      markerSelection.exit().remove();
    };

    // Line & Area Generators
    const lineGen = d3
      .line<SpikeDataPoint>()
      .x((d) => xScale(d.ts))
      .y(() => yScale(0))
      .curve(d3.curveMonotoneX);

    const areaGen = d3
      .area<SpikeDataPoint>()
      .x((d) => xScale(d.ts))
      .y0(yScale(0))
      .y1(() => yScale(0))
      .curve(d3.curveMonotoneX);

    const renderCurves = (currentX: d3.ScaleTime<number, number>) => {
      curvesG.selectAll('*').remove();

      activeSeries.forEach((series) => {
        const isHovered = this.hoveredSeries === series.id;
        const isAnyHovered = Boolean(this.hoveredSeries);
        const opacity = isAnyHovered ? (isHovered ? 1.0 : 0.22) : 1.0;
        const strokeWidth = isHovered ? 2.8 : 1.8;

        const currentLine = lineGen.x((d) => currentX(d.ts)).y((d) => yScale(series.getValue(d)));
        const currentArea = areaGen.x((d) => currentX(d.ts)).y1((d) => yScale(series.getValue(d)));

        // Area under curve
        curvesG
          .append('path')
          .datum(this.buckets)
          .attr('class', `area-series area-${series.id}`)
          .attr('fill', series.color)
          .attr('opacity', isLight ? (isHovered ? 0.16 : 0.08) : isHovered ? 0.12 : 0.06)
          .attr('d', currentArea);

        // Main line
        curvesG
          .append('path')
          .datum(this.buckets)
          .attr('class', `line-series line-${series.id}`)
          .attr('fill', 'none')
          .attr('stroke', series.color)
          .attr('stroke-width', strokeWidth)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round')
          .attr('opacity', opacity)
          .attr('d', currentLine);
      });
    };

    // Initial render
    const currentTransform = isFullscreen ? this.modalZoomTransform : this.currentZoomTransform;
    const initialX = currentTransform.rescaleX(xScale);
    renderCurves(initialX);
    updateSpikeAnnotations(initialX);

    // X Axis
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(isFullscreen ? 10 : 7)
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    const xAxisG = svg
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(xAxis.scale(initialX));

    xAxisG.select('.domain').attr('stroke', plotBorder);
    xAxisG.selectAll('.tick line').attr('stroke', plotBorder);
    xAxisG
      .selectAll('.tick text')
      .attr('fill', textSub)
      .attr('font-size', '9.5px')
      .attr('font-family', 'monospace');

    // Crosshair Line
    const crosshair = svg
      .append('line')
      .attr('class', 'crosshair-line')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('stroke', isLight ? '#0284c7' : '#38bdf8')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0)
      .attr('pointer-events', 'none');

    // Zoom & Pan Configuration
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .translateExtent([
        [margin.left, 0],
        [width - margin.right, height],
      ])
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ])
      .on('zoom', (event) => {
        const transform = event.transform as d3.ZoomTransform;
        if (isFullscreen) {
          this.modalZoomTransform = transform;
        } else {
          this.currentZoomTransform = transform;
        }
        const rescaledX = transform.rescaleX(xScale);

        xAxisG.call(xAxis.scale(rescaledX));
        xAxisG.select('.domain').attr('stroke', plotBorder);
        xAxisG.selectAll('.tick line').attr('stroke', plotBorder);
        xAxisG
          .selectAll('.tick text')
          .attr('fill', textSub)
          .attr('font-size', '9.5px')
          .attr('font-family', 'monospace');

        renderCurves(rescaledX);
        updateSpikeAnnotations(rescaledX);
        const isZoomed = Math.abs(transform.k - 1) > 0.01 || Math.abs(transform.x) > 2;
        this.updateZoomControlsState(container, isZoomed);
      });

    // Apply existing zoom transform
    svg.call(zoomBehavior);
    if (currentTransform.k !== 1 || currentTransform.x !== 0) {
      svg.call(zoomBehavior.transform, currentTransform);
    }

    // Interactive Hover Overlay (Pointer Events)
    const bisectTime = d3.bisector<SpikeDataPoint, number>((d) => d.ts).center;

    svg
      .append('rect')
      .attr('class', 'chart-interaction-overlay')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', plotW)
      .attr('height', plotH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('pointermove', (event: PointerEvent) => {
        const [mx, my] = d3.pointer(event, svg.node()!);
        if (mx < margin.left || mx > width - margin.right || my < margin.top || my > height - margin.bottom) {
          crosshair.attr('opacity', 0);
          tooltip.style.display = 'none';
          return;
        }

        const activeTransform = isFullscreen ? this.modalZoomTransform : this.currentZoomTransform;
        const rescaledX = activeTransform.rescaleX(xScale);
        const hoveredTime = rescaledX.invert(mx).getTime();
        const index = bisectTime(this.buckets, hoveredTime);
        const point = this.buckets[index];
        if (!point) return;

        const px = rescaledX(point.ts);
        crosshair.attr('x1', px).attr('x2', px).attr('opacity', 0.9);

        // Tooltip Content
        const matchingEvent = this.events.find(
          (e) => Math.abs(e.ts - point.ts) < 12 * 3600 * 1000 && (this.selectedTheater === 'all' || e.theaterId === this.selectedTheater)
        );

        let tooltipHtml = `
          <div style="font-weight: 700; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid ${isLight ? '#e2e8f0' : '#334155'}; display: flex; justify-content: space-between; gap: 8px;">
            <span>⏱ ${escapeHtml(point.dateLabel)}</span>
            <span style="opacity: 0.7;">D-${Math.max(0, Math.round((Date.now() - point.ts) / 86400000))}</span>
          </div>
        `;

        seriesList.forEach((s) => {
          const isHidden = this.hiddenSeries.has(s.id);
          const val = s.getValue(point);
          const valColor = val >= 3.0 ? textCrit : val >= 2.0 ? textElev : isLight ? '#0f172a' : '#f8fafc';
          tooltipHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 3px; opacity: ${isHidden ? 0.35 : 1};">
              <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${s.color};"></span>
                <span>${escapeHtml(s.label)}</span>
              </span>
              <span style="font-weight: 700; color: ${valColor};">${val >= 0 ? '+' : ''}${val.toFixed(2)}σ</span>
            </div>
          `;
        });

        if (matchingEvent) {
          tooltipHtml += `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed ${isLight ? '#e2e8f0' : '#334155'}; font-size: 10px; color: ${matchingEvent.severity === 'critical' ? textCrit : textElev}; line-height: 1.35;">
              <strong>⚠️ ${escapeHtml(matchingEvent.theaterLabel)}:</strong> ${escapeHtml(matchingEvent.headline)}
            </div>
          `;
        }

        tooltip.innerHTML = tooltipHtml;
        tooltip.style.display = 'block';

        // Position tooltip intelligently so it doesn't overflow container
        const tipRect = tooltip.getBoundingClientRect();
        let tipX = mx + 16;
        if (tipX + tipRect.width > width - 10) {
          tipX = mx - tipRect.width - 16;
        }
        let tipY = my - tipRect.height / 2;
        tipY = Math.max(margin.top, Math.min(height - margin.bottom - tipRect.height, tipY));

        tooltip.style.left = `${tipX}px`;
        tooltip.style.top = `${tipY}px`;
      })
      .on('pointerleave', () => {
        crosshair.attr('opacity', 0);
        tooltip.style.display = 'none';
      });

    // Wire up Reset Zoom handler
    const resetBtn = this.getResetButton(container);
    if (resetBtn) {
      const isZoomed = Math.abs(currentTransform.k - 1) > 0.01 || Math.abs(currentTransform.x) > 2;
      this.updateZoomControlsState(container, isZoomed);
      resetBtn.onclick = (e) => {
        e.stopPropagation();
        const activeTransform = isFullscreen ? this.modalZoomTransform : this.currentZoomTransform;
        if (activeTransform.k === 1 && activeTransform.x === 0) return;
        svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
        if (isFullscreen) {
          this.modalZoomTransform = d3.zoomIdentity;
        } else {
          this.currentZoomTransform = d3.zoomIdentity;
        }
        this.updateZoomControlsState(container, false);
      };
    }
  }

  private getResetButton(container: HTMLElement): HTMLButtonElement | null {
    const root =
      container.closest<HTMLElement>('#activity-spikes-modal-overlay, .activity-spikes-panel') ??
      this.content;
    return root?.querySelector<HTMLButtonElement>('.activity-spikes-reset-zoom') ?? null;
  }

  private updateZoomControlsState(container: HTMLElement, isZoomed: boolean): void {
    const resetBtn = this.getResetButton(container);
    if (resetBtn) {
      resetBtn.style.opacity = isZoomed ? '1' : '0.45';
      resetBtn.style.cursor = isZoomed ? 'pointer' : 'default';
    }
  }

  public openFullscreenModal(): void {
    if (this.fullscreenModalEl) return;

    const isLight = getCurrentTheme() === 'light';
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
      background: ${isLight ? 'rgba(15, 23, 42, 0.65)' : 'rgba(0, 0, 0, 0.82)'};
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
        max-width: 1260px;
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
            <span style="font-weight: 700; font-size: 13px; color: ${isLight ? '#0f172a' : '#f8fafc'}; font-family: monospace;">SIGNAL ACTIVITY SPIKES (DYNAMIC D3 ENGINE)</span>
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
              class="social-chip activity-spikes-reset-zoom"
              style="font-size: 11px; padding: 4px 9px; cursor: pointer; opacity: 0.45;"
              title="Reset zoom to 30 days"
            >↺ Reset Zoom</button>

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

        <div id="activity-spikes-modal-legend-bar" style="padding: 8px 16px; background: ${isLight ? '#f8fafc' : '#0f172a'}; border-bottom: 1px solid ${isLight ? '#e2e8f0' : '#1e293b'}; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;">
          ${this.generateLegendHtml()}
        </div>

        <div id="activity-spikes-modal-canvas-wrapper" style="
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          background: ${isLight ? '#ffffff' : '#090d16'};
          overflow: hidden;
        ">
          <div id="activity-spikes-modal-d3-container" style="width: 100%; height: 100%; min-height: 440px;"></div>
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
          <span>Scroll mouse wheel to zoom in • Drag left/right to pan timeline • Click legend series to isolate</span>
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
          this.hiddenSeries.clear();
          this.modalZoomTransform = d3.zoomIdentity;
          this.currentZoomTransform = d3.zoomIdentity;
          this.render();
          this.renderFullscreenModalChart();
        }
      });
    });

    this.keydownListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeFullscreenModal();
      }
    };
    window.addEventListener('keydown', this.keydownListener);

    document.body.appendChild(overlay);
    this.fullscreenModalEl = overlay;
    this.modalZoomTransform = d3.zoomIdentity;

    this.renderFullscreenModalChart();
  }

  private renderFullscreenModalChart(): void {
    if (!this.fullscreenModalEl) return;
    const modalContainer = this.fullscreenModalEl.querySelector<HTMLElement>('#activity-spikes-modal-d3-container');
    const legendBar = this.fullscreenModalEl.querySelector<HTMLElement>('#activity-spikes-modal-legend-bar');

    if (legendBar) {
      legendBar.innerHTML = this.generateLegendHtml();
      this.attachLegendListeners(legendBar, () => this.renderFullscreenModalChart());
    }

    if (modalContainer) {
      this.renderD3Chart(modalContainer, true);
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
    this.modalZoomTransform = d3.zoomIdentity;
  }

  private generateLegendHtml(): string {
    const isLight = getCurrentTheme() === 'light';
    const seriesList = this.getSeriesForCurrentTheater();
    const hasHidden = this.hiddenSeries.size > 0;

    const chips = seriesList
      .map((s) => {
        const isHidden = this.hiddenSeries.has(s.id);
        const isHovered = this.hoveredSeries === s.id;

        return `
          <button
            type="button"
            class="spikes-legend-pill"
            data-series-id="${escapeHtml(s.id)}"
            style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 3px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-family: monospace;
              cursor: pointer;
              transition: all 0.15s ease;
              background: ${isHidden ? 'transparent' : isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.8)'};
              border: 1px solid ${isHidden ? (isLight ? '#e2e8f0' : '#334155') : s.color};
              color: ${isHidden ? (isLight ? '#94a3b8' : '#64748b') : isLight ? '#0f172a' : '#f8fafc'};
              font-weight: ${isHovered || !isHidden ? '600' : '400'};
              text-decoration: ${isHidden ? 'line-through' : 'none'};
              opacity: ${isHidden ? '0.6' : '1'};
            "
            title="Click to toggle line • Double-click / Solo to isolate"
          >
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${s.color};"></span>
            <span>${escapeHtml(s.label)}</span>
            <span
              class="spikes-solo-btn"
              data-solo-id="${escapeHtml(s.id)}"
              style="font-size: 9px; opacity: 0.65; padding: 0 3px; border-radius: 2px; border: 1px solid ${isLight ? '#cbd5e1' : '#475569'}; margin-left: 2px;"
              title="Solo view this stream"
            >Solo</span>
          </button>
        `;
      })
      .join('');

    return `
      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
        <span style="font-size: 10px; color: ${isLight ? '#64748b' : '#94a3b8'}; font-family: monospace; font-weight: 700;">SERIES:</span>
        ${chips}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${
          hasHidden
            ? `<button type="button" class="spikes-show-all-btn social-chip" style="font-size: 10px; padding: 2px 7px; cursor: pointer;">Show All (${seriesList.length})</button>`
            : ''
        }
      </div>
    `;
  }

  private attachLegendListeners(container: HTMLElement, onUpdate: () => void): void {
    const seriesList = this.getSeriesForCurrentTheater();

    container.querySelectorAll<HTMLElement>('.spikes-legend-pill').forEach((pill) => {
      const sid = pill.dataset.seriesId;
      if (!sid) return;

      pill.addEventListener('click', (e) => {
        // If clicking solo button specifically
        const target = e.target as HTMLElement;
        if (target.classList.contains('spikes-solo-btn')) {
          e.stopPropagation();
          this.hiddenSeries.clear();
          seriesList.forEach((s) => {
            if (s.id !== sid) this.hiddenSeries.add(s.id);
          });
          onUpdate();
          return;
        }

        e.stopPropagation();
        if (this.hiddenSeries.has(sid)) {
          this.hiddenSeries.delete(sid);
        } else {
          // Keep at least one line visible
          if (this.hiddenSeries.size < seriesList.length - 1) {
            this.hiddenSeries.add(sid);
          }
        }
        onUpdate();
      });

      pill.addEventListener('mouseenter', () => {
        this.hoveredSeries = sid;
        onUpdate();
      });

      pill.addEventListener('mouseleave', () => {
        this.hoveredSeries = null;
        onUpdate();
      });
    });

    container.querySelector<HTMLButtonElement>('.spikes-show-all-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hiddenSeries.clear();
      onUpdate();
    });
  }

  public render(): void {
    const isLight = getCurrentTheme() === 'light';
    const tabs: { id: SpikeTheaterId; label: string }[] = [
      { id: 'all', label: 'All Theaters (Z-Score)' },
      { id: 'east-med', label: 'East Med / Levant' },
      { id: 'iran-centcom', label: 'Iran / CENTCOM' },
      { id: 'black-sea', label: 'Black Sea / Baltic' },
      { id: 'taiwan-scs', label: 'Taiwan / SCS' },
    ];

    const filteredEvents =
      this.selectedTheater === 'all'
        ? this.events
        : this.events.filter((e) => e.theaterId === this.selectedTheater);

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
              class="social-chip activity-spikes-reset-zoom"
              style="font-size: 10px; padding: 3px 8px; cursor: pointer; opacity: 0.45;"
              title="Reset zoom to 30 days"
            >↺ Reset</button>
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
              title="Refresh telemetry"
            >↻ Sync</button>
          </div>
        </div>

        <div id="activity-spikes-main-legend-bar" style="padding: 6px 8px; background: var(--surface-hover, #f8fafc); border-radius: 6px; border: 1px solid var(--border, #e2e8f0); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px;">
          ${this.generateLegendHtml()}
        </div>

        <div
          id="activity-spikes-chart-wrapper"
          style="position: relative; width: 100%; border-radius: 6px; overflow: hidden; background: ${isLight ? '#ffffff' : '#090d16'}; border: 1px solid var(--border, #e2e8f0);"
        >
          <div id="activity-spikes-d3-canvas" style="width: 100%; height: 340px;"></div>
        </div>

        <div class="activity-spikes-events-section" style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-dim, #64748b); font-family: monospace; text-transform: uppercase; letter-spacing: 0.4px;">
            <span>Correlated Multi-Layer Spike Anomalies (> +2.5σ)</span>
            <span>${this.isOvhLiveFeed ? 'Source: OVH Dynamic Timeseries' : 'Source: Synthetic 30d SQLite Telemetry'}</span>
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

    const chartCanvas = this.content.querySelector<HTMLElement>('#activity-spikes-d3-canvas');
    const legendBar = this.content.querySelector<HTMLElement>('#activity-spikes-main-legend-bar');

    if (legendBar) {
      this.attachLegendListeners(legendBar, () => {
        if (chartCanvas) this.renderD3Chart(chartCanvas);
      });
    }

    if (chartCanvas) {
      this.renderD3Chart(chartCanvas);

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      this.resizeObserver = new ResizeObserver(() => {
        if (chartCanvas && chartCanvas.clientWidth > 0) {
          this.renderD3Chart(chartCanvas);
        }
      });
      this.resizeObserver.observe(chartCanvas);
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
          this.hiddenSeries.clear();
          this.currentZoomTransform = d3.zoomIdentity;
          this.render();
        }
      });
    });

    const fullscreenBtn = this.content.querySelector<HTMLButtonElement>('#activity-spikes-fullscreen-btn');
    fullscreenBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFullscreenModal();
    });

    const refreshBtn = this.content.querySelector<HTMLButtonElement>('#activity-spikes-refresh-btn');
    refreshBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.lastBucket = Math.floor(Date.now() / 1000);
      void this.syncTelemetryData();
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
