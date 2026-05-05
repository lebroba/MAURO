import type {
  GeographyMutationEvent,
  SubstrateState,
  TileMetadata,
  WorldEvent,
} from '../types'
import type { Xoshiro256 } from '../rng/xoshiro256'

// applyEvent — pure reducer that folds a single WorldEvent into substrate state.
//
// Mutates state.heightmap in place and returns the same state object.
// state.mask is NEVER mutated (Architecture Principle #6: mask is source-of-truth
// for is-land; reducers only adjust elevation/relief).
//
// In v0 the only mutating event is GeographyMutation/volcanic_uplift, and it
// uses no randomness — the rng parameter is threaded for forward compatibility
// with future RNG-driven event variants (Poisson placement, biome variation,
// erosion noise, etc).
//
// Determinism contract: same (state, tileMeta, event, rng) inputs MUST produce
// byte-identical heightmap output. The 16-bit clamp at the boundary is part of
// the contract — without it, integer overflow would diverge across runs.

const UINT16_MAX = 0xffff

/**
 * SPHERE-SUBSTRATE AUDIT (2026-05-01):
 * - GeographyMutation polygons are defined in tile-local pixel space
 *   (DemoPolygon.pixels in types.ts). At MVP single-tile scale this is
 *   correct — polygons cannot span tile boundaries because there is
 *   only one tile.
 * - v1 multi-tile composition will need polygons in (lon, lat) coords,
 *   converted to per-tile pixel space at apply-time via
 *   packages/sim/src/sphere/coords.ts:lonLatToTilePixel.
 * - pointInPolygon uses standard even-odd ray casting in pixel space.
 *   No false-flat math (it's a pure 2D polygon test, not a geographic op).
 */
export function applyEvent(
  state: SubstrateState,
  tileMeta: TileMetadata,
  event: WorldEvent,
  rng: Xoshiro256,
): SubstrateState {
  switch (event.kind) {
    case 'WorldCreated':
      // No-op: world creation establishes the tile + magic level + master seed,
      // but the substrate at T0 IS the source heightmap. The reducer treats
      // T0 state as already-correct and returns it unchanged.
      return state

    case 'GeographyMutation':
      return applyGeographyMutation(state, tileMeta, event, rng)

    case 'NationCreated':
      // No-op on substrate. NationCreated grows the nation list (read-projected
      // outside this reducer) but does NOT mutate heightmap/mask. The substrate
      // hash invariant must hold across this event so existing render-cache
      // keys remain valid.
      return state

    default: {
      // Exhaustive check — adding a new event kind without a case here
      // produces a compile error here, not a runtime surprise.
      const _exhaustive: never = event
      throw new Error(
        `applyEvent: unknown event kind: ${String((_exhaustive as WorldEvent).kind)}`,
      )
    }
  }
}

function applyGeographyMutation(
  state: SubstrateState,
  tileMeta: TileMetadata,
  event: GeographyMutationEvent,
  _rng: Xoshiro256,
): SubstrateState {
  const { variant } = event.payload
  switch (variant) {
    case 'volcanic_uplift':
      return applyVolcanicUplift(
        state,
        tileMeta,
        event.payload.polygonId,
        event.payload.elevationDelta,
      )
    default: {
      const _exhaustive: never = variant
      throw new Error(
        `applyGeographyMutation: unknown variant: ${String(_exhaustive)}`,
      )
    }
  }
}

/**
 * Increment heightmap pixels inside `polygonId` by `elevationDelta`,
 * clamped to [0, UINT16_MAX]. Mask is unchanged.
 *
 * Pixel centers (x+0.5, y+0.5) are used for the inside-test to avoid edge-case
 * ambiguity at integer-aligned vertices.
 */
function applyVolcanicUplift(
  state: SubstrateState,
  tileMeta: TileMetadata,
  polygonId: string,
  elevationDelta: number,
): SubstrateState {
  if (polygonId !== tileMeta.demoPolygon.polygonId) {
    throw new Error(
      `applyVolcanicUplift: polygonId "${polygonId}" not found on tile ${tileMeta.slug}`,
    )
  }

  const polygon = tileMeta.demoPolygon.pixels
  if (polygon.length < 3) {
    throw new Error(
      `applyVolcanicUplift: polygon must have ≥3 vertices (got ${polygon.length})`,
    )
  }

  const { heightmap, width, height } = state

  // Bounding box scan — only test pixels in the polygon's bbox. For a small
  // polygon on a 2048×2048 tile this avoids ~4M pointless ray-casts.
  let minX = width
  let maxX = 0
  let minY = height
  let maxY = 0
  for (const [x, y] of polygon) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const startX = Math.max(0, Math.floor(minX))
  const endX = Math.min(width - 1, Math.ceil(maxX))
  const startY = Math.max(0, Math.floor(minY))
  const endY = Math.min(height - 1, Math.ceil(maxY))

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) continue
      const i = y * width + x
      const newValue = heightmap[i]! + elevationDelta
      // 16-bit clamping. The unbounded delta + Uint16Array boundary is a
      // determinism-contract concern: without explicit clamping, the typed
      // array's wrap behavior would silently diverge from the spec.
      if (newValue < 0) {
        heightmap[i] = 0
      } else if (newValue > UINT16_MAX) {
        heightmap[i] = UINT16_MAX
      } else {
        heightmap[i] = newValue
      }
    }
  }

  return state
}

/**
 * Standard ray-casting point-in-polygon test (even-odd rule).
 * Polygon is closed implicitly — last vertex connects back to first.
 *
 * Used internally by applyVolcanicUplift; exported for tests.
 */
export function pointInPolygon(
  px: number,
  py: number,
  polygon: ReadonlyArray<readonly [number, number]>,
): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i]!
    const [xj, yj] = polygon[j]!
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
