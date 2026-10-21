/**
 * DeckGLMap - WebGL-accelerated map visualization for desktop
 * Uses deck.gl for high-performance rendering of large datasets
 * Mobile devices gracefully degrade to the D3/SVG-based Map component
 */
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, LayersList, PickingInfo } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, IconLayer, TextLayer, PolygonLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import maplibregl from 'maplibre-gl';
import * as maptilerSdk from '@maptiler/sdk';
import * as maptilerWeather from '@maptiler/weather';
import Supercluster from 'supercluster';
import type {
  MapLayers,
  Hotspot,
  NewsItem,
  InternetOutage,
  RelatedAsset,
  AssetType,
  AisDisruptionEvent,
  AisDensityZone,
  CableAdvisory,
  RepairShip,
  SocialUnrestEvent,
  AIDataCenter,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  NaturalEvent,
  UcdpGeoEvent,
  MapProtestCluster,
  MapTechHQCluster,
  MapTechEventCluster,
  MapDatacenterCluster,
  CyberThreat,
  BgpAnomaly,
  CableHealthRecord,
  RegionalThreat,
  AQIStation,
  AQIClusterData,
} from '@/types';
import {
  getAqiCategory,
  getAqiColorRgba,
  getStationParticulates,
  getMostVariedStations,
} from '@/services/aqi';
import { calculateRegionalThreats } from '@/services/aggregate-threat';
import type { AirportDelayAlert } from '@/services/aviation';
import type { DisplacementFlow } from '@/services/displacement';
import type { Earthquake } from '@/services/earthquakes';
import type { ClimateAnomaly } from '@/services/climate';
import type { RadiationStation } from '@/services/radiation';
import { ArcLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { CollisionFilterExtension } from '@deck.gl/extensions';
import type { WeatherAlert } from '@/services/weather';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { debounce, rafSchedule, getCurrentTheme } from '@/utils/index';
import {
  INTEL_HOTSPOTS,
  CONFLICT_ZONES,
  MILITARY_BASES,
  UNDERSEA_CABLES,
  NUCLEAR_FACILITIES,
  GAMMA_IRRADIATORS,
  PIPELINES,
  PIPELINE_COLORS,
  STRATEGIC_WATERWAYS,
  ECONOMIC_CENTERS,
  AI_DATA_CENTERS,
  SITE_VARIANT,
  STARTUP_HUBS,
  ACCELERATORS,
  TECH_HQS,
  CLOUD_REGIONS,
  PORTS,
  SPACEPORTS,
  CRITICAL_MINERALS,
  STOCK_EXCHANGES,
  FINANCIAL_CENTERS,
  CENTRAL_BANKS,
  COMMODITY_HUBS,
  GULF_INVESTMENTS,
  MAP_URLS,
} from '@/config';
import type { GulfInvestment } from '@/types';
import * as topojson from 'topojson-client';
import { AlertStatusService } from '@/services/alert-status';
import { resolveTradeRouteSegments, TRADE_ROUTES as TRADE_ROUTES_LIST, type TradeRouteSegment } from '@/config/trade-routes';
import { getMilitaryCountryColor } from '@/config/military';
import { MapPopup, type PopupType } from './MapPopup';
import {
  updateHotspotEscalation,
  getHotspotEscalation,
  setMilitaryData,
  setCIIGetter,
  setGeoAlertGetter,
} from '@/services/hotspot-escalation';
import { getCountryScore } from '@/services/country-instability';
import { getAlertsNearLocation } from '@/services/geo-convergence';
import type { PositiveGeoEvent } from '@/services/positive-events-geo';
import type { KindnessPoint } from '@/services/kindness-data';
import type { HappinessData } from '@/services/happiness-data';
import type { RenewableInstallation } from '@/services/renewable-installations';
import type { SpeciesRecovery } from '@/services/conservation-data';
import { getCountriesGeoJson, getCountryAtCoordinates } from '@/services/country-geometry';
import type { FeatureCollection, Geometry } from 'geojson';

export type TimeRange = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';
export type DeckMapView = 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania';
type MapInteractionMode = 'flat' | '3d';

export interface CountryClickPayload {
  lat: number;
  lon: number;
  code?: string;
  name?: string;
}

interface DeckMapState {
  zoom: number;
  pan: { x: number; y: number };
  view: DeckMapView;
  layers: MapLayers;
  timeRange: TimeRange;
}

interface HotspotWithBreaking extends Hotspot {
  hasBreaking?: boolean;
}

interface TechEventMarker {
  id: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  country: string;
  startDate: string;
  endDate: string;
  url: string | null;
  daysUntil: number;
}

export interface LayerCategoryItem {
  key: keyof MapLayers;
  label: string;
  icon: string;
}

export interface LayerCategoryGroup {
  id: string;
  title: string;
  layers: LayerCategoryItem[];
}

// View presets with longitude, latitude, zoom
const VIEW_PRESETS: Record<DeckMapView, { longitude: number; latitude: number; zoom: number }> = {
  global: { longitude: 0, latitude: 20, zoom: 1.5 },
  america: { longitude: -95, latitude: 38, zoom: 3 },
  mena: { longitude: 45, latitude: 28, zoom: 3.5 },
  eu: { longitude: 15, latitude: 50, zoom: 3.5 },
  asia: { longitude: 105, latitude: 35, zoom: 3 },
  latam: { longitude: -60, latitude: -15, zoom: 3 },
  africa: { longitude: 20, latitude: 5, zoom: 3 },
  oceania: { longitude: 135, latitude: -25, zoom: 3.5 },
};

const MAP_INTERACTION_MODE: MapInteractionMode =
  import.meta.env.VITE_MAP_INTERACTION_MODE === 'flat' ? 'flat' : '3d';

// Basemap vector style URLs (English labels, no local scripts)
// The map stays in light style (CARTO Voyager / happy-light)
const LIGHT_STYLE = SITE_VARIANT === 'happy'
  ? '/map-styles/happy-light.json'
  : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Zoom thresholds for layer visibility and labels (matches old Map.ts)
// Zoom-dependent layer visibility and labels
const LAYER_ZOOM_THRESHOLDS: Partial<Record<keyof MapLayers, { minZoom: number; showLabels?: number }>> = {
  bases: { minZoom: 3, showLabels: 5 },
  nuclear: { minZoom: 3 },
  conflicts: { minZoom: 1, showLabels: 3 },
  economic: { minZoom: 3 },
  natural: { minZoom: 1, showLabels: 2 },
  datacenters: { minZoom: 5 },
  irradiators: { minZoom: 4 },
  spaceports: { minZoom: 3 },
  gulfInvestments: { minZoom: 2, showLabels: 5 },
  aqi: { minZoom: 2, showLabels: 4 },
};
// Export for external use
export { LAYER_ZOOM_THRESHOLDS };

// FAO ASIS layer opacities (lowered to maintain basemap readability and multi-layer stacking)
const AGRICULTURAL_LAYER_OPACITY = 0.3;
const VEGETATION_LAYER_OPACITY = 0.3;

// Theme-aware overlay color function (calibrated for light basemap)
function getOverlayColors() {
  const isLight = true;
  return {
    // Threat dots: IDENTICAL in both modes (user locked decision)
    hotspotHigh: [255, 68, 68, 200] as [number, number, number, number],
    hotspotElevated: [255, 165, 0, 200] as [number, number, number, number],
    hotspotLow: [255, 255, 0, 180] as [number, number, number, number],

    // Conflict zone fills: more transparent in light mode
    conflict: isLight
      ? [255, 0, 0, 60] as [number, number, number, number]
      : [255, 0, 0, 100] as [number, number, number, number],

    // Infrastructure/category markers: darker variants in light mode for map readability
    base: [0, 150, 255, 200] as [number, number, number, number],
    nuclear: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 215, 0, 200] as [number, number, number, number],
    datacenter: isLight
      ? [13, 148, 136, 200] as [number, number, number, number]
      : [0, 255, 200, 180] as [number, number, number, number],
    cable: [0, 200, 255, 150] as [number, number, number, number],
    cableHighlight: [255, 100, 100, 200] as [number, number, number, number],
    cableFault: [255, 50, 50, 220] as [number, number, number, number],
    cableDegraded: [255, 165, 0, 200] as [number, number, number, number],
    earthquake: [255, 100, 50, 200] as [number, number, number, number],
    vesselMilitary: [255, 100, 100, 220] as [number, number, number, number],
    flightMilitary: [255, 50, 50, 220] as [number, number, number, number],
    protest: [255, 150, 0, 200] as [number, number, number, number],
    outage: [255, 50, 50, 180] as [number, number, number, number],
    weather: [100, 150, 255, 180] as [number, number, number, number],
    startupHub: isLight
      ? [22, 163, 74, 220] as [number, number, number, number]
      : [0, 255, 150, 200] as [number, number, number, number],
    techHQ: [100, 200, 255, 200] as [number, number, number, number],
    accelerator: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 200, 0, 200] as [number, number, number, number],
    cloudRegion: [150, 100, 255, 180] as [number, number, number, number],
    stockExchange: isLight
      ? [20, 120, 200, 220] as [number, number, number, number]
      : [80, 200, 255, 210] as [number, number, number, number],
    financialCenter: isLight
      ? [0, 150, 110, 215] as [number, number, number, number]
      : [0, 220, 150, 200] as [number, number, number, number],
    centralBank: isLight
      ? [180, 120, 0, 220] as [number, number, number, number]
      : [255, 210, 80, 210] as [number, number, number, number],
    commodityHub: isLight
      ? [190, 95, 40, 220] as [number, number, number, number]
      : [255, 150, 80, 200] as [number, number, number, number],
    gulfInvestmentSA: [0, 168, 107, 220] as [number, number, number, number],
    gulfInvestmentUAE: [255, 0, 100, 220] as [number, number, number, number],
    ucdpStateBased: [255, 50, 50, 200] as [number, number, number, number],
    ucdpNonState: [255, 165, 0, 200] as [number, number, number, number],
    ucdpOneSided: [255, 255, 0, 200] as [number, number, number, number],
  };
}
let COLORS = getOverlayColors();

// SVG icons as data URLs for different marker shapes
const MARKER_ICONS = {
  // Square - for datacenters
  square: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="3" fill="white"/></svg>`),
  // Diamond - for hotspots
  diamond: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 30,16 16,30 2,16" fill="white"/></svg>`),
  // Triangle up - for military bases
  triangleUp: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 30,28 2,28" fill="white"/></svg>`),
  // Triangle down - for gamma irradiators
  triangleDown: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="2,4 30,4 16,30" fill="white"/></svg>`),
  // Hexagon - for nuclear
  hexagon: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="white"/></svg>`),
  // Pentagon - for critical minerals
  pentagon: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 30,12 25,29 7,29 2,12" fill="white"/></svg>`),
  // Circle - fallback
  circle: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="white"/></svg>`),
  // Star - for spaceports & special markers
  star: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 20,12 30,12 22,19 25,30 16,23 7,30 10,19 2,12 12,12" fill="white"/></svg>`),
  // Ring - for radiation detection
  ring: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="white" stroke-width="4"/><circle cx="16" cy="16" r="4" fill="white"/></svg>`),
  // Cross - for internet outages
  cross: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M7 4 L4 7 L13 16 L4 25 L7 28 L16 19 L25 28 L28 25 L19 16 L28 7 L25 4 L16 13 Z" fill="white"/></svg>`),
  // Shield - for cyber threats
  shield: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2 L28 6 V15 C28 22.5 22 28.5 16 31 C10 28.5 4 22.5 4 15 V6 Z" fill="white"/></svg>`),
  // Octagon - for regional threat score
  octagon: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="10,2 22,2 30,10 30,22 22,30 10,30 2,22 2,10" fill="white"/></svg>`),
  // Delta Arrow - for military flights
  delta: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><polygon points="16,2 29,28 16,22 3,28" fill="white"/></svg>`),
  // Warship Hull - for military vessels / naval combatants (sharp pointed bow, straight beam, flat transom stern)
  warship: 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 2 L26 11 L25 28 L7 28 L6 11 Z" fill="white"/></svg>`),
};

export interface MapMilitaryClusterItem {
  id: string;
  lat: number;
  lon: number;
  count: number;
  type: 'air' | 'naval';
  country?: string;
  items: (MilitaryFlight | MilitaryVessel)[];
}

export class DeckGLMap {
  private static readonly MAX_CLUSTER_LEAVES = 200;

  private container: HTMLElement;
  private deckOverlay: MapboxOverlay | null = null;
  private maplibreMap: maplibregl.Map | null = null;
  private state: DeckMapState;
  private popup: MapPopup;

