/**
 * Solar position and night polygon calculator for day/night terminator overlays.
 * Used by both DeckGLMap (desktop WebGL) and MapComponent (mobile SVG).
 */

export function computeNightPolygons(now: number = Date.now()): [number, number][][] {
  // Solar position calculation based on UTC timestamp
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
  const step = 1; // 1° longitude steps for smooth curve
  const terminator: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += step) {
    const H = (lon - subSolarLon) * (Math.PI / 180);
    // Correct formula: lat = atan(-cos(H) / tan(dec))
    const lat = Math.atan(-Math.cos(H) / tanDec) * (180 / Math.PI);
    terminator.push([lon, lat]);
  }

  // Build two polygons split at lon=0 (each ≤180° wide for Deck.gl earcut and D3 geo projection).
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

  return [westPoly, eastPoly];
}
