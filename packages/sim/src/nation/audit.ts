import type { SubstrateState, GeoJSONPolygon } from '../types'
import type { AuditOutput, ElevationDistribution, SliderSuggestion } from './types'

/**
 * Elevation thresholds (meters above sea level after Uint16 → meters mapping).
 * Cells with mask=0 AND elevation < deepWaterMaxM are deep water; mask=0 AND
 * elevation in [deepWaterMaxM, 0) are shallow water (coastal shelf).
 */
export const ELEVATION_THRESHOLDS = {
  deepWaterMaxM: -200,
  lowlandMaxM: 500,
  midlandMaxM: 1500,
}

const STRIDE = 16
const DOMINANT_FRACTION = 0.4
const SIGNIFICANT_WATER_FRACTION = 0.2

/**
 * Tile-pixel point-in-polygon using even-odd rule. Polygon vertices are in
 * tile-local pixel coordinates (NOT lon/lat). For thin slice the freehand
 * draw produces vertices that are already converted from screen to tile-pixel.
 */
function pointInPolygon(
  x: number,
  y: number,
  ring: Array<[number, number]>,
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Compute audit summary for a polygon over the substrate. Stride-samples cells
 * inside the polygon's bounding box at every 16th cell (deterministic — no RNG)
 * for ~256× speedup vs naive iteration. The audit is a "rough" signal anyway;
 * the elevation distribution is statistically stable at this sampling rate.
 *
 * Polygon coordinates are in tile-local pixel space (the freehand-draw layer
 * converts screen coordinates to tile-pixels before constructing the polygon).
 *
 * Returns suggestions per Appendix A.1 of the design doc.
 */
export function auditPolygon(
  state: SubstrateState,
  polygon: GeoJSONPolygon,
  tilePixelWidth: number,
  tilePixelHeight: number,
): AuditOutput {
  const ring = polygon.coordinates[0]!

  // Bounding box of polygon in tile-pixel space.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [px, py] of ring) {
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  minX = Math.max(0, Math.floor(minX))
  minY = Math.max(0, Math.floor(minY))
  maxX = Math.min(tilePixelWidth, Math.ceil(maxX))
  maxY = Math.min(tilePixelHeight, Math.ceil(maxY))

  let totalSampled = 0
  let landSampled = 0
  let deepWater = 0
  let shallowWater = 0
  let lowland = 0
  let midland = 0
  let highland = 0

  // Sample at stride midpoints so the grid is centred within each stride cell
  // rather than anchored at the bounding-box corner. This matters for small
  // polygons and evenly-tiled stripe tests — without it a 33/33/33 stripe at
  // STRIDE=16 can alias to 50% in one band and incorrectly trigger a dominant
  // branch.
  const startX = minX + Math.floor(STRIDE / 2)
  const startY = minY + Math.floor(STRIDE / 2)

  for (let y = startY; y < maxY; y += STRIDE) {
    for (let x = startX; x < maxX; x += STRIDE) {
      if (!pointInPolygon(x + 0.5, y + 0.5, ring)) continue
      totalSampled++

      const idx = y * state.width + x
      const u16 = state.heightmap[idx]!
      const meters = u16ToMeters(u16)
      const isLand = state.mask[idx] === 1

      if (!isLand) {
        if (meters < ELEVATION_THRESHOLDS.deepWaterMaxM) deepWater++
        else shallowWater++
      } else {
        landSampled++
        if (meters < ELEVATION_THRESHOLDS.lowlandMaxM) lowland++
        else if (meters < ELEVATION_THRESHOLDS.midlandMaxM) midland++
        else highland++
      }
    }
  }

  const safeTotal = Math.max(1, totalSampled)
  const safeLand = Math.max(1, landSampled)

  const elevationDistribution: ElevationDistribution = {
    deepWater: deepWater / safeTotal,
    shallowWater: shallowWater / safeTotal,
    lowland: lowland / safeTotal,
    midland: midland / safeTotal,
    highland: highland / safeTotal,
  }

  const waterFraction = elevationDistribution.deepWater + elevationDistribution.shallowWater
  const suggestions = computeSuggestions(elevationDistribution, waterFraction, landSampled, safeLand)

  // Approximate area: count of land cells × cell area.
  // Thin slice: cell-area is approximated as 1km² per cell (good enough for
  // suggestion logic; precise area lands when sphere-cell-area is wired in).
  const areaKm2 = landSampled * 1.0

  return { areaKm2, elevationDistribution, suggestions }
}

function u16ToMeters(u16: number): number {
  // Existing prep-tiles convention: linear mapping. Range varies per tile;
  // for thin slice, treat Uint16 as direct meter value (good enough for the
  // 5 thresholds we actually use). Tile-specific calibration is deferred.
  return u16
}

function computeSuggestions(
  dist: ElevationDistribution,
  waterFraction: number,
  landSampled: number,
  safeLand: number,
): SliderSuggestion[] {
  if (landSampled === 0) {
    // Water-only polygon — caller checks waterFraction >= 0.95 and blocks
    // submission. Empty suggestions.
    return []
  }

  // Land-relative ratios (for "dominant band" logic, the "land" reference
  // population is what matters, not the all-cells population — this avoids
  // calling a coastal polygon "lowland-dominant" only because half is ocean).
  const lowlandLand = (dist.lowland * landSampled) / safeLand
  const midlandLand = (dist.midland * landSampled) / safeLand
  const highlandLand = (dist.highland * landSampled) / safeLand

  // Pattern matching per Appendix A.1.
  if (lowlandLand >= DOMINANT_FRACTION && waterFraction >= SIGNIFICANT_WATER_FRACTION) {
    return [
      { slider: 'E', value: 5, prose: 'Easy water access and arable lowlands favor maritime trade.' },
      { slider: 'D', value: 6, prose: 'Easy water access and arable lowlands favor maritime trade.' },
    ]
  }
  if (lowlandLand >= DOMINANT_FRACTION) {
    return [
      { slider: 'E', value: 5, prose: 'Open lowlands favor cavalry and farming both.' },
      { slider: 'M', value: 5, prose: 'Open lowlands favor cavalry and farming both.' },
    ]
  }
  if (midlandLand >= DOMINANT_FRACTION) {
    return [
      { slider: 'E', value: 4, prose: 'Mixed terrain — defensible enough, productive enough, but no easy edge.' },
      { slider: 'M', value: 5, prose: 'Mixed terrain — defensible enough, productive enough, but no easy edge.' },
      { slider: 'D', value: 4, prose: 'Mixed terrain — defensible enough, productive enough, but no easy edge.' },
    ]
  }
  if (highlandLand >= DOMINANT_FRACTION) {
    return [
      { slider: 'M', value: 6, prose: 'Defensible terrain, hard living, strong rule needed.' },
      { slider: 'E', value: 3, prose: 'Defensible terrain, hard living, strong rule needed.' },
    ]
  }
  // Mixed — no band ≥40%
  return [
    { slider: 'E', value: 4, prose: 'Diverse terrain, no defining geographic edge.' },
    { slider: 'M', value: 5, prose: 'Diverse terrain, no defining geographic edge.' },
  ]
}