  // Data stores
  private hotspots: HotspotWithBreaking[];
  private earthquakes: Earthquake[] = [];
  private weatherAlerts: WeatherAlert[] = [];
  private outages: InternetOutage[] = [];
  private mapTilerPrecipitationLayer: any = null;
  private mapTilerRadarLayer: any = null;
  private mapTilerPressureLayer: any = null;
  private cyberThreats: CyberThreat[] = [];
  private bgpAnomalies: BgpAnomaly[] = [];
  private bgpAnomaliesFetchPending: boolean = false;
  private aisDisruptions: AisDisruptionEvent[] = [];
  private aisDensity: AisDensityZone[] = [];
  private cableAdvisories: CableAdvisory[] = [];
  private repairShips: RepairShip[] = [];
  private weatherTimeBar: HTMLElement | null = null;
  private waterTempLegend: HTMLElement | null = null;
  private legendElement: HTMLElement | null = null;
  private isLegendOpen = false;
  private healthByCableId: Record<string, CableHealthRecord> = {};
  private protests: SocialUnrestEvent[] = [];
  private militaryFlights: MilitaryFlight[] = [];
  private militaryFlightClusters: MilitaryFlightCluster[] = [];
  private militaryVessels: MilitaryVessel[] = [];
  private militaryVesselClusters: MilitaryVesselCluster[] = [];
  private naturalEvents: NaturalEvent[] = [];
  private firmsFireData: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }> = [];
  private radiationData: RadiationStation[] = [];
  private techEvents: TechEventMarker[] = [];
  private flightDelays: AirportDelayAlert[] = [];
  private news: NewsItem[] = [];
  private newsLocations: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date; items?: import('@/types').NewsItem[] }> = [];
  private newsLocationFirstSeen = new Map<string, number>();
  private ucdpEvents: UcdpGeoEvent[] = [];
  private displacementFlows: DisplacementFlow[] = [];
  private climateAnomalies: ClimateAnomaly[] = [];
  private tradeRouteSegments: TradeRouteSegment[] = resolveTradeRouteSegments();
  private positiveEvents: PositiveGeoEvent[] = [];
  private kindnessPoints: KindnessPoint[] = [];

  // Phase 8 overlay data
  private happinessScores: Map<string, number> = new Map();
  private happinessYear = 0;
  private happinessSource = '';
  private speciesRecoveryZones: Array<SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } }> = [];
  private renewableInstallations: RenewableInstallation[] = [];
  private countriesGeoJsonData: FeatureCollection<Geometry> | null = null;
  private usStateFeatures: any[] = [];
  private canadaProvinceFeatures: any[] = [];
  private aqiData: AQIStation[] = [];
  private lastAqiBounds: string = '';
  private aqiFetchPending: boolean = false;
  private aqiSC: Supercluster | null = null;
  private aqiSCSource: AQIStation[] | null = null;
  private gpsJammingData: import('@/services/gps-jamming').GpsJammingPoint[] = [];
  private gpsJammingFetchPending: boolean = false;

  // Country highlight state
  private countryGeoJsonLoaded = false;
  private countryHoverSetup = false;
  private highlightedCountryCode: string | null = null;

  // Callbacks
  private onHotspotClick?: (hotspot: Hotspot) => void;
  private onTimeRangeChange?: (range: TimeRange) => void;
  private onCountryClick?: (country: CountryClickPayload) => void;
  private onLayerChange?: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void;
  private onStateChange?: (state: DeckMapState) => void;

  // Highlighted assets
  private highlightedAssets: Record<AssetType, Set<string>> = {
    pipeline: new Set(),
    cable: new Set(),
    datacenter: new Set(),
    base: new Set(),
    nuclear: new Set(),
  };

  private renderScheduled = false;
  private renderPaused = false;
  private renderPending = false;
  private webglLost = false;
  private resizeObserver: ResizeObserver | null = null;

  private layerCache: Map<string, Layer> = new Map();
  private lastZoomThreshold = 0;
  private protestSC: Supercluster | null = null;
  private techHQSC: Supercluster | null = null;
  private techEventSC: Supercluster | null = null;
  private datacenterSC: Supercluster | null = null;
  private militaryFlightSC: Supercluster | null = null;
  private militaryVesselSC: Supercluster | null = null;
  private militaryFlightSuperclusterSource: MilitaryFlight[] = [];
  private militaryVesselSuperclusterSource: MilitaryVessel[] = [];
  private protestClusters: MapProtestCluster[] = [];
  private techHQClusters: MapTechHQCluster[] = [];
  private techEventClusters: MapTechEventCluster[] = [];
  private datacenterClusters: MapDatacenterCluster[] = [];
  private lastSCZoom = -1;
  private lastSCBoundsKey = '';
  private lastSCMask = '';
  private protestSuperclusterSource: SocialUnrestEvent[] = [];
  private newsPulseIntervalId: ReturnType<typeof setInterval> | null = null;
  private threatDecayIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly startupTime = Date.now();
  private lastCableHighlightSignature = '';
  private lastCableHealthSignature = '';
  private lastPipelineHighlightSignature = '';
  private dayNightIntervalId: ReturnType<typeof setInterval> | null = null;
  private cachedNightPolygon: [number, number][][] | null = null;
  private cachedNightPolygonAt = 0;

  private debouncedRebuildLayers: () => void;
  private rafUpdateLayers: () => void;
  private moveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private timeParseCache = new Map<unknown, number | null>();
  private timeFilterCache = new Map<unknown[], { timeRange: TimeRange, result: unknown[] }>();

  constructor(container: HTMLElement, initialState: DeckMapState) {
    this.container = container;
    this.state = initialState;
    this.hotspots = [...INTEL_HOTSPOTS];

    this.debouncedRebuildLayers = debounce(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      this.maplibreMap.resize();
      try {
        this.deckOverlay?.setProps({ layers: this.buildLayers() });
      } catch { /* map mid-teardown */ }
    }, 150);
    this.rafUpdateLayers = rafSchedule(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      try {
        this.deckOverlay?.setProps({ layers: this.buildLayers() });
      } catch { /* map mid-teardown */ }
    });

    this.setupDOM();
    this.popup = new MapPopup(container);
    this.startDayNightTimer();
    this.startThreatDecayTimer();

    window.addEventListener('theme-changed', (e: Event) => {
      const theme = (e as CustomEvent).detail?.theme as 'dark' | 'light';
      if (theme) {
        this.switchBasemap(theme);
        COLORS = getOverlayColors();
        this.render(); // Rebuilds Deck.GL layers with new theme-aware colors
      }
    });

    this.initMapLibre();

    this.maplibreMap?.on('load', () => {
      this.rebuildTechHQSupercluster();
      this.rebuildDatacenterSupercluster();
      this.initDeck();
      this.loadCountryBoundaries();
      if (this.state.layers.aqi && this.isLayerVisible('aqi')) {
        this.fetchAQIData();
      }
      if (this.state.layers.gpsJamming) {
        this.fetchGpsJammingData();
      }
      if (this.state.layers.bgpAnomalies) {
        this.fetchBgpAnomaliesData();
      }
      this.render();
    });

    this.maplibreMap?.on('moveend', () => {
      if (this.state.layers.aqi && this.isLayerVisible('aqi')) {
        this.fetchAQIData();
      }
    });

    this.setupResizeObserver();

    this.createControls();
    this.createTimeSlider();
    this.createLayerToggles();
    this.createLegend();
    this.createWaterTempLegend();
  }

  private setupDOM(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'deckgl-map-wrapper';
    wrapper.id = 'deckglMapWrapper';
    wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';

    // MapLibre container - deck.gl renders directly into MapLibre via MapboxOverlay
    const mapContainer = document.createElement('div');
    mapContainer.id = 'deckgl-basemap';
    mapContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    wrapper.appendChild(mapContainer);

    // Map attribution (CARTO basemap + OpenStreetMap data)
    const attribution = document.createElement('div');
    attribution.className = 'map-attribution';
    attribution.innerHTML = '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    wrapper.appendChild(attribution);

    this.container.appendChild(wrapper);
  }

  private initMapLibre(): void {
    const preset = VIEW_PRESETS[this.state.view];

    const mapOptions = {
      container: 'deckgl-basemap',
      style: LIGHT_STYLE,
      center: [preset.longitude, preset.latitude] as [number, number],
      zoom: preset.zoom,
      renderWorldCopies: false as false,
      attributionControl: false as false,
      interactive: true,
      ...(MAP_INTERACTION_MODE === 'flat'
        ? {
          maxPitch: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
        }
        : {}),
    };

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
    if (apiKey) {
      maptilerSdk.config.apiKey = apiKey;
      this.maplibreMap = new maptilerSdk.Map({
        ...mapOptions,
        maptilerLogo: false,
      }) as unknown as maplibregl.Map;
    } else {
      this.maplibreMap = new maplibregl.Map(mapOptions);
    }

    const canvas = this.maplibreMap.getCanvas();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.webglLost = true;
      console.warn('[DeckGLMap] WebGL context lost — will restore when browser recovers');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.webglLost = false;
      console.info('[DeckGLMap] WebGL context restored');
      this.maplibreMap?.triggerRepaint();
    });

    this.maplibreMap.on('load', () => {
      if (apiKey && this.maplibreMap) {
        try {
          this.mapTilerRadarLayer = new maptilerWeather.RadarLayer({ id: 'maptiler-radar', opacity: 0.8, bounds: [-180, -90, 180, 90] } as any);
          this.mapTilerPrecipitationLayer = new maptilerWeather.PrecipitationLayer({ id: 'maptiler-precipitation', opacity: 0.8, bounds: [-180, -90, 180, 90] } as any);
          this.mapTilerPressureLayer = new maptilerWeather.PressureLayer({ id: 'maptiler-pressure', opacity: 0.3, bounds: [-180, -90, 180, 90] } as any);

          const isWeatherRadarEnabled = this.state.layers.weatherRadar;
          if (isWeatherRadarEnabled) {
            // Priority: Load primary radar layer first to maximize tile bandwidth and ensure instant rendering
            this.maplibreMap.addLayer(this.mapTilerRadarLayer as any);
            if (typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
              this.mapTilerRadarLayer.animateByFactor(600);
            }
            this.setLayerReady('weatherRadar', true);

            // Stagger secondary precipitation & pressure layers to prevent tile request contention
            setTimeout(() => {
              if (this.maplibreMap && this.state.layers.weatherRadar) {
                if (!this.maplibreMap.getLayer('maptiler-precipitation') && this.mapTilerPrecipitationLayer) {
                  this.maplibreMap.addLayer(this.mapTilerPrecipitationLayer as any);
                  if (typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
                    this.mapTilerPrecipitationLayer.animateByFactor(600);
                  }
                }
                if (!this.maplibreMap.getLayer('maptiler-pressure') && this.mapTilerPressureLayer) {
                  this.maplibreMap.addLayer(this.mapTilerPressureLayer as any);
                  if (typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
                    this.mapTilerPressureLayer.animateByFactor(600);
                  }
                }
              }
            }, 180);
          }

          // Initialize Weather Time Tracking Bar
          this.weatherTimeBar = document.createElement('div');
          this.weatherTimeBar.className = 'weather-time-bar';
          this.weatherTimeBar.style.display = isWeatherRadarEnabled ? 'flex' : 'none';

          this.weatherTimeBar.innerHTML = `
            <div class="weather-controls">
              <button class="weather-btn weather-speed-down" title="Slower">&#8722;</button>
              <button class="weather-btn weather-play-pause" title="Play/Pause">&#10074;&#10074;</button>
              <button class="weather-btn weather-speed-up" title="Faster">&#43;</button>
            </div>
            <div class="weather-time-display" style="display: flex; align-items: center; gap: 6px;">
              <span class="weather-time-icon">&#9928;</span>
              <span class="weather-time-text"></span>
            </div>
          `;
          this.container.appendChild(this.weatherTimeBar);

          const timeText = this.weatherTimeBar.querySelector('.weather-time-text') as HTMLElement;
          const playPauseBtn = this.weatherTimeBar.querySelector('.weather-play-pause') as HTMLButtonElement;
          const speedDownBtn = this.weatherTimeBar.querySelector('.weather-speed-down') as HTMLButtonElement;
          const speedUpBtn = this.weatherTimeBar.querySelector('.weather-speed-up') as HTMLButtonElement;

          let isPlaying = true;
          let speedMultiplier = 600; // default 10 minutes per sec

          playPauseBtn.addEventListener('click', () => {
            if (!this.mapTilerPrecipitationLayer) return;
            if (isPlaying) {
              if (typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
                this.mapTilerPrecipitationLayer.animateByFactor(0);
              }
              if (this.mapTilerRadarLayer && typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
                this.mapTilerRadarLayer.animateByFactor(0);
              }
              if (this.mapTilerPressureLayer && typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
                this.mapTilerPressureLayer.animateByFactor(0);
              }
              playPauseBtn.innerHTML = '&#9658;'; // Play icon
              isPlaying = false;
            } else {
              if (typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
                this.mapTilerPrecipitationLayer.animateByFactor(speedMultiplier);
              }
              if (this.mapTilerRadarLayer && typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
                this.mapTilerRadarLayer.animateByFactor(speedMultiplier);
              }
              if (this.mapTilerPressureLayer && typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
                this.mapTilerPressureLayer.animateByFactor(speedMultiplier);
              }
              playPauseBtn.innerHTML = '&#10074;&#10074;'; // Pause icon
              isPlaying = true;
            }
          });

          speedUpBtn.addEventListener('click', () => {
            speedMultiplier = Math.min(speedMultiplier * 2, 21600); // max 6 hours per second
            if (isPlaying && this.mapTilerPrecipitationLayer && typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
              this.mapTilerPrecipitationLayer.animateByFactor(speedMultiplier);
            }
            if (isPlaying && this.mapTilerRadarLayer && typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
              this.mapTilerRadarLayer.animateByFactor(speedMultiplier);
            }
            if (isPlaying && this.mapTilerPressureLayer && typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
              this.mapTilerPressureLayer.animateByFactor(speedMultiplier);
            }
          });

          speedDownBtn.addEventListener('click', () => {
            speedMultiplier = Math.max(speedMultiplier / 2, 600); // min 10 minutes per second
            if (isPlaying && this.mapTilerPrecipitationLayer && typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
              this.mapTilerPrecipitationLayer.animateByFactor(speedMultiplier);
            }
            if (isPlaying && this.mapTilerRadarLayer && typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
              this.mapTilerRadarLayer.animateByFactor(speedMultiplier);
            }
            if (isPlaying && this.mapTilerPressureLayer && typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
              this.mapTilerPressureLayer.animateByFactor(speedMultiplier);
            }
          });

          // Bind tick event
          this.mapTilerPrecipitationLayer.on('tick', () => {
            if (!timeText || !this.mapTilerPrecipitationLayer) return;
            const date = typeof this.mapTilerPrecipitationLayer.getAnimationTimeDate === 'function'
              ? this.mapTilerPrecipitationLayer.getAnimationTimeDate()
              : new Date();

            timeText.innerText = new Intl.DateTimeFormat('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
            }).format(date);
          });
        } catch (e) {
          console.warn('[DeckGLMap] Failed to initialize MapTiler weather layers:', e);
        }
      }

      if (this.state.layers.waterTemperature) {
        this.updateWaterTemperatureLayer(true);
      }
    });
  }

  private initDeck(): void {
    if (!this.maplibreMap) return;

    this.deckOverlay = new MapboxOverlay({
      interleaved: false,
      layers: this.buildLayers(),
      getTooltip: (info: PickingInfo) => this.getTooltip(info),
      onClick: (info: PickingInfo) => this.handleClick(info),
      pickingRadius: 2,
      useDevicePixels: false,
      onError: (error: Error) => console.warn('[DeckGLMap] Render error (non-fatal):', error.message),
    });

    this.maplibreMap.addControl(this.deckOverlay as unknown as maplibregl.IControl);

    this.maplibreMap.on('zoom', () => {
      this.rafUpdateLayers();
    });

    this.maplibreMap.on('movestart', () => {
      if (this.moveTimeoutId) {
        clearTimeout(this.moveTimeoutId);
        this.moveTimeoutId = null;
      }
    });

    this.maplibreMap.on('moveend', () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        // Only trigger a re-render if clustering boundaries actually require new data calculation
        const oldZoom = this.lastSCZoom;
        const oldBoundsKey = this.lastSCBoundsKey;
        const oldMask = this.lastSCMask;

        this.updateClusterData();

        const zoomThresholdCrossed = Math.abs((this.maplibreMap?.getZoom() || 2) - this.lastZoomThreshold) >= 1;

        if (zoomThresholdCrossed || this.lastSCZoom !== oldZoom || this.lastSCBoundsKey !== oldBoundsKey || this.lastSCMask !== oldMask) {
          this.lastZoomThreshold = Math.floor(this.maplibreMap?.getZoom() || 2);
          this.debouncedRebuildLayers();
        }
      }, 100);
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.maplibreMap) {
        this.maplibreMap.resize();
      }
    });
    this.resizeObserver.observe(this.container);
  }


  private getSetSignature(set: Set<string>): string {
    return [...set].sort().join('|');
  }

  private hasRecentNews(now = Date.now()): boolean {
    for (const ts of this.newsLocationFirstSeen.values()) {
      if (now - ts < 30_000) return true;
    }
    return false;
  }

  private getTimeRangeMs(range: TimeRange = this.state.timeRange): number {
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };
    return ranges[range];
  }

  private parseTime(value: Date | string | number | undefined | null): number | null {
    if (value == null) return null;
    if (this.timeParseCache.has(value)) return this.timeParseCache.get(value)!;

    const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
    const result = Number.isFinite(ts) ? ts : null;

    this.timeParseCache.set(value, result);
    return result;
  }

  private filterByTime<T>(
    items: T[],
    getTime: (item: T) => Date | string | number | undefined | null
  ): T[] {
    if (this.state.timeRange === 'all') return items;

    // Check memoization cache
    const cached = this.timeFilterCache.get(items as unknown as unknown[]);
    if (cached && cached.timeRange === this.state.timeRange) {
      return cached.result as T[];
    }

    const cutoff = Date.now() - this.getTimeRangeMs();
    const result = items.filter((item) => {
      const ts = this.parseTime(getTime(item));
      return ts == null ? true : ts >= cutoff;
    });

    // Update cache
    this.timeFilterCache.set(items as unknown as unknown[], {
      timeRange: this.state.timeRange,
      result: result as unknown as unknown[]
    });

    return result;
  }

  private getFilteredProtests(): SocialUnrestEvent[] {
    return this.filterByTime(this.protests, (event) => event.time);
  }

  public filterMilitaryFlightClustersByTime(clusters: MilitaryFlightCluster[]): MilitaryFlightCluster[] {
    return clusters
      .map((cluster) => {
        const flights = this.filterByTime(cluster.flights ?? [], (flight) => flight.lastSeen);
        if (flights.length === 0) return null;
        return {
          ...cluster,
          flights,
          flightCount: flights.length,
        };
      })
      .filter((cluster): cluster is MilitaryFlightCluster => cluster !== null);
  }

  public filterMilitaryVesselClustersByTime(clusters: MilitaryVesselCluster[]): MilitaryVesselCluster[] {
    return clusters
      .map((cluster) => {
        const vessels = this.filterByTime(cluster.vessels ?? [], (vessel) => vessel.lastAisUpdate);
        if (vessels.length === 0) return null;
        return {
          ...cluster,
          vessels,
          vesselCount: vessels.length,
        };
      })
      .filter((cluster): cluster is MilitaryVesselCluster => cluster !== null);
  }

  private rebuildProtestSupercluster(source: SocialUnrestEvent[] = this.getFilteredProtests()): void {
    this.protestSuperclusterSource = source;
    const points = source.map((p, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
      properties: {
        index: i,
        country: p.country,
        severity: p.severity,
        eventType: p.eventType,
        validated: Boolean(p.validated),
        fatalities: Number.isFinite(p.fatalities) ? Number(p.fatalities) : 0,
      },
    }));
    this.protestSC = new Supercluster({
      radius: 60,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        maxSeverityRank: props.severity === 'high' ? 2 : props.severity === 'medium' ? 1 : 0,
        riotCount: props.eventType === 'riot' ? 1 : 0,
        highSeverityCount: props.severity === 'high' ? 1 : 0,
        verifiedCount: props.validated ? 1 : 0,
        totalFatalities: Number(props.fatalities ?? 0) || 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.maxSeverityRank = Math.max(Number(acc.maxSeverityRank ?? 0), Number(props.maxSeverityRank ?? 0));
        acc.riotCount = Number(acc.riotCount ?? 0) + Number(props.riotCount ?? 0);
        acc.highSeverityCount = Number(acc.highSeverityCount ?? 0) + Number(props.highSeverityCount ?? 0);
        acc.verifiedCount = Number(acc.verifiedCount ?? 0) + Number(props.verifiedCount ?? 0);
        acc.totalFatalities = Number(acc.totalFatalities ?? 0) + Number(props.totalFatalities ?? 0);
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.protestSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechHQSupercluster(): void {
    const points = TECH_HQS.map((h, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] as [number, number] },
      properties: {
        index: i,
        city: h.city,
        country: h.country,
        type: h.type,
      },
    }));
    this.techHQSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        city: String(props.city ?? ''),
        country: String(props.country ?? ''),
        faangCount: props.type === 'faang' ? 1 : 0,
        unicornCount: props.type === 'unicorn' ? 1 : 0,
        publicCount: props.type === 'public' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.faangCount = Number(acc.faangCount ?? 0) + Number(props.faangCount ?? 0);
        acc.unicornCount = Number(acc.unicornCount ?? 0) + Number(props.unicornCount ?? 0);
        acc.publicCount = Number(acc.publicCount ?? 0) + Number(props.publicCount ?? 0);
        if (!acc.city && props.city) acc.city = props.city;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techHQSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechEventSupercluster(source: TechEventMarker[] = this.filterByTime(this.techEvents, e => e.startDate)): void {
    const points = source.map((e, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] as [number, number] },
      properties: {
        index: i,
        location: e.location,
        country: e.country,
        daysUntil: e.daysUntil,
      },
    }));
    this.techEventSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => {
        const daysUntil = Number(props.daysUntil ?? Number.MAX_SAFE_INTEGER);
        return {
          index: Number(props.index ?? 0),
          location: String(props.location ?? ''),
          country: String(props.country ?? ''),
          soonestDaysUntil: Number.isFinite(daysUntil) ? daysUntil : Number.MAX_SAFE_INTEGER,
          soonCount: Number.isFinite(daysUntil) && daysUntil <= 14 ? 1 : 0,
        };
      },
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.soonestDaysUntil = Math.min(
          Number(acc.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
          Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
        );
        acc.soonCount = Number(acc.soonCount ?? 0) + Number(props.soonCount ?? 0);
        if (!acc.location && props.location) acc.location = props.location;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techEventSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildDatacenterSupercluster(): void {
    const activeDCs = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');
    const points = activeDCs.map((dc, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [dc.lon, dc.lat] as [number, number] },
      properties: {
        index: i,
        country: dc.country,
        chipCount: dc.chipCount,
        powerMW: dc.powerMW ?? 0,
        status: dc.status,
      },
    }));
    this.datacenterSC = new Supercluster({
      radius: 70,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        totalChips: Number(props.chipCount ?? 0) || 0,
        totalPowerMW: Number(props.powerMW ?? 0) || 0,
        existingCount: props.status === 'existing' ? 1 : 0,
        plannedCount: props.status === 'planned' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.totalChips = Number(acc.totalChips ?? 0) + Number(props.totalChips ?? 0);
        acc.totalPowerMW = Number(acc.totalPowerMW ?? 0) + Number(props.totalPowerMW ?? 0);
        acc.existingCount = Number(acc.existingCount ?? 0) + Number(props.existingCount ?? 0);
        acc.plannedCount = Number(acc.plannedCount ?? 0) + Number(props.plannedCount ?? 0);
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.datacenterSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildMilitaryFlightSupercluster(source: MilitaryFlight[] = this.militaryFlights): void {
    this.militaryFlightSuperclusterSource = source;
    const points = source.map((f, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] as [number, number] },
      properties: {
        index: i,
        country: f.operatorCountry || '',
        operator: f.operator || '',
      },
    }));
    this.militaryFlightSC = new Supercluster({
      radius: 65,
      maxZoom: 7,
      map: (props: Record<string, unknown>) => ({
        country: String(props.country ?? ''),
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.militaryFlightSC.load(points);
  }

  private rebuildMilitaryVesselSupercluster(source: MilitaryVessel[] = this.militaryVessels): void {
    this.militaryVesselSuperclusterSource = source;
    const points = source.map((v, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] as [number, number] },
      properties: {
        index: i,
        country: v.operatorCountry || (v.operator === 'usn' ? 'USA' : ''),
        operator: v.operator || '',
      },
    }));
    this.militaryVesselSC = new Supercluster({
      radius: 65,
      maxZoom: 7,
      map: (props: Record<string, unknown>) => ({
        country: String(props.country ?? ''),
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.militaryVesselSC.load(points);
  }

  private getDynamicMilitaryFlightClusters(zoom: number): MapMilitaryClusterItem[] {
    if (!this.militaryFlightSC || this.militaryFlightSuperclusterSource.length === 0) return [];
    const scZoom = Math.max(0, Math.min(7, Math.floor(zoom)));
    const clusters = this.militaryFlightSC.getClusters([-180, -85, 180, 85], scZoom);
    return clusters.map(f => {
      const coords = f.geometry.coordinates as [number, number];
      if (f.properties.cluster) {
        const clusterId = f.properties.cluster_id!;
        const leaves = this.militaryFlightSC!.getLeaves(clusterId, 100);
        const items = leaves.map(l => this.militaryFlightSuperclusterSource[l.properties.index]).filter((x): x is MilitaryFlight => !!x);
        return {
          id: `mfc-${clusterId}`,
          lat: coords[1],
          lon: coords[0],
          count: Number(f.properties.point_count || items.length),
          type: 'air' as const,
          country: items[0]?.operatorCountry,
          items,
        };
      }
      const item = this.militaryFlightSuperclusterSource[f.properties.index]!;
      return {
        id: `mfp-${f.properties.index}`,
        lat: item.lat,
        lon: item.lon,
        count: 1,
        type: 'air' as const,
        country: item.operatorCountry,
        items: [item],
      };
    });
  }

  private getDynamicMilitaryVesselClusters(zoom: number): MapMilitaryClusterItem[] {
    if (!this.militaryVesselSC || this.militaryVesselSuperclusterSource.length === 0) return [];
    const scZoom = Math.max(0, Math.min(7, Math.floor(zoom)));
    const clusters = this.militaryVesselSC.getClusters([-180, -85, 180, 85], scZoom);
    return clusters.map(f => {
      const coords = f.geometry.coordinates as [number, number];
      if (f.properties.cluster) {
        const clusterId = f.properties.cluster_id!;
        const leaves = this.militaryVesselSC!.getLeaves(clusterId, 100);
        const items = leaves.map(l => this.militaryVesselSuperclusterSource[l.properties.index]).filter((x): x is MilitaryVessel => !!x);
        return {
          id: `mvc-${clusterId}`,
          lat: coords[1],
          lon: coords[0],
          count: Number(f.properties.point_count || items.length),
          type: 'naval' as const,
          country: items[0]?.operatorCountry,
          items,
        };
      }
      const item = this.militaryVesselSuperclusterSource[f.properties.index]!;
      return {
        id: `mvp-${f.properties.index}`,
        lat: item.lat,
        lon: item.lon,
        count: 1,
        type: 'naval' as const,
        country: item.operatorCountry,
        items: [item],
      };
    });
  }

  private updateClusterData(): void {
    const zoom = Math.floor(this.maplibreMap?.getZoom() ?? 2);
    const bounds = this.maplibreMap?.getBounds();
    if (!bounds) return;
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ];
    const boundsKey = `${bbox[0].toFixed(4)}:${bbox[1].toFixed(4)}:${bbox[2].toFixed(4)}:${bbox[3].toFixed(4)}`;
    const layers = this.state.layers;
    const useProtests = layers.protests && this.protestSuperclusterSource.length > 0;
    const useTechHQ = SITE_VARIANT === 'tech' && layers.techHQs;
    const useTechEvents = SITE_VARIANT === 'tech' && layers.techEvents && this.techEvents.length > 0;
    const useDatacenterClusters = layers.datacenters && zoom < 5;
    const layerMask = `${Number(useProtests)}${Number(useTechHQ)}${Number(useTechEvents)}${Number(useDatacenterClusters)}`;
    if (zoom === this.lastSCZoom && boundsKey === this.lastSCBoundsKey && layerMask === this.lastSCMask) return;
    this.lastSCZoom = zoom;
    this.lastSCBoundsKey = boundsKey;
    this.lastSCMask = layerMask;

    if (useProtests && this.protestSC) {
      this.protestClusters = this.protestSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const leaves = this.protestSC!.getLeaves(f.properties.cluster_id!, DeckGLMap.MAX_CLUSTER_LEAVES);
          const items = leaves.map(l => this.protestSuperclusterSource[l.properties.index]).filter((x): x is SocialUnrestEvent => !!x);
          const maxSeverityRank = Number(props.maxSeverityRank ?? 0);
          const maxSev = maxSeverityRank >= 2 ? 'high' : maxSeverityRank === 1 ? 'medium' : 'low';
          const riotCount = Number(props.riotCount ?? 0);
          const highSeverityCount = Number(props.highSeverityCount ?? 0);
          const verifiedCount = Number(props.verifiedCount ?? 0);
          const totalFatalities = Number(props.totalFatalities ?? 0);
          const clusterCount = Number(f.properties.point_count ?? items.length);
          const latestRiotEventTimeMs = items.reduce((max, it) => {
            if (it.eventType !== 'riot' || it.sourceType === 'gdelt') return max;
            const ts = it.time.getTime();
            return Number.isFinite(ts) ? Math.max(max, ts) : max;
          }, 0);
          return {
            id: `pc-${f.properties.cluster_id}`,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items,
            country: String(props.country ?? items[0]?.country ?? ''),
            maxSeverity: maxSev as 'low' | 'medium' | 'high',
            hasRiot: riotCount > 0,
            latestRiotEventTimeMs: latestRiotEventTimeMs || undefined,
            totalFatalities,
            riotCount,
            highSeverityCount,
            verifiedCount,
            sampled: items.length < clusterCount,
          };
        }
        const item = this.protestSuperclusterSource[f.properties.index]!;
        return {
          id: `pp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], country: item.country,
          maxSeverity: item.severity, hasRiot: item.eventType === 'riot',
          latestRiotEventTimeMs:
            item.eventType === 'riot' && item.sourceType !== 'gdelt' && Number.isFinite(item.time.getTime())
              ? item.time.getTime()
              : undefined,
          totalFatalities: item.fatalities ?? 0,
          riotCount: item.eventType === 'riot' ? 1 : 0,
          highSeverityCount: item.severity === 'high' ? 1 : 0,
          verifiedCount: item.validated ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.protestClusters = [];
    }

    if (useTechHQ && this.techHQSC) {
      this.techHQClusters = this.techHQSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const leaves = this.techHQSC!.getLeaves(f.properties.cluster_id!, DeckGLMap.MAX_CLUSTER_LEAVES);
          const items = leaves.map(l => TECH_HQS[l.properties.index]).filter(Boolean) as typeof TECH_HQS;
          const faangCount = Number(props.faangCount ?? 0);
          const unicornCount = Number(props.unicornCount ?? 0);
          const publicCount = Number(props.publicCount ?? 0);
          const clusterCount = Number(f.properties.point_count ?? items.length);
          const primaryType = faangCount >= unicornCount && faangCount >= publicCount
            ? 'faang'
            : unicornCount >= publicCount
              ? 'unicorn'
              : 'public';
          return {
            id: `hc-${f.properties.cluster_id}`,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items,
            city: String(props.city ?? items[0]?.city ?? ''),
            country: String(props.country ?? items[0]?.country ?? ''),
            primaryType,
            faangCount,
            unicornCount,
            publicCount,
            sampled: items.length < clusterCount,
          };
        }
        const item = TECH_HQS[f.properties.index]!;
        return {
          id: `hp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], city: item.city, country: item.country,
          primaryType: item.type,
          faangCount: item.type === 'faang' ? 1 : 0,
          unicornCount: item.type === 'unicorn' ? 1 : 0,
          publicCount: item.type === 'public' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techHQClusters = [];
    }

    if (useTechEvents && this.techEventSC) {
      this.techEventClusters = this.techEventSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const leaves = this.techEventSC!.getLeaves(f.properties.cluster_id!, DeckGLMap.MAX_CLUSTER_LEAVES);
          const items = leaves.map(l => this.techEvents[l.properties.index]).filter((x): x is TechEventMarker => !!x);
          const clusterCount = Number(f.properties.point_count ?? items.length);
          const soonestDaysUntil = Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER);
          const soonCount = Number(props.soonCount ?? 0);
          return {
            id: `ec-${f.properties.cluster_id}`,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items,
            location: String(props.location ?? items[0]?.location ?? ''),
            country: String(props.country ?? items[0]?.country ?? ''),
            soonestDaysUntil: Number.isFinite(soonestDaysUntil) ? soonestDaysUntil : Number.MAX_SAFE_INTEGER,
            soonCount,
            sampled: items.length < clusterCount,
          };
        }
        const item = this.techEvents[f.properties.index]!;
        return {
          id: `ep-${f.properties.index}`, lat: item.lat, lon: item.lng,
          count: 1, items: [item], location: item.location, country: item.country,
          soonestDaysUntil: item.daysUntil,
          soonCount: item.daysUntil <= 14 ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techEventClusters = [];
    }

    if (useDatacenterClusters && this.datacenterSC) {
      const activeDCs = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');
      this.datacenterClusters = this.datacenterSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const leaves = this.datacenterSC!.getLeaves(f.properties.cluster_id!, DeckGLMap.MAX_CLUSTER_LEAVES);
          const items = leaves.map(l => activeDCs[l.properties.index]).filter((x): x is AIDataCenter => !!x);
          const clusterCount = Number(f.properties.point_count ?? items.length);
          const existingCount = Number(props.existingCount ?? 0);
          const plannedCount = Number(props.plannedCount ?? 0);
          const totalChips = Number(props.totalChips ?? 0);
          const totalPowerMW = Number(props.totalPowerMW ?? 0);
          return {
            id: `dc-${f.properties.cluster_id}`,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items,
            region: String(props.country ?? items[0]?.country ?? ''),
            country: String(props.country ?? items[0]?.country ?? ''),
            totalChips,
            totalPowerMW,
            majorityExisting: existingCount >= Math.max(1, clusterCount / 2),
            existingCount,
            plannedCount,
            sampled: items.length < clusterCount,
          };
        }
        const item = activeDCs[f.properties.index]!;
        return {
          id: `dp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], region: item.country, country: item.country,
          totalChips: item.chipCount, totalPowerMW: item.powerMW ?? 0,
          majorityExisting: item.status === 'existing',
          existingCount: item.status === 'existing' ? 1 : 0,
          plannedCount: item.status === 'planned' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.datacenterClusters = [];
    }
  }


  // ---- Day/Night terminator ----

  private computeNightPolygon(): [number, number][][] {
    const now = Date.now();
    if (this.cachedNightPolygon && now - this.cachedNightPolygonAt < 5 * 60 * 1000) {
      return this.cachedNightPolygon;
    }

    // Solar position
    const JD = now / 86400000 + 2440587.5;
    const n = JD - 2451545.0;
    const L = (280.46646 + 0.9856474 * n) % 360;
    const gRad = ((357.52911 + 0.9856003 * n) % 360) * (Math.PI / 180);
    const C = 1.914602 * Math.sin(gRad) + 0.019993 * Math.sin(2 * gRad) + 0.000289 * Math.sin(3 * gRad);
    const sunLon = (L + C) % 360;
    const obliqRad = 23.439291111 * (Math.PI / 180);
    const sunLonRad = sunLon * (Math.PI / 180);
    const dec = Math.asin(Math.sin(obliqRad) * Math.sin(sunLonRad)) * (180 / Math.PI);
    const ra = Math.atan2(Math.cos(obliqRad) * Math.sin(sunLonRad), Math.cos(sunLonRad)) * (180 / Math.PI);
    const GMST = (280.46061837 + 360.98564736629 * n) % 360;
    const subSolarLon = ((ra - GMST + 180) % 360 + 360) % 360 - 180;

    const decRad = dec * (Math.PI / 180);
    // Clamp tiny declination to avoid division by zero near equinox
    const tanDec = Math.tan(Math.abs(dec) < 0.1 ? (dec >= 0 ? 0.1 : -0.1) * Math.PI / 180 : decRad);

    // dec >= 0 → south pole in night; dec < 0 → north pole in night
    const poleLat: -90 | 90 = dec >= 0 ? -90 : 90;

    // Sweep longitude -180→+180, compute terminator latitude using Math.atan (NOT atan2).
    // Math.atan returns values in (-90°, 90°) giving a smooth curve.
    // Math.atan2 returns (-180°, 180°) which earcut clamps to ±90°, producing step-function bars.
    const step = 1; // 1° longitude steps for smooth curve
    const terminator: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += step) {
      const H = (lon - subSolarLon) * (Math.PI / 180);
      // Correct formula: lat = atan(-cos(H) / tan(dec))
      const lat = Math.atan(-Math.cos(H) / tanDec) * (180 / Math.PI);
      terminator.push([lon, lat]);
    }

    // Build two polygons split at lon=0 (each ≤180° wide for Deck.gl earcut).
    // The night region is NORTH of the terminator curve when poleLat=+90 (dec<0),
    // and SOUTH of the curve when poleLat=-90 (dec>=0).
    // Both cases: close the polygon by adding [±180, poleLat] corners.
    const midIdx = terminator.findIndex(([lon]) => lon >= 0);
    const westTerm = terminator.slice(0, midIdx + 1); // lon -180→0
    const eastTerm = terminator.slice(midIdx);         // lon 0→+180

    const westFirst = westTerm[0] ?? [-180, 0];
    const eastFirst = eastTerm[0] ?? [0, 0];

    const westPoly: [number, number][] = [
      ...westTerm,
      [0, poleLat],
      [-180, poleLat],
      westFirst,
    ];
    const eastPoly: [number, number][] = [
      ...eastTerm,
      [180, poleLat],
      [0, poleLat],
      eastFirst,
    ];

    const polygons: [number, number][][] = [westPoly, eastPoly];
    this.cachedNightPolygon = polygons;
    this.cachedNightPolygonAt = now;
    return polygons;
  }

  private createDayNightLayer(): PolygonLayer {
    const polygons = this.computeNightPolygon();
    const isLight = getCurrentTheme() === 'light';
    const fillColor: [number, number, number, number] = isLight
      ? [10, 20, 60, 50]
      : [0, 0, 20, 90];
    return new PolygonLayer({
      id: 'day-night-layer',
      data: polygons,
      getPolygon: (d) => d,
      getFillColor: fillColor,
      getLineColor: [0, 0, 0, 0],
      stroked: false,
      filled: true,
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: { getFillColor: isLight, getPolygon: this.cachedNightPolygonAt },
    });
  }

  private startDayNightTimer(): void {
    if (this.dayNightIntervalId) return;
    const MS_5MIN = 5 * 60 * 1000;
    this.dayNightIntervalId = setInterval(() => {
      if (!this.state.layers.dayNight) return;
      // Force recompute by invalidating cache
      this.cachedNightPolygon = null;
      this.render();
    }, MS_5MIN);
  }

  private stopDayNightTimer(): void {
    if (this.dayNightIntervalId) {
      clearInterval(this.dayNightIntervalId);
      this.dayNightIntervalId = null;
    }
  }

  private startThreatDecayTimer(): void {
    if (this.threatDecayIntervalId) return;
    const MS_1MIN = 60 * 1000;
    this.threatDecayIntervalId = setInterval(() => {
      if (!this.state.layers.threatScore) return;
      this.render(); // Trigger re-render to recalculate decaying threats
    }, MS_1MIN);
  }

  private isLayerVisible(layerKey: keyof MapLayers): boolean {
    const threshold = LAYER_ZOOM_THRESHOLDS[layerKey];
    if (!threshold) return true;
    const zoom = this.maplibreMap?.getZoom() || 2;
    return zoom >= threshold.minZoom;
  }

  private buildLayers(): LayersList {
    const startTime = performance.now();
    const layers: (Layer | null | false)[] = [];
    const { layers: mapLayers } = this.state;
    const filteredEarthquakes = this.filterByTime(this.earthquakes, (eq) => eq.occurredAt);
    const filteredNaturalEvents = this.filterByTime(this.naturalEvents, (event) => event.date);
    const filteredWeatherAlerts = this.filterByTime(this.weatherAlerts, (alert) => alert.onset);
    const filteredOutages = this.filterByTime(this.outages, (outage) => outage.pubDate);
    const filteredCableAdvisories = this.filterByTime(this.cableAdvisories, (advisory) => advisory.reported);
    const filteredFlightDelays = this.filterByTime(this.flightDelays, (delay) => delay.updatedAt);
    const filteredMilitaryFlights = this.filterByTime(this.militaryFlights, (flight) => flight.lastSeen);
    const filteredMilitaryVessels = this.filterByTime(this.militaryVessels, (vessel) => vessel.lastAisUpdate);
    const filteredUcdpEvents = this.filterByTime(this.ucdpEvents, (event) => event.date_start);
    const filteredCyberThreats = this.filterByTime(this.cyberThreats, (threat) => threat.lastSeen || threat.firstSeen);
    const filteredFires = this.filterByTime(this.firmsFireData, (fire) => fire.acq_date);
    const filteredAqi = this.filterByTime(this.aqiData, (aqi) => aqi.station.time);
    const filteredSpeciesRecovery = this.filterByTime(this.speciesRecoveryZones, (zone) => zone.lastUpdated);
    const filteredNewsLocations = this.filterByTime(this.newsLocations, (loc) => loc.timestamp);

    // Day/Night terminator layer — rendered first (background, behind everything)
    if (mapLayers.dayNight) {
      layers.push(this.createDayNightLayer());
    }

    // Water Surface Temperature layer is managed in MapLibre beneath the weather radar layer.
    // Falls back to DeckGL if MapLibre is not initialized.
    if (mapLayers.waterTemperature) {
      if (!this.maplibreMap) {
        layers.push(this.createWaterTemperatureLayer());
      }
    }

    if (mapLayers.alertStatus) {
      const alertLayer = this.createAlertStatusLayer();
      if (alertLayer) layers.push(alertLayer);
    }

    if (mapLayers.agriculturalStressDI) {
      layers.push(this.createAgriculturalStressLayer('DI_A', 'di', AGRICULTURAL_LAYER_OPACITY));
    }
    if (mapLayers.agriculturalStressASI) {
      layers.push(this.createAgriculturalStressLayer('ASI_A', 'asi', AGRICULTURAL_LAYER_OPACITY));
    }
    if (mapLayers.agriculturalStressVCI) {
      layers.push(this.createAgriculturalStressLayer('VCI_M', 'vci', VEGETATION_LAYER_OPACITY));
    }

    // Undersea cables layer
    if (mapLayers.cables) {
      layers.push(this.createCablesLayer());
    } else {
      this.layerCache.delete('cables-layer');
    }

    // Pipelines layer
    if (mapLayers.pipelines) {
      layers.push(this.createPipelinesLayer());
    } else {
      this.layerCache.delete('pipelines-layer');
    }

    // Conflict zones layer
    if (mapLayers.conflicts) {
      layers.push(this.createConflictZonesLayer());
    }

    // Military bases layer — hidden at low zoom (E: progressive disclosure) + ghost
    if (mapLayers.bases && this.isLayerVisible('bases')) {
      layers.push(this.createBasesLayer());
      layers.push(this.createGhostLayer('bases-layer', MILITARY_BASES, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // Nuclear facilities layer — hidden at low zoom + ghost
    if (mapLayers.nuclear && this.isLayerVisible('nuclear')) {
      layers.push(this.createNuclearLayer());
      layers.push(this.createGhostLayer('nuclear-layer', NUCLEAR_FACILITIES.filter(f => f.status !== 'decommissioned'), d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // Gamma irradiators layer — hidden at low zoom
    if (mapLayers.irradiators && this.isLayerVisible('irradiators')) {
      layers.push(this.createIrradiatorsLayer());
      layers.push(this.createGhostLayer('irradiators-layer', GAMMA_IRRADIATORS, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // Environmental Radiation monitoring layer (EPA RadNet + Chernobyl & Fukushima)
    if (mapLayers.radiation && this.radiationData.length > 0) {
      layers.push(this.createRadiationLayer(this.radiationData));
      layers.push(this.createGhostLayer('radiation-layer', this.radiationData, d => [d.lon, d.lat], { radiusMinPixels: 14 }));
    }

    // Spaceports layer — hidden at low zoom
    if (mapLayers.spaceports && this.isLayerVisible('spaceports')) {
      layers.push(this.createSpaceportsLayer());
      layers.push(this.createGhostLayer('spaceports-layer', SPACEPORTS, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // Hotspots layer (all hotspots including high/breaking, with pulse + ghost)
    if (mapLayers.hotspots) {
      layers.push(...this.createHotspotsLayers());
    }

    // Datacenters layer - SQUARE icons at zoom >= 5, cluster dots at zoom < 5
    const currentZoom = this.maplibreMap?.getZoom() || 2;
    if (mapLayers.datacenters) {
      if (currentZoom >= 5) {
        layers.push(this.createDatacentersLayer());
      } else {
        layers.push(...this.createDatacenterClusterLayers());
      }
    }

    // Earthquakes layer + ghost for easier picking
    if (mapLayers.natural && filteredEarthquakes.length > 0) {
      layers.push(this.createEarthquakesLayer(filteredEarthquakes));
      layers.push(this.createGhostLayer('earthquakes-layer', filteredEarthquakes, d => [d.location?.longitude ?? 0, d.location?.latitude ?? 0], { radiusMinPixels: 12 }));
    }

    // Natural events layer
    if (mapLayers.natural && filteredNaturalEvents.length > 0) {
      layers.push(this.createNaturalEventsLayer(filteredNaturalEvents));
    }

    // Satellite fires layer (NASA FIRMS)
    if (mapLayers.fires && filteredFires.length > 0) {
      layers.push(this.createFiresLayer(filteredFires));
    }

    // Weather alerts layer
    if (mapLayers.weather && filteredWeatherAlerts.length > 0) {
      layers.push(this.createWeatherLayer(filteredWeatherAlerts));
    }

    // Internet outages layer + ghost for easier picking
    if (mapLayers.outages && filteredOutages.length > 0) {
      layers.push(this.createOutagesLayer(filteredOutages));
      layers.push(this.createGhostLayer('outages-layer', filteredOutages, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // Cyber threat IOC layer
    if (mapLayers.cyberThreats && filteredCyberThreats.length > 0) {
      layers.push(this.createCyberThreatsLayer(filteredCyberThreats));
      layers.push(this.createGhostLayer('cyber-threats-layer', filteredCyberThreats, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // BGP Anomalies layer (Cloudflare Radar)
    if (mapLayers.bgpAnomalies && this.bgpAnomalies.length > 0) {
      layers.push(...this.createBgpAnomaliesLayers());
    }

    // AIS density layer
    if (mapLayers.ais && this.aisDensity.length > 0) {
      layers.push(this.createAisDensityLayer());
    }

    // AIS disruptions layer (spoofing/jamming)
    if (mapLayers.ais && this.aisDisruptions.length > 0) {
      layers.push(this.createAisDisruptionsLayer());
    }

    // Strategic ports layer (shown with AIS)
    if (mapLayers.ais) {
      layers.push(this.createPortsLayer());
    }

    // Cable advisories layer (shown with cables)
    if (mapLayers.cables && filteredCableAdvisories.length > 0) {
      layers.push(this.createCableAdvisoriesLayer(filteredCableAdvisories));
    }

    // Repair ships layer (shown with cables)
    if (mapLayers.cables && this.repairShips.length > 0) {
      layers.push(this.createRepairShipsLayer());
    }

    // Flight delays layer
    if (mapLayers.flights && filteredFlightDelays.length > 0) {
      layers.push(this.createFlightDelaysLayer(filteredFlightDelays));
    }

    // Protests layer (Supercluster-based deck.gl layers)
    if (mapLayers.protests && this.protests.length > 0) {
      layers.push(...this.createProtestClusterLayers());
    }

    // Military activity layers (vessels and flights) with wide-zoom grouping & seamless cross-fade
    if (mapLayers.military) {
      const currentZoom = this.maplibreMap?.getZoom() ?? this.state.zoom ?? 3;
      // Cross-fade between zoom 4.0 and 5.2
      // At zoom <= 4.0: clusterOpacity = 1.0, assetOpacity = 0.0 (clean translucent circles with counts)
      // At zoom >= 5.2: clusterOpacity = 0.0, assetOpacity = 1.0 (individual delta flights and warship hulls)
      // Between 4.0 and 5.2: smooth transition
      const clusterOpacity = Math.max(0, Math.min(1, (5.2 - currentZoom) / 1.2));
      const assetOpacity = Math.max(0, Math.min(1, (currentZoom - 4.0) / 1.2));

      // 1. Wide-zoom grouped circles
      if (clusterOpacity > 0.01) {
        if (this.militaryFlightSuperclusterSource !== filteredMilitaryFlights) {
          this.rebuildMilitaryFlightSupercluster(filteredMilitaryFlights);
        }
        if (this.militaryVesselSuperclusterSource !== filteredMilitaryVessels) {
          this.rebuildMilitaryVesselSupercluster(filteredMilitaryVessels);
        }
        const flightClusters = this.getDynamicMilitaryFlightClusters(currentZoom);
        const vesselClusters = this.getDynamicMilitaryVesselClusters(currentZoom);
        layers.push(...this.createMilitaryClusterLayers(flightClusters, vesselClusters, clusterOpacity));
      }

      // 2. Individual asset points (fade in smoothly as user zooms in)
      if (assetOpacity > 0.01) {
        if (filteredMilitaryVessels.length > 0) {
          layers.push(this.createMilitaryVesselsLayer(filteredMilitaryVessels, assetOpacity));
          layers.push(this.createGhostLayer('military-vessels-layer', filteredMilitaryVessels, d => [d.lon, d.lat], { radiusMinPixels: 14 }));
        }
        if (filteredMilitaryFlights.length > 0) {
          layers.push(this.createMilitaryFlightsLayer(filteredMilitaryFlights, assetOpacity));
          layers.push(this.createGhostLayer('military-flights-layer', filteredMilitaryFlights, d => [d.lon, d.lat], { radiusMinPixels: 14 }));
        }
      }
    }

    // Strategic waterways layer
    if (mapLayers.waterways) {
      layers.push(this.createWaterwaysLayer());
    }

    // Economic centers layer — hidden at low zoom
    if (mapLayers.economic && this.isLayerVisible('economic')) {
      layers.push(this.createEconomicCentersLayer());
    }

    // Finance variant layers
    if (mapLayers.stockExchanges) {
      layers.push(this.createStockExchangesLayer());
    }
    if (mapLayers.financialCenters) {
      layers.push(this.createFinancialCentersLayer());
    }
    if (mapLayers.centralBanks) {
      layers.push(this.createCentralBanksLayer());
    }
    if (mapLayers.commodityHubs) {
      layers.push(this.createCommodityHubsLayer());
    }

    // Critical minerals layer
    if (mapLayers.minerals) {
      layers.push(this.createMineralsLayer());
      layers.push(this.createGhostLayer('minerals-layer', CRITICAL_MINERALS, d => [d.lon, d.lat], { radiusMinPixels: 12 }));
    }

    // UCDP georeferenced events layer
    if (mapLayers.ucdpEvents && filteredUcdpEvents.length > 0) {
      layers.push(this.createUcdpEventsLayer(filteredUcdpEvents));
    }

    // Displacement flows arc layer
    if (mapLayers.displacement && this.displacementFlows.length > 0) {
      layers.push(this.createDisplacementArcsLayer());
    }

    // Climate anomalies layers
    if (mapLayers.climate && this.climateAnomalies.length > 0) {
      layers.push(...this.createClimateLayers());
    }

    // Trade routes layer
    if (mapLayers.tradeRoutes) {
      layers.push(this.createTradeRoutesLayer());
      layers.push(this.createTradeChokepointsLayer());
    } else {
      this.layerCache.delete('trade-routes-layer');
      this.layerCache.delete('trade-chokepoints-layer');
    }

    // Tech variant layers (Supercluster-based deck.gl layers for HQs and events)
    if (SITE_VARIANT === 'tech') {
      if (mapLayers.startupHubs) {
        layers.push(this.createStartupHubsLayer());
      }
      if (mapLayers.techHQs) {
        layers.push(...this.createTechHQClusterLayers());
      }
      if (mapLayers.accelerators) {
        layers.push(this.createAcceleratorsLayer());
      }
      if (mapLayers.cloudRegions) {
        layers.push(this.createCloudRegionsLayer());
      }
      if (mapLayers.techEvents && this.techEvents.length > 0) {
        layers.push(...this.createTechEventClusterLayers());
      }
    }

    // Gulf FDI investments layer
    if (mapLayers.gulfInvestments) {
      layers.push(this.createGulfInvestmentsLayer());
    }

    // Positive events layer (happy variant)
    if (mapLayers.positiveEvents && this.positiveEvents.length > 0) {
      layers.push(...this.createPositiveEventsLayers());
    }

    // Kindness layer (happy variant -- green baseline pulses + real kindness events)
    if (mapLayers.kindness && this.kindnessPoints.length > 0) {
      layers.push(...this.createKindnessLayers());
    }

    // Phase 8: Happiness choropleth (rendered below point markers)
    if (mapLayers.happiness) {
      const choropleth = this.createHappinessChoroplethLayer();
      if (choropleth) layers.push(choropleth);
    }
    // Phase 8: Species recovery zones
    if (mapLayers.speciesRecovery && filteredSpeciesRecovery.length > 0) {
      layers.push(this.createSpeciesRecoveryLayer(filteredSpeciesRecovery));
    }
    // Phase 8: Renewable energy installations
    if (mapLayers.renewableInstallations && this.renewableInstallations.length > 0) {
      layers.push(this.createRenewableInstallationsLayer());
    }

    // News geo-locations (always shown if data exists)
    if (filteredNewsLocations.length > 0) {
      layers.push(...this.createNewsLocationsLayer(filteredNewsLocations));
    }

    // Threat Score Layer
    if (mapLayers.threatScore) {
      if (this.news.length > 0 || this.newsLocations.length > 0) {
        layers.push(...this.createThreatScoreLayer());
      }
    }

    if (mapLayers.aqi && filteredAqi.length > 0) {
      layers.push(...this.createAqiLayers(filteredAqi));
    }

    if (mapLayers.gpsJamming && this.gpsJammingData.length > 0) {
      layers.push(this.createGpsJammingLayer());
    }

    const result = layers.filter(Boolean) as LayersList;

    const collisionExt = new CollisionFilterExtension();
    const collidableResult = result.map((layer: any) => {
      const type = layer?.constructor?.layerName;
      if (type === 'IconLayer' || type === 'TextLayer') {
        const isExempt = layer.id === 'military-flights-layer' || layer.id === 'military-vessels-layer' || layer.id === 'threat-score-layer' || layer.id === 'military-clusters-badge' || layer.id.startsWith('aqi-');
        if (isExempt) return layer;
        return layer.clone({
          extensions: [...(layer.props.extensions || []), collisionExt],
          collisionEnabled: true,
          collisionGroup: layer.id
        });
      }
      return layer;
    });

    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] buildLayers took ${elapsed.toFixed(2)}ms (>16ms budget), ${result.length} layers`);
    }
    return collidableResult as LayersList;
  }

  private async fetchAQIData(): Promise<void> {
    if (!this.maplibreMap) return;
    const bounds = this.maplibreMap.getBounds();
    const boundsStr = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    // Don't fetch if bounds haven't changed much or if currently fetching
    if (this.aqiFetchPending || this.lastAqiBounds === boundsStr) return;

    this.aqiFetchPending = true;
    this.lastAqiBounds = boundsStr;

    try {
      const response = await fetch(`/api/aqi?bounds=${boundsStr}`);
      if (response.ok) {
        const json = await response.json();
        if (json.status === 'ok' && json.data && json.data.length > 0) {
          // Filter out stations with invalid '-' AQI
          this.aqiData = json.data.filter((s: any) => s.aqi && s.aqi !== '-');
          this.render();
          return;
        }
      }
      // Fallback to baseline stations if upstream returns empty or token not configured
      if (this.aqiData.length === 0) {
        const { BASELINE_AQI_STATIONS } = await import('@/services/aqi');
        this.aqiData = BASELINE_AQI_STATIONS;
        this.render();
      }
    } catch (e) {
      console.error('[DeckGLMap] Failed to fetch AQI data:', e);
      if (this.aqiData.length === 0) {
        const { BASELINE_AQI_STATIONS } = await import('@/services/aqi');
        this.aqiData = BASELINE_AQI_STATIONS;
        this.render();
      }
    } finally {
      this.aqiFetchPending = false;
    }
  }

  private async fetchGpsJammingData(): Promise<void> {
    if (this.gpsJammingFetchPending) return;
    this.gpsJammingFetchPending = true;
    try {
      const { fetchGpsJammingData } = await import('@/services/gps-jamming');
      this.gpsJammingData = await fetchGpsJammingData();
      this.render();
    } catch (e) {
      console.error('[DeckGLMap] Failed to fetch GPS Jamming data:', e);
    } finally {
      this.gpsJammingFetchPending = false;
    }
  }

  private async fetchBgpAnomaliesData(): Promise<void> {
    if (this.bgpAnomaliesFetchPending) {
      console.debug('[DeckGLMap:BGP] Fetch already in progress, ignoring duplicate call.');
      return;
    }
    this.bgpAnomaliesFetchPending = true;
    try {
      console.debug('[DeckGLMap:BGP] Loading BGP routing anomalies module & initiating fetch...');
      const { fetchBgpAnomalies, isBgpAnomaliesConfigured } = await import('@/services/bgp-anomalies');
      this.bgpAnomalies = await fetchBgpAnomalies();

      if (this.bgpAnomalies.length === 0) {
        if (isBgpAnomaliesConfigured() === false) {
          console.warn(
            '%c[DeckGLMap:BGP]%c Layer is active, but Cloudflare Radar API token is not configured on the server. ' +
            'Provide CLOUDFLARE_RADAR_API_TOKEN in your Vercel environment variables to see active BGP hijacks/leaks.',
            'color: #f59e0b; font-weight: bold;',
            'color: inherit;'
          );
        } else {
          console.info('[DeckGLMap:BGP] Layer is active: 0 active routing anomalies reported for current time window.');
        }
      } else {
        console.debug(`[DeckGLMap:BGP] Fetched ${this.bgpAnomalies.length} anomaly items; triggering Deck.gl redraw.`);
      }

      this.render();
    } catch (e) {
      console.error(
        '%c[DeckGLMap:BGP]%c Failed to fetch or apply BGP anomalies:',
        'color: #ef4444; font-weight: bold;',
        'color: inherit;',
        {
          error: e,
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          isLayerVisible: Boolean(this.state.layers.bgpAnomalies),
          timestamp: new Date().toISOString(),
        }
      );
    } finally {
      this.bgpAnomaliesFetchPending = false;
    }
  }

  private getAqiSupercluster(aqiData: AQIStation[]): Supercluster {
    if (this.aqiSC && this.aqiSCSource === aqiData) {
      return this.aqiSC;
    }
    this.aqiSCSource = aqiData;

    const points = aqiData.map((s, index) => {
      const aqiNum = parseInt(s.aqi, 10);
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lon, s.lat] as [number, number],
        },
        properties: {
          index,
          uid: s.uid,
          aqiNum: isNaN(aqiNum) ? 0 : aqiNum,
          aqiSum: isNaN(aqiNum) ? 0 : aqiNum,
          minAqi: isNaN(aqiNum) ? 999 : aqiNum,
          maxAqi: isNaN(aqiNum) ? 0 : aqiNum,
          count: 1,
        },
      };
    });

    this.aqiSC = new Supercluster({
      radius: 80,
      maxZoom: 10,
      map: (props: any) => ({
        index: props.index,
        uid: props.uid,
        aqiNum: props.aqiNum,
        aqiSum: props.aqiNum,
        minAqi: props.aqiNum,
        maxAqi: props.aqiNum,
        count: 1,
      }),
      reduce: (acc: any, props: any) => {
        acc.aqiSum = (acc.aqiSum || 0) + (props.aqiSum || 0);
        acc.count = (acc.count || 0) + (props.count || 0);
        acc.minAqi = Math.min(acc.minAqi ?? 999, props.minAqi ?? 999);
        acc.maxAqi = Math.max(acc.maxAqi ?? 0, props.maxAqi ?? 0);
      },
    });

    this.aqiSC.load(points);
    return this.aqiSC;
  }

  private createAqiLayers(aqiData: AQIStation[]): Layer[] {
    const zoom = this.maplibreMap?.getZoom() ?? 2;
    const layers: Layer[] = [];

    // Fading transition:
    // zoom < 5.5: clusters fully visible (opacity 1.0), stations hidden (opacity 0.0)
    // 5.5 <= zoom <= 7.5: cross-fade between clusters and individual stations
    // zoom > 7.5: individual stations fully visible (opacity 1.0), clusters hidden
    const FADE_START_ZOOM = 5.5;
    const FADE_END_ZOOM = 7.5;
    const t = Math.max(0, Math.min(1, (zoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM)));
    const clusterOpacity = 1 - t;
    const stationOpacity = t;

    const clusterBubbles: AQIClusterData[] = [];
    const isolatedStations: AQIStation[] = [];

    if (clusterOpacity > 0.01) {
      const sc = this.getAqiSupercluster(aqiData);
      const scZoom = Math.max(0, Math.min(10, Math.floor(zoom)));
      const rawClusters = sc.getClusters([-180, -85, 180, 85], scZoom);

      for (const f of rawClusters) {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const clusterId = f.properties.cluster_id!;
          const leaves = sc.getLeaves(clusterId, 500);
          const items = leaves.map(l => aqiData[l.properties.index]).filter((s): s is AQIStation => !!s);
          const count = items.length;
          const validNums = items.map(s => parseInt(s.aqi, 10)).filter(n => !isNaN(n));
          const avgAqi = validNums.length > 0 ? Math.round(validNums.reduce((a, b) => a + b, 0) / validNums.length) : 0;
          const minAqi = validNums.length > 0 ? Math.min(...validNums) : avgAqi;
          const maxAqi = validNums.length > 0 ? Math.max(...validNums) : avgAqi;
          const variedItems = getMostVariedStations(items, 10);

          clusterBubbles.push({
            id: `aqi-cluster-${clusterId}`,
            lat: coords[1],
            lon: coords[0],
            count,
            avgAqi,
            minAqi,
            maxAqi,
            items,
            variedItems,
          });
        } else {
          const item = aqiData[f.properties.index];
          if (item) isolatedStations.push(item);
        }
      }
    }

    // 1. Averaged regional cluster bubbles (larger bubbles with "Avg. AQI")
    if (clusterOpacity > 0.01 && clusterBubbles.length > 0) {
      const clusterScatterLayer = new ScatterplotLayer<AQIClusterData>({
        id: 'aqi-clusters-layer',
        data: clusterBubbles,
        getPosition: d => [d.lon, d.lat],
        getFillColor: d => getAqiColorRgba(d.avgAqi, clusterOpacity),
        getRadius: 35000,
        radiusMinPixels: 28,
        radiusMaxPixels: 52,
        stroked: true,
        filled: true,
        getLineColor: [255, 255, 255, Math.round(200 * clusterOpacity)],
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        pickable: clusterOpacity > 0.35,
      });

      const clusterLabelLayer = new TextLayer<AQIClusterData>({
        id: 'aqi-cluster-label-layer',
        data: clusterBubbles,
        getPosition: d => [d.lon, d.lat],
        getText: () => 'Avg. AQI',
        getSize: 9,
        getColor: [255, 255, 255, Math.round(230 * clusterOpacity)],
        getPixelOffset: [0, -8],
        getAlignmentBaseline: 'center',
        getTextAnchor: 'middle',
        fontWeight: 700,
        parameters: { depthCompare: 'always' },
        pickable: false,
      });

      const clusterValueLayer = new TextLayer<AQIClusterData>({
        id: 'aqi-cluster-value-layer',
        data: clusterBubbles,
        getPosition: d => [d.lon, d.lat],
        getText: d => String(d.avgAqi),
        getSize: 15,
        getColor: [255, 255, 255, Math.round(255 * clusterOpacity)],
        getPixelOffset: [0, 8],
        getAlignmentBaseline: 'center',
        getTextAnchor: 'middle',
        fontWeight: 800,
        parameters: { depthCompare: 'always' },
        pickable: false,
      });

      layers.push(clusterScatterLayer, clusterLabelLayer, clusterValueLayer);
    }

    // 2. Individual station bubbles
    // When stationOpacity > 0.01: show all stations fading in
    // When stationOpacity <= 0.01 and clusterOpacity > 0.01: show isolated stations (count === 1)
    const renderAllStations = stationOpacity > 0.01;
    const activeStationData = renderAllStations ? aqiData : isolatedStations;
    const activeStationOpacity = renderAllStations ? stationOpacity : clusterOpacity;

    if (activeStationOpacity > 0.01 && activeStationData.length > 0) {
      const stationScatterLayer = new ScatterplotLayer<AQIStation>({
        id: 'aqi-bubbles-layer',
        data: activeStationData,
        getPosition: d => [d.lon, d.lat],
        getFillColor: d => getAqiColorRgba(d.aqi, activeStationOpacity),
        getRadius: 15000,
        radiusMinPixels: 14,
        radiusMaxPixels: 28,
        stroked: true,
        filled: true,
        getLineColor: [255, 255, 255, Math.round(140 * activeStationOpacity)],
        getLineWidth: 1.5,
        lineWidthUnits: 'pixels',
        pickable: activeStationOpacity > 0.35,
      });

      const stationTextLayer = new TextLayer<AQIStation>({
        id: 'aqi-text-layer',
        data: activeStationData,
        getPosition: d => [d.lon, d.lat],
        getText: d => String(d.aqi),
        getSize: 12,
        getColor: [255, 255, 255, Math.round(255 * activeStationOpacity)],
        getAlignmentBaseline: 'center',
        getTextAnchor: 'middle',
        fontWeight: 700,
        parameters: { depthCompare: 'always' },
        pickable: false,
      });

      layers.push(stationScatterLayer, stationTextLayer);
    }

    return layers;
  }

  private createAgriculturalStressLayer(service: string, id: string, opacity: number = AGRICULTURAL_LAYER_OPACITY): TileLayer {
    return new TileLayer({
      id: `agricultural-stress-${id}-layer`,
      minZoom: 0,
      maxZoom: 8,
      tileSize: 256,
      opacity,
      getTileData: async (props: any) => {
        const { bbox } = props;
        if (!bbox) return null;
        const url = `/api/asis?service=${service}&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch tile');
        const blob = await response.blob();
        return createImageBitmap(blob);
      },
      renderSubLayers: (props: any) => {
        const { boundingBox } = props.tile;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
          // Optional: If the FAO tiles have a solid white background covering the map, uncomment the line below:
          // transparentColor: [255, 255, 255, 255]
        });
      },
      pickable: false,
    });
  }

  private createWaterTemperatureLayer(opacity: number = 0.72): TileLayer {
    return new TileLayer({
      id: 'water-temperature-layer',
      data: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
      minZoom: 0,
      maxZoom: 7,
      tileSize: 256,
      opacity,
      getTileData: async (tile: any) => {
        const { x, y, z } = tile.index || {};
        if (x == null || y == null || z == null) return null;
        const clampedZ = Math.min(Math.max(z, 0), 7);
        const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/default/GoogleMapsCompatible_Level7/${clampedZ}/${y}/${x}.png`;
        try {
          const response = await fetch(url, { signal: tile.signal });
          if (!response.ok) return null;
          const blob = await response.blob();
          return typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : null;
        } catch {
          return null;
        }
      },
      renderSubLayers: (props: any) => {
        if (!props.data) return null;
        const { boundingBox } = props.tile;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
        });
      },
      pickable: false,
    });
  }

  private updateWaterTemperatureLayer(enabled: boolean): void {
    if (!this.maplibreMap) return;
    if (!this.maplibreMap.isStyleLoaded()) {
      this.maplibreMap.once('style.load', () => this.updateWaterTemperatureLayer(enabled));
      return;
    }

    const SOURCE_ID = 'sea-surface-temperature-source';
    const LAYER_ID = 'sea-surface-temperature-layer';

    try {
      if (enabled) {
        if (!this.maplibreMap.getSource(SOURCE_ID)) {
          this.maplibreMap.addSource(SOURCE_ID, {
            type: 'raster',
            tiles: [
              'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png',
            ],
            tileSize: 256,
            maxzoom: 7,
            attribution: 'NASA GIBS (MUR L4 SST)',
          });
        }

        // Target insertion before weather radar layers so weather radar always renders above SST
        const beforeLayerId = this.maplibreMap.getLayer('maptiler-pressure')
          ? 'maptiler-pressure'
          : this.maplibreMap.getLayer('maptiler-precipitation')
            ? 'maptiler-precipitation'
            : this.maplibreMap.getLayer('maptiler-radar')
              ? 'maptiler-radar'
              : this.maplibreMap.getLayer('country-hover-fill')
                ? 'country-hover-fill'
                : undefined;

        if (!this.maplibreMap.getLayer(LAYER_ID)) {
          this.maplibreMap.addLayer(
            {
              id: LAYER_ID,
              type: 'raster',
              source: SOURCE_ID,
              paint: {
                'raster-opacity': 0.72,
                'raster-fade-duration': 150,
              },
            },
            beforeLayerId
          );
        } else if (beforeLayerId) {
          try {
            this.maplibreMap.moveLayer(LAYER_ID, beforeLayerId);
          } catch { /* ignore */ }
        }
      } else {
        if (this.maplibreMap.getLayer(LAYER_ID)) {
          this.maplibreMap.removeLayer(LAYER_ID);
        }
        if (this.maplibreMap.getSource(SOURCE_ID)) {
          this.maplibreMap.removeSource(SOURCE_ID);
        }
      }
    } catch (err) {
      console.warn('[DeckGLMap] Failed to update sea surface temperature layer:', err);
    }
  }

  private createGpsJammingLayer(): HeatmapLayer {
    return new HeatmapLayer<import('@/services/gps-jamming').GpsJammingPoint>({
      id: 'gps-jamming-heatmap-layer',
      data: this.gpsJammingData,
      getPosition: d => [d[0], d[1]],
      getWeight: d => d[2],
      radiusPixels: 60,
      intensity: 4,
      threshold: 0.01,
      colorRange: [
        [255, 255, 178],
        [254, 204, 92],
        [253, 141, 60],
        [240, 59, 32],
        [189, 0, 38]
      ],
      pickable: false
    });
  }

  // Layer creation methods
  private createThreatScoreLayer(): Layer[] {
    const regionalThreats = calculateRegionalThreats(this.newsLocations);
    if (regionalThreats.length === 0) return [];

    const iconLayer = new IconLayer<RegionalThreat>({
      id: 'threat-score-layer',
      data: regionalThreats,
      getPosition: (d: RegionalThreat) => [d.lon, d.lat],
      getIcon: () => 'octagon',
      iconAtlas: MARKER_ICONS.octagon,
      iconMapping: { octagon: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d: RegionalThreat) => {
        return Math.max(14, Math.min(32, 14 + d.threatScore * 6));
      },
      getColor: (d: RegionalThreat) => {
        const t = d.threatScore;
        if (t < 0.5) return [34, 197, 94, 220];   // Low: Green
        if (t < 1.0) return [234, 179, 8, 225];   // Medium: Yellow
        if (t < 1.5) return [249, 115, 22, 230];  // High: Orange
        if (t < 3.0) return [239, 68, 68, 240];   // Critical: Red
        return [185, 28, 28, 245];                // Extreme: Deep Crimson
      },
      sizeScale: 1,
      sizeMinPixels: 10,
      sizeMaxPixels: 36,
      pickable: true,
      updateTriggers: {
        getColor: [this.newsLocations.length, Date.now()],
        getSize: [this.newsLocations.length, Date.now()]
      }
    });

    const ghostLayer = this.createGhostLayer(
      'threat-score-layer',
      regionalThreats,
      (d: RegionalThreat) => [d.lon, d.lat],
      { radiusMinPixels: 16 }
    );

    return [iconLayer, ghostLayer];
  }

  private createCablesLayer(): PathLayer {
    const highlightedCables = this.highlightedAssets.cable;
    const cacheKey = 'cables-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedCables);
    const healthSignature = Object.keys(this.healthByCableId).sort().join(',');
    if (cached && highlightSignature === this.lastCableHighlightSignature && healthSignature === this.lastCableHealthSignature) return cached;

    const health = this.healthByCableId;
    const layer = new PathLayer({
      id: cacheKey,
      data: UNDERSEA_CABLES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedCables.has(d.id)) return COLORS.cableHighlight;
        const h = health[d.id];
        if (h?.status === 'fault') return COLORS.cableFault;
        if (h?.status === 'degraded') return COLORS.cableDegraded;
        return COLORS.cable;
      },
      getWidth: (d) => {
        if (highlightedCables.has(d.id)) return 3;
        const h = health[d.id];
        if (h?.status === 'fault') return 2.5;
        if (h?.status === 'degraded') return 2;
        return 1;
      },
      widthMinPixels: 1,
      widthMaxPixels: 5,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature, health: healthSignature },
    });

    this.lastCableHighlightSignature = highlightSignature;
    this.lastCableHealthSignature = healthSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createPipelinesLayer(): PathLayer {
    const highlightedPipelines = this.highlightedAssets.pipeline;
    const cacheKey = 'pipelines-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedPipelines);
    if (cached && highlightSignature === this.lastPipelineHighlightSignature) return cached;

    const layer = new PathLayer({
      id: cacheKey,
      data: PIPELINES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedPipelines.has(d.id)) {
          return [255, 100, 100, 200] as [number, number, number, number];
        }
        const colorKey = d.type as keyof typeof PIPELINE_COLORS;
        const hex = PIPELINE_COLORS[colorKey] || '#666666';
        return this.hexToRgba(hex, 150);
      },
      getWidth: (d) => highlightedPipelines.has(d.id) ? 3 : 1.5,
      widthMinPixels: 1,
      widthMaxPixels: 4,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature },
    });

    this.lastPipelineHighlightSignature = highlightSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createAlertStatusLayer(): GeoJsonLayer | null {
    const alertStatusService = AlertStatusService.getInstance();

    const features: any[] = [];

    const addRegion = (feature: any, name: string) => {
      const status = alertStatusService.getStatusForRegion(name);
      let color = [0, 0, 0, 0]; // Transparent by default

      if (status !== 'NONE') {
        const fillColor = alertStatusService.getFillColor(status);
        const match = fillColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
          color = [
            parseInt(match[1] || '0'),
            parseInt(match[2] || '0'),
            parseInt(match[3] || '0'),
            match[4] ? Math.round(parseFloat(match[4]) * 255) : 255
          ];
        }
      }

      features.push({
        ...feature,
        properties: {
          ...feature.properties,
          alertName: name,
          alertStatusText: alertStatusService.getStatusText(status),
          fillColor: color
        }
      });
    };

    for (const f of this.usStateFeatures) {
      if (f.properties && f.properties.name) {
        addRegion(f, f.properties.name);
      }
    }

    for (const f of this.canadaProvinceFeatures) {
      const provName = f.properties?.name || f.properties?.PRENAME;
      if (provName) {
        addRegion(f, provName);
      }
    }

    if (features.length === 0) return null;

    return new GeoJsonLayer({
      id: 'alert-status-layer',
      data: { type: 'FeatureCollection', features } as any,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: false,
      lineWidthMinPixels: 1,
      getLineColor: [200, 200, 200, 150],
      getFillColor: (d: any) => d.properties.fillColor,
      updateTriggers: {
        getFillColor: [Date.now()]
      }
    });
  }

  private createConflictZonesLayer(): GeoJsonLayer {
    const cacheKey = 'conflict-zones-layer';

    const features: any[] = [];

    for (const zone of CONFLICT_ZONES) {
      let addedFromGeometry = false;

      if (zone.countryCodes && zone.countryCodes.length > 0 && this.countriesGeoJsonData) {
        // Attempt to find country features mapping to these ISO codes
        const countryFeatures = this.countriesGeoJsonData.features.filter((f: any) =>
          f.properties &&
          f.properties['ISO3166-1-Alpha-2'] &&
          zone.countryCodes!.includes(f.properties['ISO3166-1-Alpha-2'])
        );

        if (countryFeatures.length > 0) {
          // Copy the region polygons, but inject the ConflictZone metadata so popups still work
          for (const feature of countryFeatures) {
            features.push({
              ...feature,
              properties: {
                ...feature.properties,
                id: zone.id,
                name: zone.name,
                intensity: zone.intensity
              }
            });
          }
          addedFromGeometry = true;
        }
      }

      // Fallback to bounding box if it's a zone without a mapped country, or geometry hasn't loaded yet
      if (!addedFromGeometry) {
        features.push({
          type: 'Feature' as const,
          properties: { id: zone.id, name: zone.name, intensity: zone.intensity },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [zone.coords]
          }
        });
      }
    }

    const geojsonData = {
      type: 'FeatureCollection' as const,
      features
    };

    const layer = new GeoJsonLayer({
      id: cacheKey,
      data: geojsonData,
      filled: true,
      stroked: true,
      getFillColor: () => COLORS.conflict,
      getLineColor: () => getCurrentTheme() === 'light'
        ? [255, 0, 0, 120] as [number, number, number, number]
        : [255, 0, 0, 180] as [number, number, number, number],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pickable: true,
      updateTriggers: {
        data: features.length // Ensure DeckGL notices if features swap from rect->multi-polygon mid-session
      }
    });

    return layer;
  }

  private createBasesLayer(): IconLayer {
    const highlightedBases = this.highlightedAssets.base;

    // Base colors by operator type - semi-transparent for layering
    // F: Fade in bases as you zoom — subtle at zoom 3, full at zoom 5+
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5); // 0.2 at zoom 3, 1.0 at zoom 5
    const a = Math.round(160 * Math.max(0.3, alphaScale));

    const getBaseColor = (type: string): [number, number, number, number] => {
      switch (type) {
        case 'us-nato': return [68, 136, 255, a];
        case 'russia': return [255, 68, 68, a];
        case 'china': return [255, 136, 68, a];
        case 'uk': return [68, 170, 255, a];
        case 'france': return [0, 85, 164, a];
        case 'india': return [255, 153, 51, a];
        case 'japan': return [188, 0, 45, a];
        default: return [136, 136, 136, a];
      }
    };

    // Military bases: TRIANGLE icons - color by operator, semi-transparent
    return new IconLayer({
      id: 'bases-layer',
      data: MILITARY_BASES,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'triangleUp',
      iconAtlas: MARKER_ICONS.triangleUp,
      iconMapping: { triangleUp: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d) => highlightedBases.has(d.id) ? 16 : 11,
      getColor: (d) => {
        if (highlightedBases.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        return getBaseColor(d.type);
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 16,
      pickable: true,
    });
  }

  private createNuclearLayer(): IconLayer {
    const highlightedNuclear = this.highlightedAssets.nuclear;
    const data = NUCLEAR_FACILITIES.filter(f => f.status !== 'decommissioned');

    // Nuclear: HEXAGON icons - yellow/orange color, semi-transparent
    return new IconLayer({
      id: 'nuclear-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'hexagon',
      iconAtlas: MARKER_ICONS.hexagon,
      iconMapping: { hexagon: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d) => highlightedNuclear.has(d.id) ? 15 : 11,
      getColor: (d) => {
        if (highlightedNuclear.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        if (d.status === 'contested') {
          return [255, 50, 50, 200] as [number, number, number, number];
        }
        return [255, 220, 0, 200] as [number, number, number, number]; // Semi-transparent yellow
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 15,
      pickable: true,
    });
  }

  private createIrradiatorsLayer(): IconLayer {
    return new IconLayer({
      id: 'irradiators-layer',
      data: GAMMA_IRRADIATORS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'triangleDown',
      iconAtlas: MARKER_ICONS.triangleDown,
      iconMapping: { triangleDown: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 11,
      getColor: [255, 100, 255, 210] as [number, number, number, number], // Magenta
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 14,
      pickable: true,
    });
  }

  private createRadiationLayer(stations: RadiationStation[]): IconLayer {
    return new IconLayer({
      id: 'radiation-layer',
      data: stations,
      getPosition: (d: RadiationStation) => [d.lon, d.lat],
      getIcon: () => 'ring',
      iconAtlas: MARKER_ICONS.ring,
      iconMapping: { ring: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d: RadiationStation) => {
        if (d.status === 'high') return 16;
        if (d.status === 'elevated') return 13;
        return 10;
      },
      getColor: (d: RadiationStation) => {
        if (d.status === 'high') return [255, 40, 40, 230] as [number, number, number, number];
        if (d.status === 'elevated') return [255, 170, 0, 220] as [number, number, number, number];
        return [0, 230, 180, 200] as [number, number, number, number];
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 17,
      pickable: true,
    });
  }

  private createSpaceportsLayer(): IconLayer {
    return new IconLayer({
      id: 'spaceports-layer',
      data: SPACEPORTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'star',
      iconAtlas: MARKER_ICONS.star,
      iconMapping: { star: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 13,
      getColor: [200, 100, 255, 220] as [number, number, number, number], // Purple
      sizeScale: 1,
      sizeMinPixels: 7,
      sizeMaxPixels: 15,
      pickable: true,
    });
  }

  private createPortsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'ports-layer',
      data: PORTS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: (d) => {
        // Color by port type (matching old Map.ts icons)
        switch (d.type) {
          case 'naval': return [100, 150, 255, 200] as [number, number, number, number]; // Blue - ⚓
          case 'oil': return [255, 140, 0, 200] as [number, number, number, number]; // Orange - 🛢️
          case 'lng': return [255, 200, 50, 200] as [number, number, number, number]; // Yellow - 🛢️
          case 'container': return [0, 200, 255, 180] as [number, number, number, number]; // Cyan - 🏭
          case 'mixed': return [150, 200, 150, 180] as [number, number, number, number]; // Green
          case 'bulk': return [180, 150, 120, 180] as [number, number, number, number]; // Brown
          default: return [0, 200, 255, 160] as [number, number, number, number];
        }
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createFlightDelaysLayer(delays: AirportDelayAlert[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'flight-delays-layer',
      data: delays,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => {
        if (d.severity === 'severe') return 15000;
        if (d.severity === 'major') return 12000;
        if (d.severity === 'moderate') return 10000;
        return 8000;
      },
      getFillColor: (d) => {
        if (d.severity === 'severe') return [255, 50, 50, 200] as [number, number, number, number]; // Red
        if (d.severity === 'major') return [255, 100, 0, 200] as [number, number, number, number]; // Orange-Red
        if (d.severity === 'moderate') return [255, 160, 0, 180] as [number, number, number, number]; // Orange
        if (d.severity === 'minor') return [255, 200, 100, 180] as [number, number, number, number]; // Yellow
        return [255, 220, 120, 160] as [number, number, number, number]; // Yellowish/Greenish normal
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 15,
      pickable: true,
    });
  }

  private createGhostLayer<T>(id: string, data: T[], getPosition: (d: T) => [number, number], opts: { radiusMinPixels?: number } = {}): ScatterplotLayer<T> {
    return new ScatterplotLayer<T>({
      id: `${id}-ghost`,
      data,
      getPosition,
      getRadius: 1,
      radiusMinPixels: opts.radiusMinPixels ?? 12,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });
  }


  private createDatacentersLayer(): IconLayer {
    const highlightedDC = this.highlightedAssets.datacenter;
    const data = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');

    // Datacenters: SQUARE icons - purple color, semi-transparent for layering
    return new IconLayer({
      id: 'datacenters-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'square',
      iconAtlas: MARKER_ICONS.square,
      iconMapping: { square: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d) => highlightedDC.has(d.id) ? 14 : 10,
      getColor: (d) => {
        if (highlightedDC.has(d.id)) {
          return [255, 100, 100, 200] as [number, number, number, number];
        }
        if (d.status === 'planned') {
          return [136, 68, 255, 100] as [number, number, number, number]; // Transparent for planned
        }
        return [136, 68, 255, 140] as [number, number, number, number]; // ~55% opacity
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 14,
      pickable: true,
    });
  }

  private createEarthquakesLayer(earthquakes: Earthquake[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'earthquakes-layer',
      data: earthquakes,
      getPosition: (d) => [d.location?.longitude ?? 0, d.location?.latitude ?? 0],
      getRadius: (d) => Math.pow(2, d.magnitude) * 1000,
      getFillColor: (d) => {
        const mag = d.magnitude;
        if (mag >= 6) return [255, 0, 0, 200] as [number, number, number, number];
        if (mag >= 5) return [255, 100, 0, 200] as [number, number, number, number];
        return COLORS.earthquake;
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
    });
  }

  private createNaturalEventsLayer(events: NaturalEvent[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'natural-events-layer',
      data: events,
      getPosition: (d: NaturalEvent) => [d.lon, d.lat],
      getRadius: (d: NaturalEvent) => d.title.startsWith('🔴') ? 20000 : d.title.startsWith('🟠') ? 15000 : 8000,
      getFillColor: (d: NaturalEvent) => {
        if (d.title.startsWith('🔴')) return [255, 0, 0, 220] as [number, number, number, number];
        if (d.title.startsWith('🟠')) return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 150, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      pickable: true,
    });
  }

  private createFiresLayer(fires: any[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'fires-layer',
      data: fires,
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: (d: any) => Math.min(d.frp * 200, 30000) || 5000,
      getFillColor: (d: any) => {
        if (d.brightness > 400) return [255, 30, 0, 220] as [number, number, number, number];
        if (d.brightness > 350) return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 220, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createWeatherLayer(alerts: WeatherAlert[]): ScatterplotLayer {
    // Filter weather alerts that have centroid coordinates
    const alertsWithCoords = alerts.filter(a => a.centroid && a.centroid.length === 2);

    return new ScatterplotLayer({
      id: 'weather-layer',
      data: alertsWithCoords,
      getPosition: (d) => d.centroid as [number, number], // centroid is [lon, lat]
      getRadius: 25000,
      getFillColor: (d) => {
        if (d.severity === 'Extreme') return [255, 0, 0, 200] as [number, number, number, number];
        if (d.severity === 'Severe') return [255, 100, 0, 180] as [number, number, number, number];
        if (d.severity === 'Moderate') return [255, 170, 0, 160] as [number, number, number, number];
        return COLORS.weather;
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      pickable: true,
    });
  }

  private createOutagesLayer(outages: InternetOutage[]): IconLayer {
    return new IconLayer({
      id: 'outages-layer',
      data: outages,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'cross',
      iconAtlas: MARKER_ICONS.cross,
      iconMapping: { cross: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 12,
      getColor: COLORS.outage,
      sizeScale: 1,
      sizeMinPixels: 7,
      sizeMaxPixels: 16,
      pickable: true,
    });
  }

  private createCyberThreatsLayer(threats: CyberThreat[]): IconLayer<CyberThreat> {
    return new IconLayer<CyberThreat>({
      id: 'cyber-threats-layer',
      data: threats,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'shield',
      iconAtlas: MARKER_ICONS.shield,
      iconMapping: { shield: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d) => {
        switch (d.severity) {
          case 'critical': return 15;
          case 'high': return 13;
          case 'medium': return 11;
          default: return 9;
        }
      },
      getColor: (d) => {
        switch (d.severity) {
          case 'critical': return [255, 61, 0, 230] as [number, number, number, number];
          case 'high': return [255, 102, 0, 215] as [number, number, number, number];
          case 'medium': return [255, 176, 0, 200] as [number, number, number, number];
          default: return [255, 235, 59, 185] as [number, number, number, number];
        }
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 17,
      pickable: true,
    });
  }

  private createBgpAnomaliesLayers(): Layer[] {
    try {
      const layers: Layer[] = [];

      const validAnomalies = this.bgpAnomalies.filter(d => {
        const valid = d && Number.isFinite(d.lon) && Number.isFinite(d.lat);
        if (!valid) {
          console.warn('[DeckGLMap:BGP] Dropped malformed anomaly item with invalid coordinates:', d);
        }
        return valid;
      });

      if (validAnomalies.length === 0) {
        return layers;
      }

      // Draw connection arcs from victim country to hijacker country if known and cross-border
      const crossBorderEvents = validAnomalies.filter(
        d => d.targetLon != null && d.targetLat != null &&
             Number.isFinite(d.targetLon) && Number.isFinite(d.targetLat) &&
             (Math.abs(d.lon - d.targetLon) > 0.5 || Math.abs(d.lat - d.targetLat) > 0.5)
      );

      if (crossBorderEvents.length > 0) {
        layers.push(new ArcLayer<BgpAnomaly>({
          id: 'bgp-anomalies-arcs-layer',
          data: crossBorderEvents,
          getSourcePosition: d => [d.targetLon!, d.targetLat!],
          getTargetPosition: d => [d.lon, d.lat],
          getSourceColor: [255, 171, 0, 180],
          getTargetColor: d => d.type === 'hijack' ? [255, 45, 85, 220] : [171, 71, 188, 220],
          getWidth: 2,
          pickable: false,
        }));
      }

      const scatterLayer = new ScatterplotLayer<BgpAnomaly>({
        id: 'bgp-anomalies-layer',
        data: validAnomalies,
        getPosition: d => [d.lon, d.lat],
        getRadius: d => {
          switch (d.severity) {
            case 'critical': return 32000;
            case 'high': return 24000;
            case 'medium': return 16000;
            default: return 10000;
          }
        },
        getFillColor: d => {
          if (d.type === 'hijack') {
            return d.severity === 'critical' || d.severity === 'high'
              ? [255, 45, 85, 230]
              : [255, 112, 67, 190];
          }
          return d.severity === 'critical' || d.severity === 'high'
            ? [171, 71, 188, 230]
            : [186, 104, 200, 190];
        },
        radiusMinPixels: 6,
        radiusMaxPixels: 22,
        stroked: true,
        getLineColor: [255, 255, 255, 180] as [number, number, number, number],
        lineWidthMinPixels: 1.5,
        pickable: true,
      });

      const ghostLayer = this.createGhostLayer(
        'bgp-anomalies-layer',
        validAnomalies,
        d => [d.lon, d.lat],
        { radiusMinPixels: 14 }
      );

      layers.push(scatterLayer, ghostLayer);
      return layers;
    } catch (layerErr) {
      console.error(
        '%c[DeckGLMap:BGP]%c Failed to construct Deck.gl layers for BGP anomalies:',
        'color: #ef4444; font-weight: bold;',
        'color: inherit;',
        {
          error: layerErr,
          message: layerErr instanceof Error ? layerErr.message : String(layerErr),
          stack: layerErr instanceof Error ? layerErr.stack : undefined,
          anomalyCount: this.bgpAnomalies.length,
          sample: this.bgpAnomalies[0],
        }
      );
      return [];
    }
  }

  private createAisDensityLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'ais-density-layer',
      data: this.aisDensity,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 4000 + d.intensity * 8000,
      getFillColor: (d) => {
        const intensity = Math.min(Math.max(d.intensity, 0.15), 1);
        const isCongested = (d.deltaPct || 0) >= 15;
        const alpha = Math.round(40 + intensity * 160);
        // Orange for congested areas, cyan for normal traffic
        if (isCongested) {
          return [255, 183, 3, alpha] as [number, number, number, number]; // #ffb703
        }
        return [0, 209, 255, alpha] as [number, number, number, number]; // #00d1ff
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createAisDisruptionsLayer(): ScatterplotLayer {
    // AIS spoofing/jamming events
    return new ScatterplotLayer({
      id: 'ais-disruptions-layer',
      data: this.aisDisruptions,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d) => {
        // Color by severity/type
        if (d.severity === 'high' || d.type === 'spoofing') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red
        }
        if (d.severity === 'medium') {
          return [255, 150, 0, 200] as [number, number, number, number]; // Orange
        }
        return [255, 200, 100, 180] as [number, number, number, number]; // Yellow
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 150] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createCableAdvisoriesLayer(advisories: CableAdvisory[]): ScatterplotLayer {
    // Cable fault/maintenance advisories
    return new ScatterplotLayer({
      id: 'cable-advisories-layer',
      data: advisories,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: (d) => {
        if (d.severity === 'fault') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red for faults
        }
        return [255, 200, 0, 200] as [number, number, number, number]; // Yellow for maintenance
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
      stroked: true,
      getLineColor: [0, 200, 255, 200] as [number, number, number, number], // Cyan outline (cable color)
      lineWidthMinPixels: 2,
    });
  }

  private createRepairShipsLayer(): ScatterplotLayer {
    // Cable repair ships
    return new ScatterplotLayer({
      id: 'repair-ships-layer',
      data: this.repairShips,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [0, 255, 200, 200] as [number, number, number, number], // Teal
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createMilitaryVesselsLayer(vessels: MilitaryVessel[], opacity = 1): IconLayer<MilitaryVessel> {
    return new IconLayer<MilitaryVessel>({
      id: 'military-vessels-layer',
      data: vessels,
      getPosition: (d: MilitaryVessel) => [d.lon, d.lat],
      getIcon: () => 'warship',
      iconAtlas: MARKER_ICONS.warship,
      iconMapping: { warship: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 14,
      getColor: (d: MilitaryVessel) => getMilitaryCountryColor(d.operatorCountry, d.operator),
      opacity,
      getAngle: (d: MilitaryVessel) => (typeof d.heading === 'number' && !isNaN(d.heading) ? d.heading : 0),
      sizeScale: 1,
      sizeMinPixels: 9,
      sizeMaxPixels: 20,
      pickable: opacity > 0.1,
    });
  }

  public createMilitaryVesselClustersLayer(clusters: MilitaryVesselCluster[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-vessel-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.vesselCount || 1) * 3000,
      getFillColor: (d) => {
        // Vessel types: 'exercise' | 'deployment' | 'transit' | 'unknown'
        const activity = d.activityType || 'unknown';
        if (activity === 'exercise' || activity === 'deployment') return [255, 100, 100, 200] as [number, number, number, number];
        if (activity === 'transit') return [255, 180, 100, 180] as [number, number, number, number];
        return [200, 150, 150, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createMilitaryFlightsLayer(flights: MilitaryFlight[], opacity = 1): IconLayer<MilitaryFlight> {
    return new IconLayer<MilitaryFlight>({
      id: 'military-flights-layer',
      data: flights,
      getPosition: (d: MilitaryFlight) => [d.lon, d.lat],
      getIcon: () => 'delta',
      iconAtlas: MARKER_ICONS.delta,
      iconMapping: { delta: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 13,
      getColor: (d: MilitaryFlight) => getMilitaryCountryColor(d.operatorCountry, d.operator),
      opacity,
      getAngle: (d: MilitaryFlight) => (typeof d.heading === 'number' && !isNaN(d.heading) ? d.heading : 0),
      sizeScale: 1,
      sizeMinPixels: 8,
      sizeMaxPixels: 18,
      pickable: opacity > 0.1,
    });
  }

  public createMilitaryFlightClustersLayer(clusters: MilitaryFlightCluster[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-flight-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.flightCount || 1) * 3000,
      getFillColor: (d) => {
        const activity = d.activityType || 'unknown';
        if (activity === 'exercise' || activity === 'patrol') return [100, 150, 255, 200] as [number, number, number, number];
        if (activity === 'transport') return [255, 200, 100, 180] as [number, number, number, number];
        return [150, 150, 200, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createMilitaryClusterLayers(
    flightClusters: MapMilitaryClusterItem[],
    vesselClusters: MapMilitaryClusterItem[],
    opacity: number
  ): Layer[] {
    const layers: Layer[] = [];
    if (opacity <= 0.01) return layers;

    const allClusters = [...flightClusters, ...vesselClusters];
    if (allClusters.length === 0) return layers;

    // 1. Translucent circles:
    // Large enough to group assets cleanly, transparent enough for map to remain clearly visible through them
    layers.push(new ScatterplotLayer<MapMilitaryClusterItem>({
      id: 'military-clusters-layer',
      data: allClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => (d.count > 1 ? 32000 + Math.min(60000, d.count * 8000) : 18000),
      radiusMinPixels: 7,
      radiusMaxPixels: 34,
      getFillColor: d => {
        if (d.type === 'naval') {
          return [14, 165, 233, Math.round(50 * opacity)] as [number, number, number, number];
        }
        return [59, 130, 246, Math.round(45 * opacity)] as [number, number, number, number];
      },
      getLineColor: d => {
        if (d.type === 'naval') {
          return [56, 189, 248, Math.round(210 * opacity)] as [number, number, number, number];
        }
        return [96, 165, 250, Math.round(210 * opacity)] as [number, number, number, number];
      },
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1.5,
      pickable: true,
      opacity: 1,
    }));

    // Ghost pickable layer for mobile and easy clicking
    layers.push(this.createGhostLayer('military-clusters-layer', allClusters, d => [d.lon, d.lat], { radiusMinPixels: 16 }));

    // 2. Count badges for clusters with count > 1
    const multiClusters = allClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapMilitaryClusterItem>({
        id: 'military-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        getColor: [255, 255, 255, Math.round(245 * opacity)],
        getSize: 12,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 700,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        background: true,
        getBackgroundColor: [15, 23, 42, Math.round(180 * opacity)],
        backgroundPadding: [4, 2, 4, 2],
        pickable: false,
      }));
    }

    return layers;
  }

  private createWaterwaysLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'waterways-layer',
      data: STRATEGIC_WATERWAYS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: [100, 150, 255, 180] as [number, number, number, number],
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createEconomicCentersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'economic-centers-layer',
      data: ECONOMIC_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [255, 215, 0, 180] as [number, number, number, number],
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createStockExchangesLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'stock-exchanges-layer',
      data: STOCK_EXCHANGES,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.tier === 'mega' ? 18000 : d.tier === 'major' ? 14000 : 11000,
      getFillColor: (d) => {
        if (d.tier === 'mega') return [255, 215, 80, 220] as [number, number, number, number];
        if (d.tier === 'major') return COLORS.stockExchange;
        return [140, 210, 255, 190] as [number, number, number, number];
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 14,
      pickable: true,
    });
  }

  private createFinancialCentersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'financial-centers-layer',
      data: FINANCIAL_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'global' ? 17000 : d.type === 'regional' ? 13000 : 10000,
      getFillColor: (d) => {
        if (d.type === 'global') return COLORS.financialCenter;
        if (d.type === 'regional') return [0, 190, 130, 185] as [number, number, number, number];
        return [0, 150, 110, 165] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createCentralBanksLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'central-banks-layer',
      data: CENTRAL_BANKS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'major' ? 15000 : d.type === 'supranational' ? 17000 : 12000,
      getFillColor: (d) => {
        if (d.type === 'major') return COLORS.centralBank;
        if (d.type === 'supranational') return [255, 235, 140, 220] as [number, number, number, number];
        return [235, 180, 80, 185] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createCommodityHubsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'commodity-hubs-layer',
      data: COMMODITY_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'exchange' ? 14000 : d.type === 'port' ? 12000 : 10000,
      getFillColor: (d) => {
        if (d.type === 'exchange') return COLORS.commodityHub;
        if (d.type === 'port') return [80, 170, 255, 190] as [number, number, number, number];
        return [255, 110, 80, 185] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 11,
      pickable: true,
    });
  }

  private createMineralsLayer(): IconLayer {
    // Critical minerals projects
    return new IconLayer({
      id: 'minerals-layer',
      data: CRITICAL_MINERALS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'pentagon',
      iconAtlas: MARKER_ICONS.pentagon,
      iconMapping: { pentagon: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: 11,
      getColor: (d) => {
        // Color by mineral type
        switch (d.mineral) {
          case 'Lithium': return [0, 210, 255, 220] as [number, number, number, number]; // Cyan
          case 'Cobalt': return [100, 120, 255, 220] as [number, number, number, number]; // Blue
          case 'Rare Earths': return [255, 100, 200, 220] as [number, number, number, number]; // Pink
          case 'Nickel': return [100, 255, 100, 220] as [number, number, number, number]; // Green
          default: return [200, 200, 200, 220] as [number, number, number, number]; // Gray
        }
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 14,
      pickable: true,
    });
  }

  // Tech variant layers
  private createStartupHubsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'startup-hubs-layer',
      data: STARTUP_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: COLORS.startupHub,
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createAcceleratorsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'accelerators-layer',
      data: ACCELERATORS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: COLORS.accelerator,
      radiusMinPixels: 3,
      radiusMaxPixels: 8,
      pickable: true,
    });
  }

  private createCloudRegionsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'cloud-regions-layer',
      data: CLOUD_REGIONS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: COLORS.cloudRegion,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createProtestClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapProtestCluster>({
      id: 'protest-clusters-layer',
      data: this.protestClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 15000 + d.count * 2000,
      radiusMinPixels: 6,
      radiusMaxPixels: 22,
      getFillColor: d => {
        if (d.hasRiot) return [220, 40, 40, 200] as [number, number, number, number];
        if (d.maxSeverity === 'high') return [255, 80, 60, 180] as [number, number, number, number];
        if (d.maxSeverity === 'medium') return [255, 160, 40, 160] as [number, number, number, number];
        return [255, 220, 80, 140] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom, getFillColor: this.lastSCZoom },
    }));

    layers.push(this.createGhostLayer('protest-clusters-layer', this.protestClusters, d => [d.lon, d.lat], { radiusMinPixels: 14 }));

    const multiClusters = this.protestClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapProtestCluster>({
        id: 'protest-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    const pulseClusters = this.protestClusters.filter(c => c.maxSeverity === 'high' || c.hasRiot);
    if (pulseClusters.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer<MapProtestCluster>({
        id: 'protest-clusters-pulse',
        data: pulseClusters,
        getPosition: d => [d.lon, d.lat],
        getRadius: d => 15000 + d.count * 2000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: d => d.hasRiot ? [220, 40, 40, 120] as [number, number, number, number] : [255, 80, 60, 100] as [number, number, number, number],
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    return layers;
  }

  private createTechHQClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];
    const zoom = this.maplibreMap?.getZoom() || 2;

    layers.push(new ScatterplotLayer<MapTechHQCluster>({
      id: 'tech-hq-clusters-layer',
      data: this.techHQClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 10000 + d.count * 1500,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: d => {
        if (d.primaryType === 'faang') return [0, 220, 120, 200] as [number, number, number, number];
        if (d.primaryType === 'unicorn') return [255, 100, 200, 180] as [number, number, number, number];
        return [80, 160, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    layers.push(this.createGhostLayer('tech-hq-clusters-layer', this.techHQClusters, d => [d.lon, d.lat], { radiusMinPixels: 14 }));

    const multiClusters = this.techHQClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechHQCluster>({
        id: 'tech-hq-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    if (zoom >= 3) {
      const singles = this.techHQClusters.filter(c => c.count === 1);
      if (singles.length > 0) {
        layers.push(new TextLayer<MapTechHQCluster>({
          id: 'tech-hq-clusters-label',
          data: singles,
          getText: d => d.items[0]?.company ?? '',
          getPosition: d => [d.lon, d.lat],
          getSize: 11,
          getColor: [220, 220, 220, 200],
          getPixelOffset: [0, 12],
          pickable: false,
          fontFamily: 'system-ui, sans-serif',
        }));
      }
    }

    return layers;
  }

  private createTechEventClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapTechEventCluster>({
      id: 'tech-event-clusters-layer',
      data: this.techEventClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 10000 + d.count * 1500,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: d => {
        if (d.soonestDaysUntil <= 14) return [255, 220, 50, 200] as [number, number, number, number];
        return [80, 140, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    layers.push(this.createGhostLayer('tech-event-clusters-layer', this.techEventClusters, d => [d.lon, d.lat], { radiusMinPixels: 14 }));

    const multiClusters = this.techEventClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechEventCluster>({
        id: 'tech-event-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    return layers;
  }

  private createDatacenterClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapDatacenterCluster>({
      id: 'datacenter-clusters-layer',
      data: this.datacenterClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 15000 + d.count * 2000,
      radiusMinPixels: 6,
      radiusMaxPixels: 20,
      getFillColor: d => {
        if (d.majorityExisting) return [160, 80, 255, 180] as [number, number, number, number];
        return [80, 160, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    layers.push(this.createGhostLayer('datacenter-clusters-layer', this.datacenterClusters, d => [d.lon, d.lat], { radiusMinPixels: 14 }));

    const multiClusters = this.datacenterClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapDatacenterCluster>({
        id: 'datacenter-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    return layers;
  }

  private createHotspotsLayers(): Layer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const zoomScale = Math.min(1, (zoom - 1) / 3);
    const maxPx = 6 + Math.round(14 * zoomScale);
    const baseOpacity = zoom < 2.5 ? 0.5 : zoom < 4 ? 0.7 : 1.0;
    const layers: Layer[] = [];

    layers.push(new IconLayer({
      id: 'hotspots-layer',
      data: this.hotspots,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'diamond',
      iconAtlas: MARKER_ICONS.diamond,
      iconMapping: { diamond: { x: 0, y: 0, width: 32, height: 32, mask: true } },
      getSize: (d) => {
        const score = d.escalationScore || 1;
        return d.hasBreaking ? 16 : 9 + score * 2;
      },
      getColor: (d) => {
        const score = d.escalationScore || 1;
        const a = Math.round((score >= 4 ? 220 : score >= 2 ? 210 : 190) * baseOpacity);
        if (score >= 4 || d.hasBreaking) return [255, 68, 68, a] as [number, number, number, number];
        if (score >= 2) return [255, 165, 0, a] as [number, number, number, number];
        return [255, 220, 0, a] as [number, number, number, number];
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: Math.max(14, maxPx),
      pickable: true,
    }));

    layers.push(this.createGhostLayer('hotspots-layer', this.hotspots, d => [d.lon, d.lat], { radiusMinPixels: 14 }));

    const highHotspots = this.hotspots.filter(h => h.level === 'high' || h.hasBreaking);
    if (highHotspots.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer({
        id: 'hotspots-pulse',
        data: highHotspots,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const score = d.escalationScore || 1;
          return 10000 + score * 5000;
        },
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const a = Math.round(120 * baseOpacity);
          return d.hasBreaking ? [255, 50, 50, a] as [number, number, number, number] : [255, 165, 0, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));

    }

    return layers;
  }

  private createGulfInvestmentsLayer(): ScatterplotLayer {
    return new ScatterplotLayer<GulfInvestment>({
      id: 'gulf-investments-layer',
      data: GULF_INVESTMENTS,
      getPosition: (d: GulfInvestment) => [d.lon, d.lat],
      getRadius: (d: GulfInvestment) => {
        if (!d.investmentUSD) return 20000;
        if (d.investmentUSD >= 50000) return 70000;
        if (d.investmentUSD >= 10000) return 55000;
        if (d.investmentUSD >= 1000) return 40000;
        return 25000;
      },
      getFillColor: (d: GulfInvestment) =>
        d.investingCountry === 'SA' ? COLORS.gulfInvestmentSA : COLORS.gulfInvestmentUAE,
      getLineColor: [255, 255, 255, 80] as [number, number, number, number],
      lineWidthMinPixels: 1,
      radiusMinPixels: 5,
      radiusMaxPixels: 28,
      pickable: true,
    });
  }

  private pulseTime = 0;

  private canPulse(now = Date.now()): boolean {
    return now - this.startupTime > 60_000;
  }

  private hasRecentRiot(now = Date.now(), windowMs = 2 * 60 * 60 * 1000): boolean {
    const hasRecentClusterRiot = this.protestClusters.some(c =>
      c.hasRiot && c.latestRiotEventTimeMs != null && (now - c.latestRiotEventTimeMs) < windowMs
    );
    if (hasRecentClusterRiot) return true;

    // Fallback to raw protests because syncPulseAnimation can run before cluster data refreshes.
    return this.protests.some((p) => {
      if (p.eventType !== 'riot' || p.sourceType === 'gdelt') return false;
      const ts = p.time.getTime();
      return Number.isFinite(ts) && (now - ts) < windowMs;
    });
  }

  private needsPulseAnimation(now = Date.now()): boolean {
    return this.hasRecentNews(now)
      || this.hasRecentRiot(now)
      || this.hotspots.some(h => h.hasBreaking)
      || this.positiveEvents.some(e => e.count > 10)
      || this.kindnessPoints.some(p => p.type === 'real')
      || (Boolean(this.state.layers.climate) && this.climateAnomalies.some(a => a.severity === 'extreme'));
  }

  private syncPulseAnimation(now = Date.now()): void {
    if (this.renderPaused) {
      if (this.newsPulseIntervalId !== null) this.stopPulseAnimation();
      return;
    }
    const shouldPulse = this.canPulse(now) && this.needsPulseAnimation(now);
    if (shouldPulse && this.newsPulseIntervalId === null) {
      this.startPulseAnimation();
    } else if (!shouldPulse && this.newsPulseIntervalId !== null) {
      this.stopPulseAnimation();
    }
  }

  private startPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) return;
    const PULSE_UPDATE_INTERVAL_MS = 500;

    this.newsPulseIntervalId = setInterval(() => {
      const now = Date.now();
      if (!this.needsPulseAnimation(now)) {
        this.pulseTime = now;
        this.stopPulseAnimation();
        this.rafUpdateLayers();
        return;
      }
      this.pulseTime = now;
      this.rafUpdateLayers();
    }, PULSE_UPDATE_INTERVAL_MS);
  }

  private stopPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) {
      clearInterval(this.newsPulseIntervalId);
      this.newsPulseIntervalId = null;
    }
  }

  private createNewsLocationsLayer(newsLocations: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date; items?: import('@/types').NewsItem[] }>): ScatterplotLayer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const alphaScale = zoom < 2.5 ? 0.4 : zoom < 4 ? 0.7 : 1.0;
    const filteredNewsLocations = this.filterByTime(newsLocations, (location) => location.timestamp);
    const THREAT_RGB: Record<string, [number, number, number]> = {
      critical: [239, 68, 68],
      high: [249, 115, 22],
      medium: [234, 179, 8],
      low: [34, 197, 94],
      info: [59, 130, 246],
    };
    const THREAT_ALPHA: Record<string, number> = {
      critical: 220,
      high: 190,
      medium: 160,
      low: 120,
      info: 80,
    };

    const now = this.pulseTime || Date.now();
    const PULSE_DURATION = 30_000;

    const layers: ScatterplotLayer[] = [
      new ScatterplotLayer({
        id: 'news-locations-layer',
        data: filteredNewsLocations,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        getFillColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const a = Math.round((THREAT_ALPHA[d.threatLevel] || 120) * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        radiusMinPixels: 3,
        radiusMaxPixels: 12,
        pickable: true,
      }),
    ];

    const recentNews = filteredNewsLocations.filter(d => {
      const firstSeen = this.newsLocationFirstSeen.get(d.title);
      return firstSeen && (now - firstSeen) < PULSE_DURATION;
    });

    if (recentNews.length > 0) {
      const pulse = 1.0 + 1.5 * (0.5 + 0.5 * Math.sin(now / 318));

      layers.push(new ScatterplotLayer({
        id: 'news-pulse-layer',
        data: recentNews,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        pickable: false,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const firstSeen = this.newsLocationFirstSeen.get(d.title) || now;
          const age = now - firstSeen;
          const fadeOut = Math.max(0, 1 - age / PULSE_DURATION);
          const a = Math.round(150 * fadeOut * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        updateTriggers: { pulseTime: now },
      }));
    }

    return layers;
  }

  private createPositiveEventsLayers(): Layer[] {
    const layers: Layer[] = [];

    const getCategoryColor = (category: string): [number, number, number, number] => {
      switch (category) {
        case 'nature-wildlife':
        case 'humanity-kindness':
          return [34, 197, 94, 200]; // green
        case 'science-health':
        case 'innovation-tech':
        case 'climate-wins':
          return [234, 179, 8, 200]; // gold
        case 'culture-community':
          return [139, 92, 246, 200]; // purple
        default:
          return [34, 197, 94, 200]; // green default
      }
    };

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new ScatterplotLayer({
      id: 'positive-events-layer',
      data: this.positiveEvents,
      getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d: PositiveGeoEvent) => getCategoryColor(d.category),
      radiusMinPixels: 5,
      radiusMaxPixels: 10,
      pickable: true,
    }));

    // Gentle pulse ring for significant events (count > 8)
    const significantEvents = this.positiveEvents.filter(e => e.count > 8);
    if (significantEvents.length > 0) {
      const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
      layers.push(new ScatterplotLayer({
        id: 'positive-events-pulse',
        data: significantEvents,
        getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
        getRadius: 15000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 24,
        stroked: true,
        filled: false,
        getLineColor: (d: PositiveGeoEvent) => getCategoryColor(d.category),
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    return layers;
  }

  private createKindnessLayers(): Layer[] {
    const layers: Layer[] = [];
    if (this.kindnessPoints.length === 0) return layers;

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new ScatterplotLayer<KindnessPoint>({
      id: 'kindness-layer',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: [74, 222, 128, 200] as [number, number, number, number],
      radiusMinPixels: 5,
      radiusMaxPixels: 10,
      pickable: true,
    }));

    // Pulse for real events
    const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
    layers.push(new ScatterplotLayer<KindnessPoint>({
      id: 'kindness-pulse',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getRadius: 14000,
      radiusScale: pulse,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      stroked: true,
      filled: false,
      getLineColor: [74, 222, 128, 80] as [number, number, number, number],
      lineWidthMinPixels: 1,
      pickable: false,
      updateTriggers: { radiusScale: this.pulseTime },
    }));

    return layers;
  }

  private createHappinessChoroplethLayer(): GeoJsonLayer | null {
    if (!this.countriesGeoJsonData || this.happinessScores.size === 0) return null;
    const scores = this.happinessScores;
    return new GeoJsonLayer({
      id: 'happiness-choropleth-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (feature: { properties?: Record<string, unknown> }) => {
        const code = feature.properties?.['ISO3166-1-Alpha-2'] as string | undefined;
        const score = code ? scores.get(code) : undefined;
        if (score == null) return [0, 0, 0, 0] as [number, number, number, number];
        const t = score / 10;
        return [
          Math.round(40 + (1 - t) * 180),
          Math.round(180 + t * 60),
          Math.round(40 + (1 - t) * 100),
          140,
        ] as [number, number, number, number];
      },
      getLineColor: [100, 100, 100, 60] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [scores.size] },
    });
  }

  private createSpeciesRecoveryLayer(zones: Array<SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } }>): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'species-recovery-layer',
      data: zones,
      getPosition: (d: (typeof this.speciesRecoveryZones)[number]) => [d.recoveryZone.lon, d.recoveryZone.lat],
      getRadius: 50000,
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      getFillColor: [74, 222, 128, 120] as [number, number, number, number],
      stroked: true,
      getLineColor: [74, 222, 128, 200] as [number, number, number, number],
      lineWidthMinPixels: 1.5,
      pickable: true,
    });
  }

  private createRenewableInstallationsLayer(): ScatterplotLayer {
    const typeColors: Record<string, [number, number, number, number]> = {
      solar: [255, 200, 50, 200],
      wind: [100, 200, 255, 200],
      hydro: [0, 180, 180, 200],
      geothermal: [255, 150, 80, 200],
    };
    const typeLineColors: Record<string, [number, number, number, number]> = {
      solar: [255, 200, 50, 255],
      wind: [100, 200, 255, 255],
      hydro: [0, 180, 180, 255],
      geothermal: [255, 150, 80, 255],
    };
    return new ScatterplotLayer({
      id: 'renewable-installations-layer',
      data: this.renewableInstallations,
      getPosition: (d: RenewableInstallation) => [d.lon, d.lat],
      getRadius: 30000,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: (d: RenewableInstallation) => typeColors[d.type] ?? [200, 200, 200, 200] as [number, number, number, number],
      stroked: true,
      getLineColor: (d: RenewableInstallation) => typeLineColors[d.type] ?? [200, 200, 200, 255] as [number, number, number, number],
      lineWidthMinPixels: 1,
      pickable: true,
    });
  }

  private getTooltip(info: PickingInfo): { html: string } | null {
    if (!info.object) return null;

    const rawLayerId = info.layer?.id || '';
    const layerId = rawLayerId.endsWith('-ghost') ? rawLayerId.slice(0, -6) : rawLayerId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = info.object as any;
    const text = (value: unknown): string => escapeHtml(String(value ?? ''));

    switch (layerId) {
      case 'threat-score-layer': {
        const score = typeof obj.threatScore === 'number' ? obj.threatScore.toFixed(2) : '0.00';
        const levelLabel = obj.threatScore < 0.5 ? 'Low' : obj.threatScore < 1.0 ? 'Medium' : obj.threatScore < 1.5 ? 'High' : obj.threatScore < 3.0 ? 'Critical' : 'Extreme';
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.locationName || 'Regional Threat Alert')}</strong><br/>Threat Score: <strong>${score}</strong> (${levelLabel})<br/>Events Analyzed: ${obj.eventCount || 1}</div>`
        };
      }
      case 'alert-status-layer':
        if (!obj.properties) return null;
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.properties.alertName)}</strong><br/>${text(obj.properties.alertStatusText)}</div>` };
      case 'hotspots-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.subtext)}</div>` };
      case 'earthquakes-layer':
        return { html: `<div class="deckgl-tooltip"><strong>M${(obj.magnitude || 0).toFixed(1)} ${t('components.deckgl.tooltip.earthquake')}</strong><br/>${text(obj.place)}</div>` };
      case 'military-vessels-layer': {
        const country = obj.operatorCountry || (obj.operator === 'usn' ? 'USA' : '');
        const op = obj.operator && obj.operator !== 'other' ? String(obj.operator).toUpperCase() : '';
        const origin = country && op ? `${country} (${op})` : country || op || 'Naval Contact';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(origin)}</div>` };
      }
      case 'military-flights-layer': {
        const country = obj.operatorCountry && obj.operatorCountry !== 'Unknown' ? obj.operatorCountry : '';
        const op = obj.operator && obj.operator !== 'other' && obj.operator !== 'unknown' ? String(obj.operator).toUpperCase() : '';
        const origin = country && op ? `${country} (${op})` : country || op;
        const typeStr = obj.aircraftModel || obj.aircraftType || obj.type || 'Airborne Contact';
        const captureDate = obj.lastSeen ? (obj.lastSeen instanceof Date ? obj.lastSeen : new Date(obj.lastSeen)) : null;
        let timeAgo = '';
        if (captureDate && !isNaN(captureDate.getTime())) {
          const diffSec = Math.floor(Math.max(0, Date.now() - captureDate.getTime()) / 1000);
          timeAgo = diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`;
        }
        return {
          html: `<div class="deckgl-tooltip"><strong>${text(obj.callsign || obj.registration || t('components.deckgl.tooltip.militaryAircraft'))}</strong><br/>${origin ? `${text(origin)} &bull; ` : ''}${text(typeStr)}${timeAgo ? `<br/><span style="font-size:10px;color:var(--text-dim, #94a3b8)">ADSB: ${text(timeAgo)}</span>` : ''}</div>`
        };
      }
      case 'military-vessel-clusters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.vesselCluster'))}</strong><br/>${obj.vesselCount || 0} ${t('components.deckgl.tooltip.vessels')}<br/>${text(obj.activityType)}</div>` };
      case 'military-flight-clusters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.flightCluster'))}</strong><br/>${obj.flightCount || 0} ${t('components.deckgl.tooltip.aircraft')}<br/>${text(obj.activityType)}</div>` };
      case 'military-clusters-layer': {
        const cluster = obj as MapMilitaryClusterItem;
        if (cluster.count === 1) {
          const item = (cluster.items?.[0] || obj) as any;
          if (cluster.type === 'naval') {
            const country = item?.operatorCountry || (item?.operator === 'usn' ? 'USA' : '');
            const op = item?.operator && item.operator !== 'other' ? String(item.operator).toUpperCase() : '';
            const origin = country && op ? `${country} (${op})` : country || op || 'Naval Contact';
            return { html: `<div class="deckgl-tooltip"><strong>${text(item?.name || 'Naval Vessel')}</strong><br/>${text(origin)}</div>` };
          } else {
            const country = item?.operatorCountry && item.operatorCountry !== 'Unknown' ? item.operatorCountry : '';
            const op = item?.operator && item.operator !== 'other' && item.operator !== 'unknown' ? String(item.operator).toUpperCase() : '';
            const origin = country && op ? `${country} (${op})` : country || op;
            const typeStr = item?.aircraftModel || item?.aircraftType || item?.type || 'Airborne Contact';
            return {
              html: `<div class="deckgl-tooltip"><strong>${text(item?.callsign || item?.registration || t('components.deckgl.tooltip.militaryAircraft'))}</strong><br/>${origin ? `${text(origin)} &bull; ` : ''}${text(typeStr)}</div>`
            };
          }
        }
        const label = cluster.type === 'naval' ? 'Naval Task Group' : 'Tactical Air Group';
        const assetNoun = cluster.type === 'naval' ? 'combatant vessels' : 'military aircraft';
        return {
          html: `<div class="deckgl-tooltip"><strong>${label}</strong><br/>${cluster.count} ${assetNoun}<br/><small style="opacity:0.85">Click to zoom in</small></div>`
        };
      }
      case 'protests-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.country)}</div>` };
      case 'protest-clusters-layer':
        if (obj.count === 1) {
          const item = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(item?.title || t('components.deckgl.tooltip.protest'))}</strong><br/>${text(item?.city || item?.country || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.protestsCount', { count: String(obj.count) })}</strong><br/>${text(obj.country)}</div>` };
      case 'tech-hq-clusters-layer':
        if (obj.count === 1) {
          const hq = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(hq?.company || '')}</strong><br/>${text(hq?.city || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.techHQsCount', { count: String(obj.count) })}</strong><br/>${text(obj.city)}</div>` };
      case 'tech-event-clusters-layer':
        if (obj.count === 1) {
          const ev = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(ev?.title || '')}</strong><br/>${text(ev?.location || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.techEventsCount', { count: String(obj.count) })}</strong><br/>${text(obj.location)}</div>` };
      case 'datacenter-clusters-layer':
        if (obj.count === 1) {
          const dc = obj.items?.[0];
          return { html: `<div class="deckgl-tooltip"><strong>${text(dc?.name || '')}</strong><br/>${text(dc?.owner || '')}</div>` };
        }
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.tooltip.dataCentersCount', { count: String(obj.count) })}</strong><br/>${text(obj.country)}</div>` };
      case 'bases-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}</div>` };
      case 'nuclear-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)}</div>` };
      case 'datacenters-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.owner)}</div>` };
      case 'cables-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${t('components.deckgl.tooltip.underseaCable')}</div>` };
      case 'pipelines-layer': {
        const pipelineType = String(obj.type || '').toLowerCase();
        const pipelineTypeLabel = pipelineType === 'oil'
          ? t('popups.pipeline.types.oil')
          : pipelineType === 'gas'
            ? t('popups.pipeline.types.gas')
            : pipelineType === 'products'
              ? t('popups.pipeline.types.products')
              : `${text(obj.type)} ${t('components.deckgl.tooltip.pipeline')}`;
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${pipelineTypeLabel}</div>` };
      }
      case 'conflict-zones-layer': {
        const props = obj.properties || obj;
        return { html: `<div class="deckgl-tooltip"><strong>${text(props.name)}</strong><br/>${t('components.deckgl.tooltip.conflictZone')}</div>` };
      }
      case 'natural-events-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.category || t('components.deckgl.tooltip.naturalEvent'))}</div>` };
      case 'ais-density-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${t('components.deckgl.layers.shipTraffic')}</strong><br/>${t('popups.intensity')}: ${text(obj.intensity)}</div>` };
      case 'waterways-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${t('components.deckgl.layers.strategicWaterways')}</div>` };
      case 'economic-centers-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country)}</div>` };
      case 'stock-exchanges-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.shortName)}</strong><br/>${text(obj.city)}, ${text(obj.country)}</div>` };
      case 'financial-centers-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)} ${t('components.deckgl.tooltip.financialCenter')}</div>` };
      case 'central-banks-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.shortName)}</strong><br/>${text(obj.city)}, ${text(obj.country)}</div>` };
      case 'commodity-hubs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type)} · ${text(obj.city)}</div>` };
      case 'startup-hubs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.city)}</strong><br/>${text(obj.country)}</div>` };
      case 'tech-hqs-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.company)}</strong><br/>${text(obj.city)}</div>` };
      case 'accelerators-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.city)}</div>` };
      case 'cloud-regions-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.provider)}</strong><br/>${text(obj.region)}</div>` };
      case 'tech-events-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.title)}</strong><br/>${text(obj.location)}</div>` };
      case 'irradiators-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.type || t('components.deckgl.layers.gammaIrradiators'))}</div>` };
      case 'radiation-layer': {
        const st = obj as RadiationStation;
        const statusColor = st.status === 'high' ? '#ff3333' : st.status === 'elevated' ? '#ffaa00' : '#00e6b4';
        const statusBadge = `<span style="color:${statusColor};font-weight:700;text-transform:uppercase">${text(st.status)}</span>`;
        const doseStr = st.doseRate != null ? `${st.doseRate} nSv/h · ` : '';
        const rawNote = st.rawCpm != null && st.rawCpm !== st.cpm ? `<br/><small style="opacity:0.85">Raw NaI: ${st.rawCpm.toLocaleString()} CPM (EPA Scintillator)</small>` : '';
        let timeStr = '';
        if (st.time) {
          const d = new Date(st.time);
          if (!isNaN(d.getTime())) {
            timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          } else {
            timeStr = st.time;
          }
        }
        return {
          html: `<div class="deckgl-tooltip"><strong>☢ ${text(st.name)}</strong><br/><strong>${st.cpm.toLocaleString()} CPM</strong> <small style="opacity:0.85">(GM equiv)</small> · ${doseStr}${statusBadge}${rawNote}<br/><small style="opacity:0.75">${text(st.source)}${timeStr ? ` · ${text(timeStr)}` : ''}</small></div>`,
        };
      }
      case 'aqi-bubbles-layer': {
        const station = obj as AQIStation;
        const aqiNum = parseInt(station.aqi, 10);
        const cat = getAqiCategory(aqiNum);
        const name = station.station?.name || 'Monitoring Station';
        const particulates = getStationParticulates(station);

        let particulatesHtml = '';
        if (particulates.length > 0) {
          particulatesHtml = `
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.12);font-size:11px;">
              <div style="color:var(--text-dim, #94a3b8);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-size:9px;">Particulate Measurements</div>
              ${particulates.map(p => `
                <div style="display:flex;justify-content:space-between;gap:12px;line-height:1.4;">
                  <span style="color:var(--text-dim, #cbd5e1);">${escapeHtml(p.label)}:</span>
                  <strong style="color:var(--text, #f8fafc);">${p.value} ${escapeHtml(p.unit)}${p.isEstimated ? ' <span style="font-size:8px;opacity:0.75">(est.)</span>' : ''}</strong>
                </div>
              `).join('')}
            </div>
          `;
        }

        return {
          html: `
            <div class="deckgl-tooltip aqi-tooltip">
              <div style="font-weight:700;font-size:12px;margin-bottom:3px;color:var(--text, #fff);">${escapeHtml(name)}</div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cat.colorCss};"></span>
                <span style="font-size:11px;color:var(--text-dim, #cbd5e1);">AQI: <strong style="color:${cat.colorCss};font-size:12px;">${isNaN(aqiNum) ? station.aqi : aqiNum}</strong> &bull; ${escapeHtml(cat.label)}</span>
              </div>
              ${particulatesHtml}
            </div>
          `
        };
      }
      case 'aqi-clusters-layer': {
        const cluster = obj as AQIClusterData;
        const cat = getAqiCategory(cluster.avgAqi);
        return {
          html: `
            <div class="deckgl-tooltip aqi-tooltip">
              <div style="font-weight:700;font-size:12px;margin-bottom:2px;color:var(--text, #fff);">Regional Air Quality</div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cat.colorCss};"></span>
                <span style="font-size:11px;">Avg. AQI: <strong style="color:${cat.colorCss};font-size:12px;">${cluster.avgAqi}</strong> (${escapeHtml(cat.label)})</span>
              </div>
              <div style="color:var(--text-dim, #94a3b8);font-size:10px;">${cluster.count} stations &bull; Range: ${cluster.minAqi}–${cluster.maxAqi}</div>
              <div style="color:var(--accent, #60a5fa);font-size:10px;margin-top:4px;">Click to view 10 most varied measurements &rarr;</div>
            </div>
          `
        };
      }
      case 'spaceports-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.country || t('components.deckgl.layers.spaceports'))}</div>` };
      case 'ports-layer': {
        const typeIcon = obj.type === 'naval' ? '⚓' : obj.type === 'oil' || obj.type === 'lng' ? '🛢️' : '🏭';
        return { html: `<div class="deckgl-tooltip"><strong>${typeIcon} ${text(obj.name)}</strong><br/>${text(obj.type || t('components.deckgl.tooltip.port'))} - ${text(obj.country)}</div>` };
      }
      case 'flight-delays-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)} (${text(obj.iata)})</strong><br/>${text(obj.severity)}: ${text(obj.reason || obj.delayType)}</div>` };

      case 'minerals-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${text(obj.mineral)} - ${text(obj.country)}<br/>${text(obj.operator)}</div>` };
      case 'ais-disruptions-layer':
        return { html: `<div class="deckgl-tooltip"><strong>AIS ${text(obj.type || t('components.deckgl.tooltip.disruption'))}</strong><br/>${text(obj.severity)} ${t('popups.severity')}<br/>${text(obj.description)}</div>` };
      case 'cable-advisories-layer': {
        const cableName = UNDERSEA_CABLES.find(c => c.id === obj.cableId)?.name || obj.cableId;
        return { html: `<div class="deckgl-tooltip"><strong>${text(cableName)}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.advisory'))}<br/>${text(obj.description)}</div>` };
      }
      case 'repair-ships-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name || t('components.deckgl.tooltip.repairShip'))}</strong><br/>${text(obj.status)}</div>` };
      case 'climate-points-layer': {
        const a = obj as ClimateAnomaly;
        const icon = a.type === 'cold' ? '❄️' : a.type === 'wet' ? '🌧️' : a.type === 'dry' ? '☀️' : a.type === 'mixed' ? '⚡' : '🌡️';
        const sign = a.tempDelta > 0 ? '+' : '';
        const tempStr = `${sign}${a.tempDelta.toFixed(1)}°C`;
        const precipSign = a.precipDelta > 0 ? '+' : '';
        const precipStr = `${precipSign}${a.precipDelta.toFixed(1)}mm`;
        return {
          html: `<div class="deckgl-tooltip"><strong>${icon} ${text(a.zone)}</strong><br/>${t('components.climate.temp')}: <strong>${tempStr}</strong> · ${t('components.climate.precip')}: <strong>${precipStr}</strong><br/><span style="text-transform:uppercase;font-size:10px;opacity:0.85;font-weight:600;">${text(a.severity)} · ${text(a.type)}</span></div>`,
        };
      }
      case 'weather-layer': {
        const areaDesc = typeof obj.areaDesc === 'string' ? obj.areaDesc : '';
        const area = areaDesc ? `<br/><small>${text(areaDesc.slice(0, 50))}${areaDesc.length > 50 ? '...' : ''}</small>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.event || t('components.deckgl.layers.weather'))}</strong><br/>${text(obj.severity)}${area}</div>` };
      }
      case 'fires-layer': {
        const fire = obj as {
          region?: string;
          brightness?: number;
          frp?: number;
          confidence?: number;
          acq_date?: string;
          daynight?: string;
        };
        const regionStr = text(fire.region || t('components.deckgl.layers.fires'));
        const brightStr = fire.brightness != null ? `${Math.round(fire.brightness)}K` : '';
        const frpStr = fire.frp != null ? `${Number(fire.frp).toFixed(1)} MW` : '';
        const confNum = fire.confidence != null ? Math.round(fire.confidence) : null;
        let confStr = '';
        if (confNum != null && confNum > 0) {
          const confLabel = confNum >= 80 ? 'High' : confNum >= 40 ? 'Nominal' : 'Low';
          confStr = `${confNum}% (${confLabel})`;
        }
        const timeOfDay = fire.daynight === 'D' ? 'Day' : fire.daynight === 'N' ? 'Night' : '';
        const details = [
          brightStr,
          frpStr,
          confStr,
        ].filter(Boolean).join(' · ');
        const dateStr = [fire.acq_date, timeOfDay].filter(Boolean).join(' · ');

        return {
          html: `<div class="deckgl-tooltip"><strong>🔥 ${regionStr}</strong>${details ? `<br/>${details}` : ''}${dateStr ? `<br/><small style="opacity:0.8">${text(dateStr)}</small>` : ''}</div>`,
        };
      }
      case 'outages-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.asn || t('components.deckgl.tooltip.internetOutage'))}</strong><br/>${text(obj.country)}</div>` };
      case 'cyber-threats-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${t('popups.cyberThreat.title')}</strong><br/>${text(obj.severity || t('components.deckgl.tooltip.medium'))} · ${text(obj.country || t('popups.unknown'))}</div>` };
      case 'bgp-anomalies-layer': {
        const typeStr = obj.type === 'hijack' ? 'BGP Hijack' : 'BGP Route Leak';
        const asnStr = obj.originOrg || (obj.originAsn ? `AS${obj.originAsn}` : '');
        const regionStr = obj.countryCode || obj.originCountry || '';
        return {
          html: `<div class="deckgl-tooltip">
            <strong>🔀 ${text(typeStr)}</strong><br/>
            ${asnStr ? `${text(asnStr)}<br/>` : ''}
            <span style="opacity:.85">${text(obj.severity?.toUpperCase())} · Confidence: ${obj.confidence}/10${regionStr ? ` · ${text(regionStr)}` : ''}</span>
          </div>`
        };
      }
      case 'news-locations-layer':
        return { html: `<div class="deckgl-tooltip"><strong>📰 ${t('components.deckgl.tooltip.news')}</strong><br/>${text(obj.title?.slice(0, 80) || '')}</div>` };
      case 'positive-events-layer': {
        const catLabel = obj.category ? obj.category.replace(/-/g, ' & ') : 'Positive Event';
        const countInfo = obj.count > 1 ? `<br/><span style="opacity:.7">${obj.count} sources reporting</span>` : '';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/><span style="text-transform:capitalize">${text(catLabel)}</span>${countInfo}</div>` };
      }
      case 'kindness-layer':
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong></div>` };
      case 'happiness-choropleth-layer': {
        const hcName = obj.properties?.name ?? 'Unknown';
        const hcCode = obj.properties?.['ISO3166-1-Alpha-2'];
        const hcScore = hcCode ? this.happinessScores.get(hcCode as string) : undefined;
        const hcScoreStr = hcScore != null ? hcScore.toFixed(1) : 'No data';
        return { html: `<div class="deckgl-tooltip"><strong>${text(hcName)}</strong><br/>Happiness: ${hcScoreStr}/10${hcScore != null ? `<br/><span style="opacity:.7">${text(this.happinessSource)} (${this.happinessYear})</span>` : ''}</div>` };
      }
      case 'species-recovery-layer': {
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.commonName)}</strong><br/>${text(obj.recoveryZone?.name ?? obj.region)}<br/><span style="opacity:.7">Status: ${text(obj.recoveryStatus)}</span></div>` };
      }
      case 'renewable-installations-layer': {
        const riTypeLabel = obj.type ? String(obj.type).charAt(0).toUpperCase() + String(obj.type).slice(1) : 'Renewable';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${riTypeLabel} &middot; ${obj.capacityMW?.toLocaleString() ?? '?'} MW<br/><span style="opacity:.7">${text(obj.country)} &middot; ${obj.year}</span></div>` };
      }
      case 'gulf-investments-layer': {
        const inv = obj as GulfInvestment;
        const flag = inv.investingCountry === 'SA' ? '🇸🇦' : '🇦🇪';
        const usd = inv.investmentUSD != null
          ? (inv.investmentUSD >= 1000 ? `$${(inv.investmentUSD / 1000).toFixed(1)}B` : `$${inv.investmentUSD}M`)
          : t('components.deckgl.tooltip.undisclosed');
        const stake = inv.stakePercent != null ? `<br/>${text(String(inv.stakePercent))}% ${t('components.deckgl.tooltip.stake')}` : '';
        return {
          html: `<div class="deckgl-tooltip">
            <strong>${flag} ${text(inv.assetName)}</strong><br/>
            <em>${text(inv.investingEntity)}</em><br/>
            ${text(inv.targetCountry)} · ${text(inv.sector)}<br/>
            <strong>${usd}</strong>${stake}<br/>
            <span style="text-transform:capitalize">${text(inv.status)}</span>
          </div>`,
        };
      }
      default:
        return null;
    }
  }

  private handleClick(info: PickingInfo): void {
    if (!info.object) {
      // Empty map click → country detection
      if (info.coordinate && this.onCountryClick) {
        const [lon, lat] = info.coordinate as [number, number];
        const country = this.resolveCountryFromCoordinate(lon, lat);
        this.onCountryClick({
          lat,
          lon,
          ...(country ? { code: country.code, name: country.name } : {}),
        });
      }
      return;
    }

    const rawClickLayerId = info.layer?.id || '';
    const layerId = rawClickLayerId.endsWith('-ghost') ? rawClickLayerId.slice(0, -6) : rawClickLayerId;

    // Hotspots show popup with related news
    if (layerId === 'hotspots-layer') {
      const hotspot = info.object as Hotspot;
      const relatedNews = this.getRelatedNews(hotspot);
      this.popup.show({
        type: 'hotspot',
        data: hotspot,
        relatedNews,
        x: info.x,
        y: info.y,
      });
      this.popup.loadHotspotGdeltContext(hotspot);
      this.onHotspotClick?.(hotspot);
      return;
    }

    // Handle cluster layers with single/multi logic
    if (layerId === 'protest-clusters-layer') {
      const cluster = info.object as MapProtestCluster;
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'protest', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'protestCluster',
          data: {
            items: cluster.items,
            country: cluster.country,
            count: cluster.count,
            riotCount: cluster.riotCount,
            highSeverityCount: cluster.highSeverityCount,
            verifiedCount: cluster.verifiedCount,
            totalFatalities: cluster.totalFatalities,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'tech-hq-clusters-layer') {
      const cluster = info.object as MapTechHQCluster;
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'techHQ', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'techHQCluster',
          data: {
            items: cluster.items,
            city: cluster.city,
            country: cluster.country,
            count: cluster.count,
            faangCount: cluster.faangCount,
            unicornCount: cluster.unicornCount,
            publicCount: cluster.publicCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'tech-event-clusters-layer') {
      const cluster = info.object as MapTechEventCluster;
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'techEvent', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'techEventCluster',
          data: {
            items: cluster.items,
            location: cluster.location,
            country: cluster.country,
            count: cluster.count,
            soonCount: cluster.soonCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }
    if (layerId === 'datacenter-clusters-layer') {
      const cluster = info.object as MapDatacenterCluster;
      if (cluster.count === 1 && cluster.items[0]) {
        this.popup.show({ type: 'datacenter', data: cluster.items[0], x: info.x, y: info.y });
      } else {
        this.popup.show({
          type: 'datacenterCluster',
          data: {
            items: cluster.items,
            region: cluster.region || cluster.country,
            country: cluster.country,
            count: cluster.count,
            totalChips: cluster.totalChips,
            totalPowerMW: cluster.totalPowerMW,
            existingCount: cluster.existingCount,
            plannedCount: cluster.plannedCount,
            sampled: cluster.sampled,
          },
          x: info.x,
          y: info.y,
        });
      }
      return;
    }

    if (layerId === 'military-clusters-layer') {
      const cluster = info.object as MapMilitaryClusterItem;
      if (cluster.count === 1 && cluster.items[0]) {
        const item = cluster.items[0];
        if (cluster.type === 'naval') {
          this.popup.show({ type: 'militaryVessel', data: item, x: info.x, y: info.y });
        } else {
          this.popup.show({ type: 'militaryFlight', data: item, x: info.x, y: info.y });
        }
      } else {
        if (this.maplibreMap) {
          const targetZoom = Math.min(10, Math.max(5.5, (this.maplibreMap.getZoom() || 3) + 2.5));
          this.maplibreMap.easeTo({
            center: [cluster.lon, cluster.lat],
            zoom: targetZoom,
            duration: 800,
          });
        }
      }
      return;
    }

    if (layerId === 'aqi-clusters-layer') {
      const cluster = info.object as AQIClusterData;
      this.popup.show({
        type: 'aqiCluster',
        data: cluster,
        x: info.x,
        y: info.y,
      });
      return;
    }
    if (layerId === 'aqi-bubbles-layer') {
      const station = info.object as AQIStation;
      this.popup.show({
        type: 'aqiStation',
        data: station,
        x: info.x,
        y: info.y,
      });
      return;
    }

    // Map layer IDs to popup types
    const layerToPopupType: Record<string, PopupType> = {
      'conflict-zones-layer': 'conflict',
      'bases-layer': 'base',
      'nuclear-layer': 'nuclear',
      'irradiators-layer': 'irradiator',
      'radiation-layer': 'radiation',
      'datacenters-layer': 'datacenter',
      'cables-layer': 'cable',
      'pipelines-layer': 'pipeline',
      'earthquakes-layer': 'earthquake',
      'weather-layer': 'weather',
      'outages-layer': 'outage',
      'cyber-threats-layer': 'cyberThreat',
      'bgp-anomalies-layer': 'bgpAnomaly',
      'protests-layer': 'protest',
      'military-flights-layer': 'militaryFlight',
      'military-vessels-layer': 'militaryVessel',
      'military-vessel-clusters-layer': 'militaryVesselCluster',
      'military-flight-clusters-layer': 'militaryFlightCluster',
      'natural-events-layer': 'natEvent',
      'waterways-layer': 'waterway',
      'economic-centers-layer': 'economic',
      'aqi-clusters-layer': 'aqiCluster',
      'aqi-bubbles-layer': 'aqiStation',
      'stock-exchanges-layer': 'stockExchange',
      'financial-centers-layer': 'financialCenter',
      'central-banks-layer': 'centralBank',
      'commodity-hubs-layer': 'commodityHub',
      'spaceports-layer': 'spaceport',
      'ports-layer': 'port',
      'flight-delays-layer': 'flight',
      'startup-hubs-layer': 'startupHub',
      'tech-hqs-layer': 'techHQ',
      'accelerators-layer': 'accelerator',
      'cloud-regions-layer': 'cloudRegion',
      'tech-events-layer': 'techEvent',
      'minerals-layer': 'mineral',
      'ais-disruptions-layer': 'ais',
      'cable-advisories-layer': 'cable-advisory',
      'repair-ships-layer': 'repair-ship',
      'climate-points-layer': 'climate',
    };

    const popupType = layerToPopupType[layerId];
    if (!popupType) return;

    // For GeoJSON layers, the data is in properties
    let data = info.object;
    if (layerId === 'conflict-zones-layer' && info.object.properties) {
      // Find the full conflict zone data from config
      const conflictId = info.object.properties.id;
      const fullConflict = CONFLICT_ZONES.find(c => c.id === conflictId);
      if (fullConflict) data = fullConflict;
    }

    // Get click coordinates relative to container
    const x = info.x ?? 0;
    const y = info.y ?? 0;

    this.popup.show({
      type: popupType,
      data: data,
      x,
      y,
    });
  }

  // Utility methods
  private hexToRgba(hex: string, alpha: number): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        alpha,
      ];
    }
    return [100, 100, 100, alpha];
  }

  // UI Creation methods
  private createControls(): void {
    const controls = document.createElement('div');
    controls.className = 'map-controls deckgl-controls';
    controls.innerHTML = `
      <div class="zoom-controls">
        <button class="map-btn zoom-in" title="${t('components.deckgl.zoomIn')}">+</button>
        <button class="map-btn zoom-out" title="${t('components.deckgl.zoomOut')}">-</button>
        <button class="map-btn zoom-reset" title="${t('components.deckgl.resetView')}">&#8962;</button>
      </div>
      <div class="view-selector">
        <select class="view-select">
          <option value="global">${t('components.deckgl.views.global')}</option>
          <option value="america">${t('components.deckgl.views.americas')}</option>
          <option value="mena">${t('components.deckgl.views.mena')}</option>
          <option value="eu">${t('components.deckgl.views.europe')}</option>
          <option value="asia">${t('components.deckgl.views.asia')}</option>
          <option value="latam">${t('components.deckgl.views.latam')}</option>
          <option value="africa">${t('components.deckgl.views.africa')}</option>
          <option value="oceania">${t('components.deckgl.views.oceania')}</option>
        </select>
      </div>
    `;

    this.container.appendChild(controls);

    // Bind events - use event delegation for reliability
    controls.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('zoom-in')) this.zoomIn();
      else if (target.classList.contains('zoom-out')) this.zoomOut();
      else if (target.classList.contains('zoom-reset')) this.resetView();
    });

    const viewSelect = controls.querySelector('.view-select') as HTMLSelectElement;
    viewSelect.value = this.state.view;
    viewSelect.addEventListener('change', () => {
      this.setView(viewSelect.value as DeckMapView);
    });
  }

  private createTimeSlider(): void {
    const slider = document.createElement('div');
    slider.className = 'time-slider deckgl-time-slider';
    slider.innerHTML = `
      <div class="time-options">
        <button class="time-btn ${this.state.timeRange === '1h' ? 'active' : ''}" data-range="1h">1h</button>
        <button class="time-btn ${this.state.timeRange === '6h' ? 'active' : ''}" data-range="6h">6h</button>
        <button class="time-btn ${this.state.timeRange === '24h' ? 'active' : ''}" data-range="24h">24h</button>
        <button class="time-btn ${this.state.timeRange === '48h' ? 'active' : ''}" data-range="48h">48h</button>
        <button class="time-btn ${this.state.timeRange === '7d' ? 'active' : ''}" data-range="7d">7d</button>
        <button class="time-btn ${this.state.timeRange === 'all' ? 'active' : ''}" data-range="all">${t('components.deckgl.timeAll')}</button>
      </div>
    `;

    this.container.appendChild(slider);

    slider.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const range = (btn as HTMLElement).dataset.range as TimeRange;
        this.setTimeRange(range);
      });
    });
  }

  private updateTimeSliderButtons(): void {
    const slider = this.container.querySelector('.deckgl-time-slider');
    if (!slider) return;
    slider.querySelectorAll('.time-btn').forEach((btn) => {
      const range = (btn as HTMLElement).dataset.range as TimeRange | undefined;
      btn.classList.toggle('active', range === this.state.timeRange);
    });
  }

  private getLayerCategories(): LayerCategoryGroup[] {
    return SITE_VARIANT === 'tech'
      ? [
        {
          id: 'general-intel',
          title: 'General Intel',
          layers: [
            { key: 'alertStatus', label: 'Alert Status', icon: '&#9888;' },
          ],
        },
        {
          id: 'tech-ecosystem',
          title: 'Tech Ecosystem',
          layers: [
            { key: 'startupHubs', label: t('components.deckgl.layers.startupHubs'), icon: '&#128640;' },
            { key: 'techHQs', label: t('components.deckgl.layers.techHQs'), icon: '&#127970;' },
            { key: 'accelerators', label: t('components.deckgl.layers.accelerators'), icon: '&#9889;' },
            { key: 'cloudRegions', label: t('components.deckgl.layers.cloudRegions'), icon: '&#9729;' },
            { key: 'techEvents', label: t('components.deckgl.layers.techEvents'), icon: '&#128197;' },
          ],
        },
        {
          id: 'infrastructure',
          title: 'Infrastructure',
          layers: [
            { key: 'datacenters', label: t('components.deckgl.layers.aiDataCenters'), icon: '&#128421;' },
            { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '&#128268;' },
            { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '&#9762;' },
            { key: 'bgpAnomalies', label: t('components.deckgl.layers.bgpAnomalies'), icon: '&#128256;' },
          ],
        },
        {
          id: 'signals-air',
          title: 'Aviation & Signals',
          layers: [
            { key: 'flights', label: t('components.deckgl.layers.flightDelays'), icon: '&#9992;' },
            { key: 'gpsJamming', label: t('components.deckgl.layers.gpsJamming'), icon: '&#128225;' },
          ],
        },
        {
          id: 'natural',
          title: 'Natural',
          layers: [
            { key: 'weatherRadar', label: 'Weather Radar', icon: '&#127782;' },
            { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '&#9928;' },
            { key: 'waterTemperature', label: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp', icon: '&#127754;' },
            { key: 'aqi', label: t('components.deckgl.layers.aqi'), icon: '💨' },
            { key: 'fires', label: t('components.deckgl.layers.fires'), icon: '&#128293;' },
            { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '&#127755;' },
          ],
        },
      ]
      : SITE_VARIANT === 'finance'
        ? [
          {
            id: 'financial-markets',
            title: 'Financial Markets',
            layers: [
              { key: 'stockExchanges', label: t('components.deckgl.layers.stockExchanges'), icon: '&#127963;' },
              { key: 'financialCenters', label: t('components.deckgl.layers.financialCenters'), icon: '&#128176;' },
              { key: 'centralBanks', label: t('components.deckgl.layers.centralBanks'), icon: '&#127974;' },
              { key: 'commodityHubs', label: t('components.deckgl.layers.commodityHubs'), icon: '&#128230;' },
              { key: 'gulfInvestments', label: t('components.deckgl.layers.gulfInvestments'), icon: '&#127760;' },
            ],
          },
          {
            id: 'infra-trade',
            title: 'Infrastructure & Trade',
            layers: [
              { key: 'tradeRoutes', label: t('components.deckgl.layers.tradeRoutes'), icon: '&#128674;' },
              { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '&#128268;' },
              { key: 'pipelines', label: t('components.deckgl.layers.pipelines'), icon: '&#128738;' },
              { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '&#9762;' },
              { key: 'outages', label: t('components.deckgl.layers.internetOutages'), icon: '&#128225;' },
              { key: 'bgpAnomalies', label: t('components.deckgl.layers.bgpAnomalies'), icon: '&#128256;' },
              { key: 'waterways', label: t('components.deckgl.layers.strategicWaterways'), icon: '&#9875;' },
            ],
          },
          {
            id: 'intel-signals',
            title: 'Intel & Aviation',
            layers: [
              { key: 'alertStatus', label: 'Alert Status', icon: '&#9888;' },
              { key: 'flights', label: t('components.deckgl.layers.flightDelays'), icon: '&#9992;' },
              { key: 'gpsJamming', label: t('components.deckgl.layers.gpsJamming'), icon: '&#128225;' },
            ],
          },
          {
            id: 'natural',
            title: 'Natural',
            layers: [
              { key: 'weatherRadar', label: 'Weather Radar', icon: '&#127782;' },
              { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '&#9928;' },
              { key: 'waterTemperature', label: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp', icon: '&#127754;' },
              { key: 'aqi', label: t('components.deckgl.layers.aqi'), icon: '💨' },
              { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '&#127755;' },
            ],
          },
        ]
        : SITE_VARIANT === 'happy'
          ? [
            {
              id: 'positive-signals',
              title: 'Well-being & Kindness',
              layers: [
                { key: 'positiveEvents', label: 'Positive Events', icon: '&#127775;' },
                { key: 'kindness', label: 'Acts of Kindness', icon: '&#128154;' },
                { key: 'happiness', label: 'World Happiness', icon: '&#128522;' },
                { key: 'speciesRecovery', label: 'Species Recovery', icon: '&#128062;' },
                { key: 'renewableInstallations', label: 'Clean Energy', icon: '&#9889;' },
              ],
            },
            {
              id: 'natural',
              title: 'Natural Environment',
              layers: [
                { key: 'weatherRadar', label: 'Weather Radar', icon: '&#127782;' },
                { key: 'weather', label: t('components.deckgl.layers.weather'), icon: '&#9928;' },
                { key: 'waterTemperature', label: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp', icon: '&#127754;' },
                { key: 'aqi', label: t('components.deckgl.layers.aqi'), icon: '💨' },
                { key: 'gpsJamming', label: t('components.deckgl.layers.gpsJamming'), icon: '&#128225;' },
              ],
            },
          ]
          : [
            {
              id: 'general-intel',
              title: 'General Intel',
              layers: [
                { key: 'alertStatus', label: 'Alert Status', icon: '&#9888;' },
                { key: 'hotspots', label: t('components.deckgl.layers.intelHotspots'), icon: '&#127919;' },
                { key: 'threatScore', label: 'Threat Score', icon: '&#128308;' },
              ],
            },
            {
              id: 'infrastructure',
              title: 'Infrastructure',
              layers: [
                { key: 'pipelines', label: t('components.deckgl.layers.pipelines'), icon: '&#128738;' },
                { key: 'cables', label: t('components.deckgl.layers.underseaCables'), icon: '&#128268;' },
                { key: 'spaceports', label: t('components.deckgl.layers.spaceports'), icon: '&#128640;' },
                { key: 'datacenters', label: t('components.deckgl.layers.aiDataCenters'), icon: '&#128421;' },
                { key: 'radiation', label: t('components.deckgl.layers.radiation'), icon: '&#9762;' },
                { key: 'irradiators', label: t('components.deckgl.layers.gammaIrradiators'), icon: '&#9888;' },
                { key: 'minerals', label: t('components.deckgl.layers.criticalMinerals'), icon: '&#128142;' },
                { key: 'nuclear', label: t('components.deckgl.layers.nuclearSites'), icon: '🏭' },
                { key: 'agriculturalStressASI', label: 'Agricultural Index', icon: '&#127806;' },
                { key: 'bgpAnomalies', label: t('components.deckgl.layers.bgpAnomalies'), icon: '&#128256;' },
              ],
            },
            {
              id: 'military',
              title: 'Military',
              layers: [
                { key: 'military', label: t('components.deckgl.layers.militaryActivity'), icon: '🛡️' },
                { key: 'conflicts', label: t('components.deckgl.layers.conflictZones'), icon: '&#9876;' },
                { key: 'bases', label: t('components.deckgl.layers.militaryBases'), icon: '&#127963;' },
              ],
            },
            {
              id: 'shipping-air',
              title: 'Shipping & Air Traffic',
              layers: [
                { key: 'ais', label: t('components.deckgl.layers.shipTraffic'), icon: '&#128674;' },
                { key: 'flights', label: 'Aviation', icon: '&#9992;' },
                { key: 'waterways', label: t('components.deckgl.layers.strategicWaterways'), icon: '&#9875;' },
                { key: 'tradeRoutes', label: t('components.deckgl.layers.tradeRoutes'), icon: '&#128675;' },
                { key: 'gpsJamming', label: t('components.deckgl.layers.gpsJamming'), icon: '&#128225;' },
              ],
            },
            {
              id: 'natural',
              title: 'Natural',
              layers: [
                { key: 'dayNight', label: t('components.deckgl.layers.dayNight'), icon: '&#127757;' },
                { key: 'weatherRadar', label: 'Weather Radar', icon: '&#127782;' },
                { key: 'weather', label: 'Weather Alerts', icon: '&#9928;' },
                { key: 'waterTemperature', label: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp', icon: '&#127754;' },
                { key: 'climate', label: t('components.deckgl.layers.climateAnomalies'), icon: '&#127787;' },
                { key: 'aqi', label: 'Air Quality', icon: '💨' },
                { key: 'fires', label: t('components.deckgl.layers.fires'), icon: '&#128293;' },
                { key: 'natural', label: t('components.deckgl.layers.naturalEvents'), icon: '&#127755;' },
                { key: 'agriculturalStressDI', label: 'Drought Intensity', icon: '&#127806;' },
                { key: 'agriculturalStressVCI', label: 'Vegetation Conditions', icon: '&#127806;' },
              ],
            },
          ];
  }

  private createLayerToggles(): void {
    const toggles = document.createElement('div');
    toggles.className = 'layer-toggles deckgl-layer-toggles';

    const categories = this.getLayerCategories();

    toggles.innerHTML = `
      <div class="toggle-header">
        <span>${t('components.deckgl.layersTitle')}</span>
        <div class="toggle-header-actions">
          <button class="layer-expand-all-btn" title="Expand / collapse all categories" aria-label="Toggle all categories">&#8645;</button>
          <button class="layer-help-btn" title="${t('components.deckgl.layerGuide')}">?</button>
          <button class="toggle-collapse" title="Collapse panel">&#9660;</button>
        </div>
      </div>
      <div class="toggle-list" style="max-height: 48vh; overflow-y: auto; scrollbar-width: thin;">
        ${categories.map((cat, catIndex) => {
          const activeCount = cat.layers.filter(item => Boolean(this.state.layers[item.key])).length;
          const isExpanded = activeCount > 0 || catIndex === 0;
          return `
            <div class="layer-category-group" data-category="${cat.id}">
              <button type="button" class="layer-category-header" aria-expanded="${isExpanded ? 'true' : 'false'}">
                <span class="category-title">
                  <span class="category-name">${cat.title}</span>
                </span>
                <span class="category-meta">
                  <span class="category-badge ${activeCount > 0 ? 'has-active' : ''}">${activeCount}</span>
                  <span class="category-chevron">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                </span>
              </button>
              <div class="layer-category-list ${isExpanded ? '' : 'collapsed'}">
                ${cat.layers.map(({ key, label, icon }) => `
                  <label class="layer-toggle" data-layer="${key}">
                    <input type="checkbox" ${this.state.layers[key] ? 'checked' : ''}>
                    <span class="toggle-icon">${icon}</span>
                    <span class="toggle-label">${label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.container.appendChild(toggles);

    // Bind category expand/collapse toggles
    toggles.querySelectorAll('.layer-category-header').forEach(headerBtn => {
      headerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const group = headerBtn.closest('.layer-category-group');
        const list = group?.querySelector('.layer-category-list');
        const chevron = headerBtn.querySelector('.category-chevron');
        if (list) {
          const isNowCollapsed = list.classList.toggle('collapsed');
          headerBtn.setAttribute('aria-expanded', isNowCollapsed ? 'false' : 'true');
          if (chevron) {
            chevron.innerHTML = isNowCollapsed ? '&#9654;' : '&#9660;';
          }
        }
      });
    });

    // Expand / collapse all categories button
    const expandAllBtn = toggles.querySelector('.layer-expand-all-btn');
    expandAllBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const lists = toggles.querySelectorAll('.layer-category-list');
      const headers = toggles.querySelectorAll('.layer-category-header');
      const anyCollapsed = Array.from(lists).some(l => l.classList.contains('collapsed'));
      lists.forEach(l => {
        l.classList.toggle('collapsed', !anyCollapsed);
      });
      headers.forEach(h => {
        h.setAttribute('aria-expanded', anyCollapsed ? 'true' : 'false');
        const chevron = h.querySelector('.category-chevron');
        if (chevron) {
          chevron.innerHTML = anyCollapsed ? '&#9660;' : '&#9654;';
        }
      });
    });

    // Bind toggle events
    toggles.querySelectorAll('.layer-toggle input').forEach(input => {
      input.addEventListener('change', () => {
        const layer = (input as HTMLInputElement).closest('.layer-toggle')?.getAttribute('data-layer') as keyof MapLayers;
        if (layer) {
          const checked = (input as HTMLInputElement).checked;
          this.state.layers[layer] = checked;
          this.setLayers({ ...this.state.layers });
          if (layer === 'weatherRadar') {
            if (checked) {
              this.setLayerLoading('weatherRadar', true);
              setTimeout(() => {
                this.setLayerLoading('weatherRadar', false);
                this.setLayerReady('weatherRadar', true);
              }, 400);
            } else {
              this.setLayerLoading('weatherRadar', false);
              this.setLayerReady('weatherRadar', false);
            }
          }
          this.onLayerChange?.(layer, checked, 'user');
          this.updateCategoryCounts();
        }
      });
    });

    // Help button
    const helpBtn = toggles.querySelector('.layer-help-btn');
    helpBtn?.addEventListener('click', () => this.showLayerHelp());

    // Collapse toggle
    const collapseBtn = toggles.querySelector('.toggle-collapse');
    const toggleList = toggles.querySelector('.toggle-list');

    // Manual scroll: intercept wheel, prevent map zoom, scroll the list ourselves
    if (toggleList) {
      toggles.addEventListener('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleList.scrollTop += e.deltaY;
      }, { passive: false });
      toggles.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }
    collapseBtn?.addEventListener('click', () => {
      toggleList?.classList.toggle('collapsed');
      if (collapseBtn) collapseBtn.innerHTML = toggleList?.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
    });

    this.updateCategoryCounts();
  }

  private updateCategoryCounts(): void {
    const categories = this.container.querySelectorAll('.layer-category-group');
    categories.forEach(catEl => {
      const inputs = catEl.querySelectorAll('.layer-toggle input') as NodeListOf<HTMLInputElement>;
      let activeCount = 0;
      inputs.forEach(input => {
        if (input.checked) activeCount++;
      });
      const badge = catEl.querySelector('.category-badge');
      if (badge) {
        badge.textContent = String(activeCount);
        badge.classList.toggle('has-active', activeCount > 0);
      }
    });
  }

  private getLayerDescriptionKey(key: keyof MapLayers): string {
    if (SITE_VARIANT === 'tech') {
      switch (key) {
        case 'cables': return 'infraCables';
        case 'datacenters': return 'infraDatacenters';
        case 'fires': return 'techFires';
        case 'natural': return 'naturalEventsTech';
      }
    } else if (SITE_VARIANT === 'finance') {
      switch (key) {
        case 'cables': return 'financeCables';
        case 'pipelines': return 'financePipelines';
        case 'outages': return 'financeOutages';
        case 'waterways': return 'macroWaterways';
        case 'weather': return 'weatherAlertsMarket';
        case 'natural': return 'naturalEventsMacro';
      }
    }

    switch (key) {
      case 'alertStatus': return 'alertStatusDesc';
      case 'hotspots': return 'geoHotspots';
      case 'threatScore': return 'threatScoreDesc';
      case 'pipelines': return 'infraPipelinesFull';
      case 'cables': return 'infraCablesFull';
      case 'spaceports': return 'militarySpaceports';
      case 'datacenters': return 'infraDatacentersFull';
      case 'radiation': return 'radiationDesc';
      case 'minerals': return 'mineralsFull';
      case 'nuclear': return 'militaryNuclear';
      case 'agriculturalStressASI': return 'agriculturalStressASIDesc';
      case 'bgpAnomalies': return 'bgpAnomaliesDesc';
      case 'military': return 'militaryActivity';
      case 'conflicts': return 'geoConflicts';
      case 'bases': return 'militaryBases';
      case 'irradiators': return 'militaryIrradiators';
      case 'ais': return 'transportShipping';
      case 'flights': return 'transportDelays';
      case 'waterways': return 'waterwaysLabels';
      case 'tradeRoutes': return 'tradeRoutes';
      case 'gpsJamming': return 'gpsJammingDesc';
      case 'dayNight': return 'dayNight';
      case 'weatherRadar': return 'weatherRadarDesc';
      case 'weather': return 'weatherAlerts';
      case 'waterTemperature': return 'waterTemperatureDesc';
      case 'climate': return 'climateAnomalies';
      case 'aqi': return 'aqiDesc';
      case 'fires': return 'firesFull';
      case 'natural': return 'naturalEventsFull';
      case 'agriculturalStressDI': return 'agriculturalStressDIDesc';
      case 'agriculturalStressVCI': return 'agriculturalStressVCIDesc';
      case 'outages': return 'infraOutages';
      case 'sanctions': return 'geoSanctions';
      case 'protests': return 'geoProtests';
      case 'economic': return 'economicCentersDesc';
      case 'startupHubs': return 'techStartupHubs';
      case 'techHQs': return 'techHQs';
      case 'accelerators': return 'techAccelerators';
      case 'cloudRegions': return 'techCloudRegions';
      case 'techEvents': return 'techEvents';
      case 'stockExchanges': return 'financeExchanges';
      case 'financialCenters': return 'financeCenters';
      case 'centralBanks': return 'financeCentralBanks';
      case 'commodityHubs': return 'financeCommodityHubs';
      case 'gulfInvestments': return 'financeGulfInvestments';
      case 'positiveEvents': return 'positiveEventsDesc';
      case 'kindness': return 'kindnessDesc';
      case 'happiness': return 'happinessDesc';
      case 'speciesRecovery': return 'speciesRecoveryDesc';
      case 'renewableInstallations': return 'renewableInstallationsDesc';
      default: return key;
    }
  }

  /** Show layer help popup explaining each layer */
  private showLayerHelp(): void {
    const existing = this.container.querySelector('.layer-help-popup');
    if (existing) {
      existing.remove();
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'layer-help-popup';

    const staticLabel = (labelKey: string): string => t(`components.deckgl.layerHelp.labels.${labelKey}`).toUpperCase();
    const helpItem = (layerLabel: string, descriptionKey: string, icon?: string): string =>
      `<div class="layer-help-item"><span>${icon ? `${icon} ` : ''}${layerLabel}</span> ${t(`components.deckgl.layerHelp.descriptions.${descriptionKey}`)}</div>`;
    const helpSection = (title: string, items: string[], noteKey?: string): string => `
      <div class="layer-help-section">
        <div class="layer-help-title">${title}</div>
        ${items.join('')}
        ${noteKey ? `<div class="layer-help-note">${t(`components.deckgl.layerHelp.notes.${noteKey}`)}</div>` : ''}
      </div>
    `;
    const helpHeader = `
      <div class="layer-help-header">
        <span>${t('components.deckgl.layerHelp.title')}</span>
        <button class="layer-help-close">×</button>
      </div>
    `;

    const categories = this.getLayerCategories();

    const timeFilterSection = helpSection(
      t('components.deckgl.layerHelp.sections.timeFilter'),
      [
        helpItem(staticLabel('timeRecent'), 'timeRecent'),
        helpItem(staticLabel('timeExtended'), 'timeExtended'),
      ],
      'timeAffects'
    );

    const categorySections = categories.map(cat => {
      const items = cat.layers.map(layer => {
        const descKey = this.getLayerDescriptionKey(layer.key);
        return helpItem(layer.label.toUpperCase(), descKey, layer.icon);
      });
      return helpSection(cat.title, items);
    }).join('');

    const overlaySection = helpSection(
      t('components.deckgl.layerHelp.sections.labels'),
      [
        helpItem(staticLabel('countries'), 'countriesOverlay', '&#127757;'),
      ]
    );

    popup.innerHTML = `
      ${helpHeader}
      <div class="layer-help-content">
        ${timeFilterSection}
        ${categorySections}
        ${overlaySection}
      </div>
    `;

    popup.querySelector('.layer-help-close')?.addEventListener('click', () => popup.remove());

    // Prevent scroll events from propagating to map
    const content = popup.querySelector('.layer-help-content');
    if (content) {
      content.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
      content.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }

    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          popup.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);

    this.container.appendChild(popup);
  }

  private createLegend(): void {
    const legend = document.createElement('div');
    legend.className = 'map-legend deckgl-legend';
    this.legendElement = legend;

    this.renderLegend();
    this.container.appendChild(legend);

    window.addEventListener('theme-changed', () => {
      if (this.legendElement) {
        this.renderLegend();
      }
    });
  }

  private renderLegend(): void {
    if (!this.legendElement) return;

    const isLight = getCurrentTheme() === 'light';
    const isOpen = this.isLegendOpen;

    const shapes = {
      circle: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><circle cx="7" cy="7" r="5.5" fill="${color}"/></svg>`,
      diamond: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 13,7 7,13 1,7" fill="${color}"/></svg>`,
      triangleUp: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 13,12 1,12" fill="${color}"/></svg>`,
      triangleDown: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="1,2 13,2 7,13" fill="${color}"/></svg>`,
      square: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><rect x="2" y="2" width="10" height="10" rx="1.5" fill="${color}"/></svg>`,
      hexagon: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4" fill="${color}"/></svg>`,
      pentagon: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 13,5.5 11,12.5 3,12.5 1,5.5" fill="${color}"/></svg>`,
      star: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 8.8,5.2 13.2,5.2 9.7,8.2 11,12.5 7,9.8 3,12.5 4.3,8.2 0.8,5.2 5.2,5.2" fill="${color}"/></svg>`,
      ring: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><circle cx="7" cy="7" r="5.5" fill="none" stroke="${color}" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="${color}"/></svg>`,
      cross: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><path d="M3 2 L2 3 L5.5 7 L2 11 L3 12 L7 8.5 L11 12 L12 11 L8.5 7 L12 3 L11 2 L7 5.5 Z" fill="${color}"/></svg>`,
      shield: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><path d="M7 1 L12 2.8 V6.6 C12 9.8 9.5 12.5 7 13.5 C4.5 12.5 2 9.8 2 6.6 V2.8 Z" fill="${color}"/></svg>`,
      line: (color: string) => `<svg width="16" height="14" viewBox="0 0 16 14" class="legend-shape-svg"><line x1="1" y1="7" x2="15" y2="7" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`,
      octagon: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="4.5,1 9.5,1 13,4.5 13,9.5 9.5,13 4.5,13 1,9.5 1,4.5" fill="${color}"/></svg>`,
      delta: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><polygon points="7,1 13,12.5 7,10 1,12.5" fill="${color}"/></svg>`,
      warship: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><path d="M7 1 L11.5 5 L11 12.5 L3 12.5 L2.5 5 Z" fill="${color}"/></svg>`,
      tacticalCircle: (color: string) => `<svg width="14" height="14" viewBox="0 0 14 14" class="legend-shape-svg"><circle cx="7" cy="7" r="5.5" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="${color}"/></svg>`,
      heatmap: () => `<svg width="18" height="14" viewBox="0 0 18 14" class="legend-shape-svg"><defs><linearGradient id="legendGpsHeatGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ffffb2"/><stop offset="35%" stop-color="#fecc5c"/><stop offset="70%" stop-color="#fd8d3c"/><stop offset="100%" stop-color="#bd0026"/></linearGradient></defs><rect x="1" y="2" width="16" height="10" rx="2" fill="url(#legendGpsHeatGrad)"/></svg>`,
      sstHeatmap: () => `<svg width="18" height="14" viewBox="0 0 18 14" class="legend-shape-svg"><defs><linearGradient id="legendSstHeatGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#40004b"/><stop offset="15%" stop-color="#2166ac"/><stop offset="32%" stop-color="#4393c3"/><stop offset="50%" stop-color="#92c5de"/><stop offset="68%" stop-color="#fee090"/><stop offset="85%" stop-color="#d6604d"/><stop offset="100%" stop-color="#67001f"/></linearGradient></defs><rect x="1" y="2" width="16" height="10" rx="2" fill="url(#legendSstHeatGrad)"/></svg>`,
    };

    interface LegendCategoryDef {
      title: string;
      items: Array<{
        shape: string;
        badge: string;
        name: string;
        desc: string;
        subswatches?: Array<{ color: string; label: string }>;
      }>;
    }

    let categories: LegendCategoryDef[] = [];

    if (SITE_VARIANT === 'tech') {
      categories = [
        {
          title: 'Tech Ecosystem',
          items: [
            { shape: shapes.circle(isLight ? '#16a34a' : '#22c55e'), badge: 'Circle', name: t('components.deckgl.layers.startupHubs'), desc: 'Major startup capitals & venture ecosystems (Silicon Valley, Tel Aviv, Tokyo, etc.).' },
            { shape: shapes.circle('#38bdf8'), badge: 'Circle', name: t('components.deckgl.layers.techHQs'), desc: 'Headquarters of public technology leaders and prominent unicorns.' },
            { shape: shapes.circle(isLight ? '#d97706' : '#f59e0b'), badge: 'Circle', name: t('components.deckgl.layers.accelerators'), desc: 'Premier startup incubators and global accelerator campuses.' },
            { shape: shapes.circle('#a855f7'), badge: 'Circle', name: t('components.deckgl.layers.cloudRegions'), desc: 'AWS, Azure, and Google Cloud global availability zone regions.' },
            { shape: shapes.circle('#ec4899'), badge: 'Circle', name: t('components.deckgl.layers.techEvents'), desc: 'Global technology developer summits, hacker conventions, and conferences.' },
          ],
        },
        {
          title: 'Infrastructure',
          items: [
            { shape: shapes.square('#a855f7'), badge: 'Square', name: t('components.deckgl.layers.aiDataCenters'), desc: 'Hyperscale AI compute facilities with ≥10,000 GPUs.' },
            { shape: shapes.line('#38bdf8'), badge: 'Line Path', name: t('components.deckgl.layers.underseaCables'), desc: 'Transoceanic high-bandwidth fiber optic submarine routes.' },
            {
              shape: shapes.ring('#14b8a6'),
              badge: 'Concentric Ring',
              name: t('components.deckgl.layers.radiation'),
              desc: 'Continuous radiation detection stations with normalized CPM dose levels.',
              subswatches: [
                { color: '#14b8a6', label: 'Normal' },
                { color: '#f97316', label: 'Elevated' },
                { color: '#ef4444', label: 'High' },
              ],
            },
          ],
        },
        {
          title: 'Aviation & Natural',
          items: [
            { shape: shapes.circle('#f59e0b'), badge: 'Dot', name: t('components.deckgl.layers.flightDelays'), desc: 'Commercial airport ground stops and FAA delay advisories.' },
            { shape: shapes.circle('#ef4444'), badge: 'Thermal Dot', name: t('components.deckgl.layers.fires'), desc: 'NASA FIRMS active wildfire and industrial heat detections.' },
            { shape: shapes.circle('#06b6d4'), badge: 'Beacon', name: t('components.deckgl.layers.naturalEvents'), desc: 'Seismic events and severe weather alerts near tech clusters.' },
          ],
        },
      ];
    } else if (SITE_VARIANT === 'finance') {
      categories = [
        {
          title: 'Financial Markets',
          items: [
            { shape: shapes.circle('#facc15'), badge: 'Circle', name: t('components.deckgl.layers.stockExchanges'), desc: 'Equities and derivatives exchanges categorized by market tier.' },
            { shape: shapes.circle('#22c55e'), badge: 'Circle', name: t('components.deckgl.layers.financialCenters'), desc: 'Global and regional banking, capital market, and liquidity capitals.' },
            { shape: shapes.hexagon('#facc15'), badge: 'Hexagon', name: t('components.deckgl.layers.centralBanks'), desc: 'Monetary policy institutions and federal reserve systems worldwide.' },
            { shape: shapes.square('#f97316'), badge: 'Square', name: t('components.deckgl.layers.commodityHubs'), desc: 'Key energy, metals, and agricultural storage and trade depots.' },
            { shape: shapes.circle('#ec4899'), badge: 'Circle', name: t('components.deckgl.layers.gulfInvestments'), desc: 'GCC sovereign wealth fund mega-investments and strategic FDI flows.' },
          ],
        },
        {
          title: 'Infrastructure & Trade',
          items: [
            { shape: shapes.line('#06b6d4'), badge: 'Shipping Lane', name: t('components.deckgl.layers.tradeRoutes'), desc: 'Primary international container shipping lanes connecting trade hubs.' },
            { shape: shapes.line('#38bdf8'), badge: 'Line Path', name: t('components.deckgl.layers.underseaCables'), desc: 'Low-latency submarine fiber routes linking financial centers.' },
            { shape: shapes.line('#f59e0b'), badge: 'Pipeline', name: t('components.deckgl.layers.pipelines'), desc: 'Strategic crude oil and natural gas energy pipelines.' },
            { shape: shapes.triangleUp('#38bdf8'), badge: 'Triangle', name: t('components.deckgl.layers.strategicWaterways'), desc: 'Strategic maritime chokepoints and canals (Suez, Panama, Hormuz).' },
          ],
        },
      ];
    } else if (SITE_VARIANT === 'happy') {
      categories = [
        {
          title: 'Well-being & Kindness',
          items: [
            { shape: shapes.circle('#22c55e'), badge: 'Circle', name: 'Positive Events', desc: 'Global scientific breakthroughs, peaceful diplomacy, and recovery milestones.' },
            { shape: shapes.circle('#4ade80'), badge: 'Circle', name: 'Acts of Kindness', desc: 'Verified community support, humanitarian aid, and mutual assistance.' },
            { shape: shapes.square('#22c55e'), badge: 'Square', name: 'World Happiness', desc: 'Top ranked countries from the annual World Happiness Report.' },
            { shape: shapes.circle('#38bdf8'), badge: 'Circle', name: 'Species Recovery', desc: 'Endangered wildlife restoration and protected marine reserves.' },
            { shape: shapes.circle('#facc15'), badge: 'Circle', name: 'Clean Energy', desc: 'Major solar, wind, and battery grid storage installations.' },
          ],
        },
        {
          title: 'Natural Environment',
          items: [
            { shape: shapes.circle('#06b6d4'), badge: 'Circle', name: 'Natural Events', desc: 'Monitored seismic events, storm cycles, and climate patterns.' },
          ],
        },
      ];
    } else {
      // Geopolitical (Default)
      categories = [
        {
          title: 'Infrastructure',
          items: [
            {
              shape: shapes.hexagon(isLight ? '#d97706' : '#eab308'),
              badge: 'Hexagon',
              name: t('components.deckgl.layers.nuclearSites'),
              desc: 'Civilian nuclear power reactors, research facilities, and uranium fuel enrichment sites.',
              subswatches: [
                { color: isLight ? '#d97706' : '#eab308', label: 'Operational' },
                { color: '#ef4444', label: 'Contested' },
              ],
            },
            {
              shape: shapes.square('#a855f7'),
              badge: 'Square',
              name: t('components.deckgl.layers.aiDataCenters'),
              desc: 'Hyperscale AI compute clusters, sovereign GPU campuses, and training facilities operating ≥10,000 chips.',
            },
            {
              shape: shapes.star('#c084fc'),
              badge: 'Star',
              name: t('components.deckgl.layers.spaceports'),
              desc: 'Orbital and suborbital space launch complexes, military rocket ranges, and commercial spaceports.',
            },
            {
              shape: shapes.ring('#14b8a6'),
              badge: 'Concentric Ring',
              name: t('components.deckgl.layers.radiation'),
              desc: 'Real-time gamma radiation stations (EPA RadNet, Chernobyl, Safecast) with ambient dose rates.',
              subswatches: [
                { color: '#14b8a6', label: 'Normal' },
                { color: '#f97316', label: 'Elevated' },
                { color: '#ef4444', label: 'High Alert' },
              ],
            },
            {
              shape: shapes.triangleDown('#ec4899'),
              badge: 'Down Triangle',
              name: t('components.deckgl.layers.gammaIrradiators'),
              desc: 'Industrial high-activity gamma sterilization and phytosanitary processing units using Cobalt-60 / Cesium-137.',
            },
            {
              shape: shapes.pentagon('#06b6d4'),
              badge: 'Pentagon',
              name: t('components.deckgl.layers.criticalMinerals'),
              desc: 'Strategic mine sites and refining facilities essential for defense, energy, and electronics supply chains.',
              subswatches: [
                { color: '#06b6d4', label: 'Lithium' },
                { color: '#6366f1', label: 'Cobalt' },
                { color: '#ec4899', label: 'Rare Earths' },
                { color: '#22c55e', label: 'Nickel' },
              ],
            },
            {
              shape: shapes.line('#38bdf8'),
              badge: 'Path Line',
              name: t('components.deckgl.layers.underseaCables'),
              desc: 'Transoceanic submarine fiber optic cables carrying intercontinental internet traffic and landing stations.',
            },
            {
              shape: shapes.line('#f59e0b'),
              badge: 'Path Line',
              name: t('components.deckgl.layers.pipelines'),
              desc: 'Strategic transnational crude oil, refined petroleum, and natural gas transmission pipelines.',
            },
          ],
        },
        {
          title: 'Military & Geopolitical',
          items: [
            {
              shape: shapes.triangleUp('#3b82f6'),
              badge: 'Up Triangle',
              name: t('components.deckgl.layers.militaryBases'),
              desc: 'Strategic airfields, naval stations, radar installations, and joint operational headquarters (150+ sites).',
              subswatches: [
                { color: '#3b82f6', label: 'US/NATO' },
                { color: '#ef4444', label: 'Russia' },
                { color: '#f97316', label: 'China' },
                { color: '#06b6d4', label: 'UK' },
                { color: '#0055a4', label: 'France' },
                { color: '#f59e0b', label: 'India' },
                { color: '#bc002d', label: 'Japan' },
              ],
            },
            {
              shape: shapes.delta('#3b82f6'),
              badge: 'Delta Arrow',
              name: 'Military Aircraft',
              desc: 'Live airborne reconnaissance (AWACS), tankers, tactical transports, and combat patrols oriented along heading vector. Color-coded by nation.',
              subswatches: [
                { color: '#3b82f6', label: 'USA' },
                { color: '#38bdf8', label: 'UK' },
                { color: '#2563eb', label: 'France' },
                { color: '#eab308', label: 'Germany' },
                { color: '#06b6d4', label: 'Israel' },
                { color: '#10b981', label: 'Australia / Allies' },
                { color: '#94a3b8', label: 'Other' },
              ],
            },
            {
              shape: shapes.warship('#3b82f6'),
              badge: 'Warship Hull',
              name: 'Naval Combatants',
              desc: 'Active carrier strike groups, amphibious ready groups, and surface combatants oriented along heading. Color-coded by nation.',
              subswatches: [
                { color: '#3b82f6', label: 'USA / USNI' },
                { color: '#38bdf8', label: 'UK' },
                { color: '#2563eb', label: 'France' },
                { color: '#10b981', label: 'Australia / Allies' },
                { color: '#ff3b30', label: 'China' },
                { color: '#94a3b8', label: 'Other' },
              ],
            },
            {
              shape: shapes.tacticalCircle('#3b82f6'),
              badge: 'Translucent Circle',
              name: 'Tactical Grouping (Wide Zoom)',
              desc: 'At wider zoom levels (zoom < 4.5), air and naval assets are grouped into transparent tactical circles with asset counts to eliminate map clutter, seamlessly fading into individual asset points as you zoom in.',
            },
            {
              shape: shapes.octagon('#ef4444'),
              badge: 'Octagon',
              name: t('components.deckgl.layers.threatScore') || 'Threat Score',
              desc: 'Dynamic composite threat severity index calculated from breaking intelligence, source credibility, and temporal decay.',
              subswatches: [
                { color: '#22c55e', label: 'Low (<0.5)' },
                { color: '#eab308', label: 'Medium (0.5-1.0)' },
                { color: '#f97316', label: 'High (1.0-1.5)' },
                { color: '#ef4444', label: 'Critical (1.5-3.0)' },
                { color: '#b91c1c', label: 'Extreme (≥3.0)' },
              ],
            },
            {
              shape: shapes.diamond('#ef4444'),
              badge: 'Diamond',
              name: t('components.deckgl.layers.intelHotspots'),
              desc: 'Geopolitical tension regions, crisis flashpoints, and active conflict zones with escalation severity.',
              subswatches: [
                { color: '#ef4444', label: 'High / Breaking' },
                { color: '#f97316', label: 'Elevated' },
                { color: isLight ? '#d97706' : '#eab308', label: 'Monitoring' },
              ],
            },
            {
              shape: shapes.line('#ef4444'),
              badge: 'Zone',
              name: t('components.deckgl.layers.conflictZones'),
              desc: 'Active war theaters, contested borders, and military frontlines.',
            },
          ],
        },
        {
          title: 'Electronic Warfare & Signals',
          items: [
            {
              shape: shapes.heatmap(),
              badge: 'Heatmap',
              name: t('components.deckgl.layers.gpsJamming') || 'GPS Jamming',
              desc: 'Real-time satellite navigation interference and aircraft GPS/GNSS signal degradation detected via crowdsourced flight telemetry.',
              subswatches: [
                { color: '#bd0026', label: 'Severe (≥10%)' },
                { color: '#fd8d3c', label: 'Moderate (2-10%)' },
                { color: '#ffffb2', label: 'Low (<2%)' },
              ],
            },
            {
              shape: shapes.line('#a855f7'),
              badge: 'Route Anomaly',
              name: t('components.deckgl.layers.bgpAnomalies'),
              desc: 'Global BGP route leaks, origin hijacks, and suspicious traffic redirection detected via Cloudflare Radar.',
            },
          ],
        },
        {
          title: 'Natural',
          items: [
            {
              shape: shapes.circle('#f97316'),
              badge: 'Seismic Ring',
              name: t('components.deckgl.layers.naturalEvents'),
              desc: 'Real-time seismic earthquakes from USGS scaled by magnitude and depth, plus volcanic and storm events.',
            },
            {
              shape: shapes.circle('#ef4444'),
              badge: 'Thermal Dot',
              name: t('components.deckgl.layers.fires'),
              desc: 'Active thermal infrared anomaly detections and wildfires from NASA FIRMS (VIIRS / MODIS satellites).',
            },
            {
              shape: shapes.circle('#06b6d4'),
              badge: 'Weather Alert',
              name: t('components.deckgl.layers.weather'),
              desc: 'Severe weather alerts, gale bulletins, and flood warnings from national meteorological services.',
            },
            {
              shape: shapes.sstHeatmap(),
              badge: 'SST Heatmap',
              name: t('components.deckgl.layers.waterTemperature') || 'Water Surface Temp',
              desc: 'Global high-resolution sea surface temperature analysis from NASA GHRSST (MUR L4).',
              subswatches: [
                { color: '#2166ac', label: 'Polar (-2°C)' },
                { color: '#4393c3', label: 'Cool (8°C)' },
                { color: '#fee090', label: 'Mild (18°C)' },
                { color: '#d6604d', label: 'Warm (26°C)' },
                { color: '#67001f', label: 'Tropical (35°C)' },
              ],
            },
          ],
        },
      ];
    }

    const categoriesHtml = categories.map(cat => `
      <div class="legend-category-section">
        <div class="legend-category-title">${escapeHtml(cat.title)}</div>
        <div class="legend-category-items">
          ${cat.items.map(item => `
            <div class="legend-item-row">
              <div class="legend-shape-preview">${item.shape}</div>
              <div class="legend-item-details">
                <div class="legend-item-header">
                  <span class="legend-item-name">${escapeHtml(item.name)}</span>
                  <span class="legend-item-badge">${escapeHtml(item.badge)}</span>
                </div>
                <div class="legend-item-desc">${escapeHtml(item.desc)}</div>
                ${item.subswatches && item.subswatches.length > 0 ? `
                  <div class="legend-subswatches">
                    ${item.subswatches.map(sw => `
                      <span class="legend-subswatch">
                        <span class="legend-subswatch-dot" style="background:${sw.color}"></span>
                        <span>${escapeHtml(sw.label)}</span>
                      </span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    this.legendElement.innerHTML = `
      <button type="button" class="legend-trigger-btn ${isOpen ? 'active' : ''}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-haspopup="true" title="View layer descriptions and map shapes">
        <span class="legend-trigger-preview">
          ${shapes.diamond('#ef4444')}
          ${shapes.triangleUp('#3b82f6')}
          ${shapes.hexagon(isLight ? '#d97706' : '#eab308')}
          ${shapes.square('#a855f7')}
          ${shapes.ring('#14b8a6')}
        </span>
        <span class="legend-trigger-label">${t('components.deckgl.legend.title') || 'LEGEND'}</span>
        <span class="legend-trigger-chevron">&#9650;</span>
      </button>
      <div class="legend-menu-popup ${isOpen ? 'open' : ''}" aria-hidden="${isOpen ? 'false' : 'true'}">
        <div class="legend-menu-header">
          <div class="legend-menu-header-text">
            <span class="legend-menu-title">MAP DATAPOINT TYPES</span>
            <span class="legend-menu-subtitle">Distinguishable shapes and layer classifications</span>
          </div>
          <button type="button" class="legend-menu-close" aria-label="Close legend">&times;</button>
        </div>
        <div class="legend-menu-body">
          ${categoriesHtml}
        </div>
      </div>
    `;

    const triggerBtn = this.legendElement.querySelector('.legend-trigger-btn');
    const closeBtn = this.legendElement.querySelector('.legend-menu-close');
    const menuBody = this.legendElement.querySelector('.legend-menu-body');

    triggerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLegend();
    });

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeLegend();
    });

    if (menuBody) {
      menuBody.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
      menuBody.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }
  }

  private toggleLegend(): void {
    if (this.isLegendOpen) {
      this.closeLegend();
    } else {
      this.openLegend();
    }
  }

  private openLegend(): void {
    this.isLegendOpen = true;
    const triggerBtn = this.legendElement?.querySelector('.legend-trigger-btn');
    const popup = this.legendElement?.querySelector('.legend-menu-popup');
    triggerBtn?.classList.add('active');
    triggerBtn?.setAttribute('aria-expanded', 'true');
    popup?.classList.add('open');
    popup?.setAttribute('aria-hidden', 'false');

    document.addEventListener('click', this.handleLegendOutsideClick);
    document.addEventListener('keydown', this.handleLegendKeydown);
  }

  private closeLegend(): void {
    this.isLegendOpen = false;
    const triggerBtn = this.legendElement?.querySelector('.legend-trigger-btn');
    const popup = this.legendElement?.querySelector('.legend-menu-popup');
    triggerBtn?.classList.remove('active');
    triggerBtn?.setAttribute('aria-expanded', 'false');
    popup?.classList.remove('open');
    popup?.setAttribute('aria-hidden', 'true');

    document.removeEventListener('click', this.handleLegendOutsideClick);
    document.removeEventListener('keydown', this.handleLegendKeydown);
  }

  private handleLegendOutsideClick = (e: MouseEvent): void => {
    if (!this.legendElement?.contains(e.target as Node)) {
      this.closeLegend();
    }
  };

  private handleLegendKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.closeLegend();
    }
  };

  private createWaterTempLegend(): void {
    this.waterTempLegend = document.createElement('div');
    this.waterTempLegend.className = 'water-temp-legend';
    this.waterTempLegend.style.display = this.state.layers.waterTemperature ? 'flex' : 'none';
    this.waterTempLegend.innerHTML = `
      <div class="water-temp-title">
        <span>🌊 Water Surface Temp</span>
        <span class="water-temp-source">NASA GIBS</span>
      </div>
      <div class="water-temp-gradient"></div>
      <div class="water-temp-labels">
        <span>-2°C</span>
        <span>8°C</span>
        <span>18°C</span>
        <span>26°C</span>
        <span>35°C</span>
      </div>
    `;
    this.container.appendChild(this.waterTempLegend);
  }

  // Public API methods (matching MapComponent interface)
  public render(): void {
    if (this.renderPaused) {
      this.renderPending = true;
      return;
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateLayers();
    });
  }

  public setRenderPaused(paused: boolean): void {
    if (this.renderPaused === paused) return;
    this.renderPaused = paused;
    if (paused) {
      this.stopPulseAnimation();
      return;
    }

    this.syncPulseAnimation();
    if (!paused && this.renderPending) {
      this.renderPending = false;
      this.render();
    }
  }

  private updateLayers(): void {
    if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
    const startTime = performance.now();
    try {
      this.deckOverlay?.setProps({ layers: this.buildLayers() });
    } catch { /* map may be mid-teardown (null.getProjection) */ }
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] updateLayers took ${elapsed.toFixed(2)}ms (>16ms budget)`);
    }
  }

  public setView(view: DeckMapView): void {
    this.state.view = view;
    const preset = VIEW_PRESETS[view];

    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [preset.longitude, preset.latitude],
        zoom: preset.zoom,
        duration: 1000,
      });
    }

    const viewSelect = this.container.querySelector('.view-select') as HTMLSelectElement;
    if (viewSelect) viewSelect.value = view;

    this.onStateChange?.(this.state);
  }

  public setZoom(zoom: number): void {
    this.state.zoom = zoom;
    if (this.maplibreMap) {
      this.maplibreMap.setZoom(zoom);
    }
  }

  public setCenter(lat: number, lon: number, zoom?: number): void {
    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [lon, lat],
        ...(zoom != null && { zoom }),
        duration: 500,
      });
    }
  }

  public getCenter(): { lat: number; lon: number } | null {
    if (this.maplibreMap) {
      const center = this.maplibreMap.getCenter();
      return { lat: center.lat, lon: center.lng };
    }
    return null;
  }

  public setTimeRange(range: TimeRange): void {
    this.state.timeRange = range;
    this.rebuildProtestSupercluster();
    this.rebuildTechEventSupercluster();
    this.onTimeRangeChange?.(range);
    this.updateTimeSliderButtons();
    this.render(); // Debounced
  }

  public getTimeRange(): TimeRange {
    return this.state.timeRange;
  }

  public setLayers(layers: MapLayers): void {
    this.state.layers = layers;
    this.render(); // Debounced

    // Update toggle checkboxes
    Object.entries(layers).forEach(([key, value]) => {
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${key}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = value;
    });

    this.updateCategoryCounts();

    // Fetch data for dynamic layers if they are enabled
    if (layers.gpsJamming) {
      this.fetchGpsJammingData();
    }
    if (layers.bgpAnomalies) {
      this.fetchBgpAnomaliesData();
    }
    if (layers.aqi) {
      this.fetchAQIData();
    }

    if (this.maplibreMap) {
      try {
        const isWeatherRadarEnabled = this.state.layers.weatherRadar;

        // 1. Prioritize primary Radar Layer first for instant first-try tile presentation
        if (isWeatherRadarEnabled) {
          if (!this.maplibreMap.getLayer('maptiler-radar') && this.mapTilerRadarLayer) {
            this.maplibreMap.addLayer(this.mapTilerRadarLayer as any);
            if (typeof this.mapTilerRadarLayer.animateByFactor === 'function') {
              this.mapTilerRadarLayer.animateByFactor(600);
            }
          } else if (this.maplibreMap.getLayer('maptiler-radar')) {
            this.maplibreMap.moveLayer('maptiler-radar');
          }
          this.setLayerReady('weatherRadar', true);
        } else {
          if (this.maplibreMap.getLayer('maptiler-radar')) {
            this.maplibreMap.removeLayer('maptiler-radar');
          }
        }

        // 2. Secondary weather layers (Precipitation & Pressure)
        if (isWeatherRadarEnabled) {
          if (!this.maplibreMap.getLayer('maptiler-precipitation') && this.mapTilerPrecipitationLayer) {
            this.maplibreMap.addLayer(this.mapTilerPrecipitationLayer as any);
            if (typeof this.mapTilerPrecipitationLayer.animateByFactor === 'function') {
              this.mapTilerPrecipitationLayer.animateByFactor(600);
            }
          } else if (this.maplibreMap.getLayer('maptiler-precipitation')) {
            this.maplibreMap.moveLayer('maptiler-precipitation');
          }

          if (!this.maplibreMap.getLayer('maptiler-pressure') && this.mapTilerPressureLayer) {
            this.maplibreMap.addLayer(this.mapTilerPressureLayer as any);
            if (typeof this.mapTilerPressureLayer.animateByFactor === 'function') {
              this.mapTilerPressureLayer.animateByFactor(600);
            }
          } else if (this.maplibreMap.getLayer('maptiler-pressure')) {
            this.maplibreMap.moveLayer('maptiler-pressure');
          }
        } else {
          if (this.maplibreMap.getLayer('maptiler-precipitation')) {
            this.maplibreMap.removeLayer('maptiler-precipitation');
          }
          if (this.maplibreMap.getLayer('maptiler-pressure')) {
            this.maplibreMap.removeLayer('maptiler-pressure');
          }
        }

        // 3. Instant open RainViewer radar tile fallback if MapTiler layer is not available
        if (isWeatherRadarEnabled && !this.mapTilerRadarLayer) {
          if (!this.maplibreMap.getSource('rainviewer-radar-source')) {
            this.maplibreMap.addSource('rainviewer-radar-source', {
              type: 'raster',
              tiles: ['https://tilecache.rainviewer.com/v2/radar/nowcast_10/256/{z}/{x}/{y}/2/1_1.png'],
              tileSize: 256,
            });
          }
          if (!this.maplibreMap.getLayer('rainviewer-radar-layer')) {
            this.maplibreMap.addLayer({
              id: 'rainviewer-radar-layer',
              type: 'raster',
              source: 'rainviewer-radar-source',
              paint: { 'raster-opacity': 0.8 },
            });
          }
          this.setLayerReady('weatherRadar', true);
        } else if (!isWeatherRadarEnabled) {
          if (this.maplibreMap.getLayer('rainviewer-radar-layer')) {
            this.maplibreMap.removeLayer('rainviewer-radar-layer');
          }
        }

        // Toggle Time Tracking Bar Visibility
        if (this.weatherTimeBar) {
          this.weatherTimeBar.style.display = isWeatherRadarEnabled ? 'flex' : 'none';
        }

        // Toggle Water Temperature Legend Visibility
        if (this.waterTempLegend) {
          this.waterTempLegend.style.display = layers.waterTemperature ? 'flex' : 'none';
        }

        // Lower render hierarchy for sea surface temperature so weather radar displays above it
        this.updateWaterTemperatureLayer(Boolean(layers.waterTemperature));
      } catch (e) {
        console.warn('[DeckGLMap] Failed to toggle weather layers:', e);
      }
    }
  }

  public getState(): DeckMapState {
    return { ...this.state };
  }

  // Zoom controls - public for external access
  public zoomIn(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomIn();
    }
  }

  public zoomOut(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomOut();
    }
  }

  private resetView(): void {
    this.setView('global');
  }

  private createUcdpEventsLayer(events: UcdpGeoEvent[]): ScatterplotLayer<UcdpGeoEvent> {
    return new ScatterplotLayer<UcdpGeoEvent>({
      id: 'ucdp-events-layer',
      data: events,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => Math.max(4000, Math.sqrt(d.deaths_best || 1) * 3000),
      getFillColor: (d) => {
        switch (d.type_of_violence) {
          case 'state-based': return COLORS.ucdpStateBased;
          case 'non-state': return COLORS.ucdpNonState;
          case 'one-sided': return COLORS.ucdpOneSided;
          default: return COLORS.ucdpStateBased;
        }
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 20,
      pickable: false,
    });
  }

  private createDisplacementArcsLayer(): ArcLayer<DisplacementFlow> {
    const withCoords = this.displacementFlows.filter(f => f.originLat != null && f.asylumLat != null);
    const top50 = withCoords.slice(0, 50);
    const maxCount = Math.max(1, ...top50.map(f => f.refugees));
    return new ArcLayer<DisplacementFlow>({
      id: 'displacement-arcs-layer',
      data: top50,
      getSourcePosition: (d) => [d.originLon!, d.originLat!],
      getTargetPosition: (d) => [d.asylumLon!, d.asylumLat!],
      getSourceColor: getCurrentTheme() === 'light' ? [50, 80, 180, 220] : [100, 150, 255, 180],
      getTargetColor: getCurrentTheme() === 'light' ? [20, 150, 100, 220] : [100, 255, 200, 180],
      getWidth: (d) => Math.max(1, (d.refugees / maxCount) * 8),
      widthMinPixels: 1,
      widthMaxPixels: 8,
      pickable: false,
    });
  }

  private createClimateLayers(): Layer[] {
    const layers: Layer[] = [];
    if (this.climateAnomalies.length === 0) return layers;

    const warmAnomalies = this.climateAnomalies.filter(a => a.type === 'warm' || a.tempDelta > 0);
    const coldAnomalies = this.climateAnomalies.filter(a => a.type === 'cold' || a.tempDelta < 0 || (a.type === 'wet' && a.tempDelta <= 0));

    // Ambient warm glow for positive temperature anomalies
    if (warmAnomalies.length > 0) {
      layers.push(new HeatmapLayer<ClimateAnomaly>({
        id: 'climate-warm-heatmap-layer',
        data: warmAnomalies,
        getPosition: (d) => [d.lon, d.lat],
        getWeight: (d) => Math.max(0.5, Math.abs(d.tempDelta) * 1.5 + (d.precipDelta < 0 ? Math.abs(d.precipDelta) * 0.05 : 0)),
        radiusPixels: 45,
        intensity: 0.7,
        threshold: 0.1,
        opacity: 0.45,
        colorRange: [
          [254, 240, 138],
          [251, 191, 36],
          [249, 115, 22],
          [239, 68, 68],
          [185, 28, 28],
        ],
        pickable: false,
      }));
    }

    // Ambient cool glow for negative temperature and wet anomalies
    if (coldAnomalies.length > 0) {
      layers.push(new HeatmapLayer<ClimateAnomaly>({
        id: 'climate-cold-heatmap-layer',
        data: coldAnomalies,
        getPosition: (d) => [d.lon, d.lat],
        getWeight: (d) => Math.max(0.5, Math.abs(d.tempDelta) * 1.5 + (d.precipDelta > 0 ? d.precipDelta * 0.05 : 0)),
        radiusPixels: 45,
        intensity: 0.7,
        threshold: 0.1,
        opacity: 0.45,
        colorRange: [
          [186, 230, 253],
          [56, 189, 248],
          [14, 165, 233],
          [37, 99, 235],
          [29, 78, 216],
        ],
        pickable: false,
      }));
    }

    // Interactive pickable nodes
    layers.push(new ScatterplotLayer<ClimateAnomaly>({
      id: 'climate-points-layer',
      data: this.climateAnomalies,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => (d.severity === 'extreme' ? 18000 : 12000),
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1.5,
      getLineColor: (d) => (d.severity === 'extreme' ? [255, 255, 255, 240] : [255, 255, 255, 180]),
      getFillColor: (d) => {
        if (d.type === 'warm' || d.tempDelta > 0) {
          return d.severity === 'extreme' ? [239, 68, 68, 240] : [249, 115, 22, 230];
        }
        if (d.type === 'cold' || d.tempDelta < 0) {
          return d.severity === 'extreme' ? [2, 132, 199, 240] : [14, 165, 233, 230];
        }
        if (d.type === 'wet') return [20, 184, 166, 230];
        if (d.type === 'dry') return [245, 158, 11, 230];
        return [168, 85, 247, 230];
      },
      pickable: true,
    }));

    // Pulse rings for extreme anomalies
    const extremeAnomalies = this.climateAnomalies.filter(a => a.severity === 'extreme');
    if (extremeAnomalies.length > 0) {
      const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
      layers.push(new ScatterplotLayer<ClimateAnomaly>({
        id: 'climate-points-pulse',
        data: extremeAnomalies,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 16000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 24,
        stroked: true,
        filled: false,
        getLineColor: (d) => (d.tempDelta > 0 ? [239, 68, 68, 140] : [14, 165, 233, 140]),
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    return layers;
  }

  private createTradeRoutesLayer(): ArcLayer<TradeRouteSegment> {
    const active: [number, number, number, number] = getCurrentTheme() === 'light' ? [30, 100, 180, 200] : [100, 200, 255, 160];
    const disrupted: [number, number, number, number] = getCurrentTheme() === 'light' ? [200, 40, 40, 220] : [255, 80, 80, 200];
    const highRisk: [number, number, number, number] = getCurrentTheme() === 'light' ? [200, 140, 20, 200] : [255, 180, 50, 180];
    const colorFor = (status: string): [number, number, number, number] =>
      status === 'disrupted' ? disrupted : status === 'high_risk' ? highRisk : active;

    return new ArcLayer<TradeRouteSegment>({
      id: 'trade-routes-layer',
      data: this.tradeRouteSegments,
      getSourcePosition: (d) => d.sourcePosition,
      getTargetPosition: (d) => d.targetPosition,
      getSourceColor: (d) => colorFor(d.status),
      getTargetColor: (d) => colorFor(d.status),
      getWidth: (d) => d.category === 'energy' ? 3 : 2,
      widthMinPixels: 1,
      widthMaxPixels: 6,
      greatCircle: true,
      pickable: false,
    });
  }

  private createTradeChokepointsLayer(): ScatterplotLayer {
    const routeWaypointIds = new Set<string>();
    for (const seg of this.tradeRouteSegments) {
      const route = TRADE_ROUTES_LIST.find(r => r.id === seg.routeId);
      if (route) for (const wp of route.waypoints) routeWaypointIds.add(wp);
    }
    const chokepoints = STRATEGIC_WATERWAYS.filter(w => routeWaypointIds.has(w.id));
    const isLight = getCurrentTheme() === 'light';

    return new ScatterplotLayer({
      id: 'trade-chokepoints-layer',
      data: chokepoints,
      getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
      getFillColor: isLight ? [200, 140, 20, 200] : [255, 180, 50, 180],
      getLineColor: isLight ? [100, 70, 10, 255] : [255, 220, 120, 255],
      getRadius: 30000,
      stroked: true,
      lineWidthMinPixels: 1,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: false,
    });
  }

  // Data setters - all use render() for debouncing
  public setEarthquakes(earthquakes: Earthquake[]): void {
    this.earthquakes = earthquakes;
    this.render();
  }

  public setWeatherAlerts(alerts: WeatherAlert[]): void {
    this.weatherAlerts = alerts;
    const withCentroid = alerts.filter(a => a.centroid && a.centroid.length === 2).length;
    console.log(`[DeckGLMap] Weather alerts: ${alerts.length} total, ${withCentroid} with coordinates`);
    this.render();
  }

  public setOutages(outages: InternetOutage[]): void {
    this.outages = outages;
    this.render();
  }

  public setCyberThreats(threats: CyberThreat[]): void {
    this.cyberThreats = threats;
    this.render();
  }

  public setBgpAnomalies(anomalies: BgpAnomaly[]): void {
    this.bgpAnomalies = anomalies;
    this.render();
  }

  public setAisData(disruptions: AisDisruptionEvent[], density: AisDensityZone[]): void {
    this.aisDisruptions = disruptions;
    this.aisDensity = density;
    this.render();
  }

  public setCableActivity(advisories: CableAdvisory[], repairShips: RepairShip[]): void {
    this.cableAdvisories = advisories;
    this.repairShips = repairShips;
    this.render();
  }

  public setCableHealth(healthMap: Record<string, CableHealthRecord>): void {
    this.healthByCableId = healthMap;
    this.layerCache.delete('cables-layer');
    this.render();
  }

  public setProtests(events: SocialUnrestEvent[]): void {
    this.protests = events;
    this.rebuildProtestSupercluster();
    this.render();
    this.syncPulseAnimation();
  }

  public setFlightDelays(delays: AirportDelayAlert[]): void {
    this.flightDelays = delays;
    this.render();
  }

  public setMilitaryFlights(flights: MilitaryFlight[], clusters: MilitaryFlightCluster[] = []): void {
    this.militaryFlights = flights;
    this.militaryFlightClusters = clusters;
    this.rebuildMilitaryFlightSupercluster(flights);
    this.render();
  }

  public setMilitaryVessels(vessels: MilitaryVessel[], clusters: MilitaryVesselCluster[] = []): void {
    this.militaryVessels = vessels;
    this.militaryVesselClusters = clusters;
    this.rebuildMilitaryVesselSupercluster(vessels);
    this.render();
  }

  public setNaturalEvents(events: NaturalEvent[]): void {
    this.naturalEvents = events;
    this.render();
  }

  public setFires(fires: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }>): void {
    this.firmsFireData = fires;
    this.render();
  }

  public setRadiation(stations: RadiationStation[]): void {
    this.radiationData = stations;
    this.render();
  }

  public setTechEvents(events: TechEventMarker[]): void {
    this.techEvents = events;
    this.rebuildTechEventSupercluster();
    this.render();
  }

  public setUcdpEvents(events: UcdpGeoEvent[]): void {
    this.ucdpEvents = events;
    this.render();
  }

  public setDisplacementFlows(flows: DisplacementFlow[]): void {
    this.displacementFlows = flows;
    this.render();
  }

  public setClimateAnomalies(anomalies: ClimateAnomaly[]): void {
    this.climateAnomalies = anomalies;
    this.syncPulseAnimation();
    this.render();
  }

  public showClimateAnomaly(anomaly: ClimateAnomaly): void {
    const screenPos = this.projectToScreen(anomaly.lat, anomaly.lon);
    const { x, y } = screenPos || this.getContainerCenter();
    this.popup.show({
      type: 'climate',
      data: anomaly,
      x,
      y,
    });
  }

  public setNewsLocations(data: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date; items?: import('@/types').NewsItem[] }>): void {
    const now = Date.now();
    for (const d of data) {
      if (!this.newsLocationFirstSeen.has(d.title)) {
        this.newsLocationFirstSeen.set(d.title, now);
      }
    }
    for (const [key, ts] of this.newsLocationFirstSeen) {
      if (now - ts > 60_000) this.newsLocationFirstSeen.delete(key);
    }
    this.newsLocations = data;
    this.render();

    this.syncPulseAnimation(now);
  }

  public setPositiveEvents(events: PositiveGeoEvent[]): void {
    this.positiveEvents = events;
    this.syncPulseAnimation();
    this.render();
  }

  public setKindnessData(points: KindnessPoint[]): void {
    this.kindnessPoints = points;
    this.syncPulseAnimation();
    this.render();
  }

  public setHappinessScores(data: HappinessData): void {
    this.happinessScores = data.scores;
    this.happinessYear = data.year;
    this.happinessSource = data.source;
    this.render();
  }

  public setSpeciesRecoveryZones(species: SpeciesRecovery[]): void {
    this.speciesRecoveryZones = species.filter(
      (s): s is SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } } =>
        s.recoveryZone != null
    );
    this.render();
  }

  public setRenewableInstallations(installations: RenewableInstallation[]): void {
    this.renewableInstallations = installations;
    this.render();
  }

  public updateHotspotActivity(news: NewsItem[]): void {
    this.news = news; // Store for related news lookup

    // Update hotspot "breaking" indicators based on recent news
    const breakingKeywords = new Set<string>();
    const recentNews = news.filter(n =>
      Date.now() - n.pubDate.getTime() < 2 * 60 * 60 * 1000 // Last 2 hours
    );

    // Count matches per hotspot for escalation tracking
    const matchCounts = new Map<string, number>();

    recentNews.forEach(item => {
      this.hotspots.forEach(hotspot => {
        if (hotspot.keywords.some(kw =>
          item.title.toLowerCase().includes(kw.toLowerCase())
        )) {
          breakingKeywords.add(hotspot.id);
          matchCounts.set(hotspot.id, (matchCounts.get(hotspot.id) || 0) + 1);
        }
      });
    });

    this.hotspots.forEach(h => {
      h.hasBreaking = breakingKeywords.has(h.id);
      const matchCount = matchCounts.get(h.id) || 0;
      // Calculate a simple velocity metric (matches per hour normalized)
      const velocity = matchCount > 0 ? matchCount / 2 : 0; // 2 hour window
      updateHotspotEscalation(h.id, matchCount, h.hasBreaking || false, velocity);
    });

    this.render();
    this.syncPulseAnimation();
  }

  /** Get news items related to a hotspot by keyword matching */
  private getRelatedNews(hotspot: Hotspot): NewsItem[] {
    // High-priority conflict keywords that indicate the news is really about another topic
    const conflictTopics = ['gaza', 'ukraine', 'russia', 'israel', 'iran', 'china', 'taiwan', 'korea', 'syria'];

    return this.news
      .map((item) => {
        const titleLower = item.title.toLowerCase();
        const matchedKeywords = hotspot.keywords.filter((kw) => titleLower.includes(kw.toLowerCase()));

        if (matchedKeywords.length === 0) return null;

        // Check if this news mentions other hotspot conflict topics
        const conflictMatches = conflictTopics.filter(t =>
          titleLower.includes(t) && !hotspot.keywords.some(k => k.toLowerCase().includes(t))
        );

        // If article mentions a major conflict topic that isn't this hotspot, deprioritize heavily
        if (conflictMatches.length > 0) {
          // Only include if it ALSO has a strong local keyword (city name, agency)
          const strongLocalMatch = matchedKeywords.some(kw =>
            kw.toLowerCase() === hotspot.name.toLowerCase() ||
            hotspot.agencies?.some(a => titleLower.includes(a.toLowerCase()))
          );
          if (!strongLocalMatch) return null;
        }

        // Score: more keyword matches = more relevant
        const score = matchedKeywords.length;
        return { item, score };
      })
      .filter((x): x is { item: NewsItem; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.item);
  }

  public updateMilitaryForEscalation(flights: MilitaryFlight[], vessels: MilitaryVessel[]): void {
    setMilitaryData(flights, vessels);
  }

  public getHotspotDynamicScore(hotspotId: string) {
    return getHotspotEscalation(hotspotId);
  }

  /** Get military flight clusters for rendering/analysis */
  public getMilitaryFlightClusters(): MilitaryFlightCluster[] {
    return this.militaryFlightClusters;
  }

  /** Get military vessel clusters for rendering/analysis */
  public getMilitaryVesselClusters(): MilitaryVesselCluster[] {
    return this.militaryVesselClusters;
  }

  public highlightAssets(assets: RelatedAsset[] | null): void {
    // Clear previous highlights
    Object.values(this.highlightedAssets).forEach(set => set.clear());

    if (assets) {
      assets.forEach(asset => {
        this.highlightedAssets[asset.type].add(asset.id);
      });
    }

    this.render(); // Debounced
  }

  public setOnHotspotClick(callback: (hotspot: Hotspot) => void): void {
    this.onHotspotClick = callback;
  }

  public setOnTimeRangeChange(callback: (range: TimeRange) => void): void {
    this.onTimeRangeChange = callback;
  }

  public setOnLayerChange(callback: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void): void {
    this.onLayerChange = callback;
  }

  public setOnStateChange(callback: (state: DeckMapState) => void): void {
    this.onStateChange = callback;
  }

  public getHotspotLevels(): Record<string, string> {
    const levels: Record<string, string> = {};
    this.hotspots.forEach(h => {
      levels[h.name] = h.level || 'low';
    });
    return levels;
  }

  public setHotspotLevels(levels: Record<string, string>): void {
    this.hotspots.forEach(h => {
      if (levels[h.name]) {
        h.level = levels[h.name] as 'low' | 'elevated' | 'high';
      }
    });
    this.render(); // Debounced
  }

  public initEscalationGetters(): void {
    setCIIGetter(getCountryScore);
    setGeoAlertGetter(getAlertsNearLocation);
  }

  // UI visibility methods
  public hideLayerToggle(layer: keyof MapLayers): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) (toggle as HTMLElement).style.display = 'none';
  }

  public setLayerLoading(layer: keyof MapLayers, loading: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) toggle.classList.toggle('loading', loading);
  }

  public setLayerReady(layer: keyof MapLayers, hasData: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (!toggle) return;

    toggle.classList.remove('loading');
    // Match old Map.ts behavior: set 'active' only when layer enabled AND has data
    if (this.state.layers[layer] && hasData) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  public flashAssets(assetType: AssetType, ids: string[]): void {
    // Temporarily highlight assets
    ids.forEach(id => this.highlightedAssets[assetType].add(id));
    this.render();

    setTimeout(() => {
      ids.forEach(id => this.highlightedAssets[assetType].delete(id));
      this.render();
    }, 3000);
  }

  // Enable layer programmatically
  public enableLayer(layer: keyof MapLayers): void {
    if (!this.state.layers[layer]) {
      this.state.layers[layer] = true;
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = true;
      this.updateCategoryCounts();
      this.render();
      this.onLayerChange?.(layer, true, 'programmatic');
    }
  }

  // Toggle layer on/off programmatically
  public toggleLayer(layer: keyof MapLayers): void {
    console.log(`[DeckGLMap.toggleLayer] ${layer}: ${this.state.layers[layer]} -> ${!this.state.layers[layer]}`);
    this.state.layers[layer] = !this.state.layers[layer];
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
    if (toggle) toggle.checked = this.state.layers[layer];
    this.updateCategoryCounts();
    this.render();

    if (layer === 'alertStatus' && this.state.layers[layer]) {
      import('@/services/alert-status').then(({ AlertStatusService }) => {
        AlertStatusService.getInstance().fetchStatuses().then(() => this.debouncedRebuildLayers());
      });
    }

    if (layer === 'weatherRadar') {
      if (this.state.layers[layer]) {
        this.setLayerLoading('weatherRadar', true);
        setTimeout(() => {
          this.setLayerLoading('weatherRadar', false);
          this.setLayerReady('weatherRadar', true);
        }, 400);
      } else {
        this.setLayerLoading('weatherRadar', false);
        this.setLayerReady('weatherRadar', false);
      }
    }

    this.onLayerChange?.(layer, this.state.layers[layer], 'programmatic');
  }

  // Get center coordinates for programmatic popup positioning
  private getContainerCenter(): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  // Project lat/lon to screen coordinates without moving the map
  private projectToScreen(lat: number, lon: number): { x: number; y: number } | null {
    if (!this.maplibreMap) return null;
    const point = this.maplibreMap.project([lon, lat]);
    return { x: point.x, y: point.y };
  }

  // Trigger click methods - show popup at item location without moving the map
  public triggerHotspotClick(id: string): void {
    const hotspot = this.hotspots.find(h => h.id === id);
    if (!hotspot) return;

    // Get screen position for popup
    const screenPos = this.projectToScreen(hotspot.lat, hotspot.lon);
    const { x, y } = screenPos || this.getContainerCenter();

    // Get related news and show popup
    const relatedNews = this.getRelatedNews(hotspot);
    this.popup.show({
      type: 'hotspot',
      data: hotspot,
      relatedNews,
      x,
      y,
    });
    this.popup.loadHotspotGdeltContext(hotspot);
    this.onHotspotClick?.(hotspot);
  }

  public triggerConflictClick(id: string): void {
    const conflict = CONFLICT_ZONES.find(c => c.id === id);
    if (conflict) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(conflict.center[1], conflict.center[0]);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'conflict', data: conflict, x, y });
    }
  }

  public triggerBaseClick(id: string): void {
    const base = MILITARY_BASES.find(b => b.id === id);
    if (base) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(base.lat, base.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'base', data: base, x, y });
    }
  }

  public triggerPipelineClick(id: string): void {
    const pipeline = PIPELINES.find(p => p.id === id);
    if (pipeline && pipeline.points.length > 0) {
      const midIdx = Math.floor(pipeline.points.length / 2);
      const midPoint = pipeline.points[midIdx];
      // Don't pan - show popup at projected screen position or center
      const screenPos = midPoint ? this.projectToScreen(midPoint[1], midPoint[0]) : null;
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'pipeline', data: pipeline, x, y });
    }
  }

  public triggerCableClick(id: string): void {
    const cable = UNDERSEA_CABLES.find(c => c.id === id);
    if (cable && cable.points.length > 0) {
      const midIdx = Math.floor(cable.points.length / 2);
      const midPoint = cable.points[midIdx];
      // Don't pan - show popup at projected screen position or center
      const screenPos = midPoint ? this.projectToScreen(midPoint[1], midPoint[0]) : null;
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'cable', data: cable, x, y });
    }
  }

  public triggerDatacenterClick(id: string): void {
    const dc = AI_DATA_CENTERS.find(d => d.id === id);
    if (dc) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(dc.lat, dc.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'datacenter', data: dc, x, y });
    }
  }

  public triggerNuclearClick(id: string): void {
    const facility = NUCLEAR_FACILITIES.find(n => n.id === id);
    if (facility) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(facility.lat, facility.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'nuclear', data: facility, x, y });
    }
  }

  public triggerIrradiatorClick(id: string): void {
    const irradiator = GAMMA_IRRADIATORS.find(i => i.id === id);
    if (irradiator) {
      // Don't pan - show popup at projected screen position or center
      const screenPos = this.projectToScreen(irradiator.lat, irradiator.lon);
      const { x, y } = screenPos || this.getContainerCenter();
      this.popup.show({ type: 'irradiator', data: irradiator, x, y });
    }
  }

  public flashLocation(lat: number, lon: number, durationMs = 2000): void {
    // Don't pan - project coordinates to screen position
    const screenPos = this.projectToScreen(lat, lon);
    if (!screenPos) return;

    // Flash effect by temporarily adding a highlight at the location
    const flashMarker = document.createElement('div');
    flashMarker.className = 'flash-location-marker';
    flashMarker.style.cssText = `
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid #fff;
      animation: flash-pulse 0.5s ease-out infinite;
      pointer-events: none;
      z-index: 1000;
      left: ${screenPos.x}px;
      top: ${screenPos.y}px;
      transform: translate(-50%, -50%);
    `;

    // Add animation keyframes if not present
    if (!document.getElementById('flash-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'flash-animation-styles';
      style.textContent = `
        @keyframes flash-pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const wrapper = this.container.querySelector('.deckgl-map-wrapper');
    if (wrapper) {
      wrapper.appendChild(flashMarker);
      setTimeout(() => flashMarker.remove(), durationMs);
    }
  }

  // --- Country click + highlight ---

  public setOnCountryClick(cb: (country: CountryClickPayload) => void): void {
    this.onCountryClick = cb;
  }

  private resolveCountryFromCoordinate(lon: number, lat: number): { code: string; name: string } | null {
    const fromGeometry = getCountryAtCoordinates(lat, lon);
    if (fromGeometry) return fromGeometry;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return null;
    try {
      const point = this.maplibreMap.project([lon, lat]);
      const features = this.maplibreMap.queryRenderedFeatures(point, { layers: ['country-interactive'] });
      const properties = (features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const code = typeof properties['ISO3166-1-Alpha-2'] === 'string'
        ? properties['ISO3166-1-Alpha-2'].trim().toUpperCase()
        : '';
      const name = typeof properties.name === 'string'
        ? properties.name.trim()
        : '';
      if (!code || !name) return null;
      return { code, name };
    } catch {
      return null;
    }
  }

  private loadCountryBoundaries(): void {
    if (!this.maplibreMap || this.countryGeoJsonLoaded) return;
    this.countryGeoJsonLoaded = true;

    getCountriesGeoJson()
      .then((geojson) => {
        if (!this.maplibreMap || !geojson) return;
        this.countriesGeoJsonData = geojson;
        // Schedule layer rebuild so Conflict Zones can switch from boxes to precise country polygons
        this.debouncedRebuildLayers();

        // Also fetch US and Canada regions for alert status
        const alertStatusService = AlertStatusService.getInstance();
        Promise.all([
          fetch(MAP_URLS.us).then(r => r.json()),
          fetch(MAP_URLS.canada).then(r => r.json()),
          alertStatusService.fetchStatuses()
        ]).then(([usData, canadaData]) => {
          if (usData) {
            const states = topojson.feature(usData as any, usData.objects.states);
            this.usStateFeatures = 'features' in states ? (states.features as any[]) : [states as any];
          }
          if (canadaData && canadaData.features) {
            this.canadaProvinceFeatures = canadaData.features;
          }
          this.debouncedRebuildLayers();
        }).catch(e => console.error('Failed to load region data:', e));

        this.maplibreMap.addSource('country-boundaries', {
          type: 'geojson',
          data: geojson,
        });
        this.maplibreMap.addLayer({
          id: 'country-interactive',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0,
          },
        });
        this.maplibreMap.addLayer({
          id: 'country-hover-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.06,
          },
          filter: ['==', ['get', 'name'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.12,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-border',
          type: 'line',
          source: 'country-boundaries',
          paint: {
            'line-color': '#3b82f6',
            'line-width': 1.5,
            'line-opacity': 0.5,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });

        if (!this.countryHoverSetup) this.setupCountryHover();
        this.updateCountryLayerPaint(getCurrentTheme());
        if (this.highlightedCountryCode) this.highlightCountry(this.highlightedCountryCode);
        console.log('[DeckGLMap] Country boundaries loaded');
      })
      .catch((err) => console.warn('[DeckGLMap] Failed to load country boundaries:', err));
  }

  private setupCountryHover(): void {
    if (!this.maplibreMap || this.countryHoverSetup) return;
    this.countryHoverSetup = true;
    const map = this.maplibreMap;
    let hoveredName: string | null = null;

    map.on('mousemove', (e) => {
      if (!this.onCountryClick) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['country-interactive'] });
      const name = features?.[0]?.properties?.name as string | undefined;

      try {
        if (name && name !== hoveredName) {
          hoveredName = name;
          if (map.getLayer('country-hover-fill')) {
            map.setFilter('country-hover-fill', ['==', ['get', 'name'], name]);
          }
          map.getCanvas().style.cursor = 'pointer';
        } else if (!name && hoveredName) {
          hoveredName = null;
          if (map.getLayer('country-hover-fill')) {
            map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
          }
          map.getCanvas().style.cursor = '';
        }
      } catch { /* style not done loading during theme switch */ }
    });

    map.on('mouseout', () => {
      if (hoveredName) {
        hoveredName = null;
        try {
          if (map.getLayer('country-hover-fill')) {
            map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
          }
        } catch { /* style not done loading */ }
        map.getCanvas().style.cursor = '';
      }
    });
  }

  public highlightCountry(code: string): void {
    this.highlightedCountryCode = code;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const filter = ['==', ['get', 'ISO3166-1-Alpha-2'], code] as maplibregl.FilterSpecification;
    try {
      if (this.maplibreMap.getLayer('country-highlight-fill')) {
        this.maplibreMap.setFilter('country-highlight-fill', filter);
      }
      if (this.maplibreMap.getLayer('country-highlight-border')) {
        this.maplibreMap.setFilter('country-highlight-border', filter);
      }
    } catch { /* layer not ready yet */ }
  }

  public clearCountryHighlight(): void {
    this.highlightedCountryCode = null;
    if (!this.maplibreMap) return;
    const noMatch = ['==', ['get', 'ISO3166-1-Alpha-2'], ''] as maplibregl.FilterSpecification;
    try {
      if (this.maplibreMap.getLayer('country-highlight-fill')) {
        this.maplibreMap.setFilter('country-highlight-fill', noMatch);
      }
      if (this.maplibreMap.getLayer('country-highlight-border')) {
        this.maplibreMap.setFilter('country-highlight-border', noMatch);
      }
    } catch { /* layer not ready */ }
  }

  private switchBasemap(_theme: 'dark' | 'light'): void {
    if (!this.maplibreMap) return;
    // Map stays on the light style (Voyager)
    this.updateCountryLayerPaint('light');
  }

  private updateCountryLayerPaint(_theme?: 'dark' | 'light'): void {
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const hoverOpacity = 0.10;
    const highlightOpacity = 0.18;
    try {
      if (this.maplibreMap.getLayer('country-hover-fill')) {
        this.maplibreMap.setPaintProperty('country-hover-fill', 'fill-opacity', hoverOpacity);
      }
      if (this.maplibreMap.getLayer('country-highlight-fill')) {
        this.maplibreMap.setPaintProperty('country-highlight-fill', 'fill-opacity', highlightOpacity);
      }
    } catch { /* layers may not be ready */ }
  }

  public destroy(): void {
    if (this.moveTimeoutId) {
      clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = null;
    }

    this.stopPulseAnimation();
    this.stopDayNightTimer();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.layerCache.clear();

    this.deckOverlay?.finalize();
    this.deckOverlay = null;
    this.maplibreMap?.remove();
    this.maplibreMap = null;

    this.closeLegend();
    this.legendElement = null;
    this.waterTempLegend = null;
    this.container.innerHTML = '';
  }
}
