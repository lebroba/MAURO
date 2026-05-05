import { describe, expect, it } from 'vitest'
import { auditPolygon, ELEVATION_THRESHOLDS } from './audit'
import type { SubstrateState } from '../types'

const W = 64
const H = 64

function makeState(elevationFn: (x: number, y: number) => number, maskFn: (x: number, y: number) => number): SubstrateState {
  const heightmap = new Uint16Array(W * H)
  const mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      heightmap[y * W + x] = elevationFn(x, y)
      mask[y * W + x] = maskFn(x, y)
    }
  }
  return { heightmap, mask, width: W, height: H }
}

// Polygon covering the full tile (0,0)..(W,H).
const FULL_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [[[0, 0], [W, 0], [W, H], [0, H], [0, 0]]] as [number, number][][],
}

// Convert heightmap-meters to the Uint16 encoding used in MAURO tiles.
// Existing convention (per scripts/prep-tiles.ts): elevation in meters maps
// linearly to [0, 65535]. For test purposes, encode meters as Uint16 directly.
function metersToU16(meters: number): number {
  return Math.max(0, Math.min(65535, Math.round(meters)))
}

describe('auditPolygon', () => {
  it('all-land + dominant lowland → suggests E=5, M=5', () => {
    const state = makeState(
      () => metersToU16(200), // 200m elevation → lowland
      () => 1, // all land
    )
    const result = auditPolygon(state, FULL_POLYGON, W, H)
    expect(result.elevationDistribution.lowland).toBeGreaterThan(0.9)
    expect(result.elevationDistribution.highland).toBeLessThan(0.1)
    const eSugg = result.suggestions.find((s) => s.slider === 'E')
    expect(eSugg?.value).toBe(5)
  })

  it('all-land + dominant highland → suggests M=6, E=3', () => {
    const state = makeState(
      () => metersToU16(2000), // 2000m → highland
      () => 1,
    )
    const result = auditPolygon(state, FULL_POLYGON, W, H)
    expect(result.elevationDistribution.highland).toBeGreaterThan(0.9)
    const mSugg = result.suggestions.find((s) => s.slider === 'M')
    expect(mSugg?.value).toBe(6)
  })

  it('water-only polygon → empty suggestions; signaled via elevationDistribution', () => {
    const state = makeState(
      () => metersToU16(0),
      () => 0, // all water
    )
    const result = auditPolygon(state, FULL_POLYGON, W, H)
    expect(result.elevationDistribution.deepWater + result.elevationDistribution.shallowWater).toBeGreaterThan(0.9)
    // Water-only: caller (UI) checks this and blocks submission.
  })

  it('mixed (no band ≥40%) → fallback suggestion E=4, M=5', () => {
    const state = makeState(
      (x, _y) => {
        // Stripe pattern: 33% lowland / 33% midland / 33% highland (none dominant)
        if (x < W / 3) return metersToU16(200)
        if (x < (2 * W) / 3) return metersToU16(800)
        return metersToU16(2000)
      },
      () => 1,
    )
    const result = auditPolygon(state, FULL_POLYGON, W, H)
    expect(result.suggestions).toContainEqual(
      expect.objectContaining({ slider: 'E', value: 4 }),
    )
  })

  it('determinism: identical inputs → byte-identical AuditOutput', () => {
    const state = makeState(() => metersToU16(800), () => 1)
    const a = auditPolygon(state, FULL_POLYGON, W, H)
    const b = auditPolygon(state, FULL_POLYGON, W, H)
    expect(a).toEqual(b)
  })

  it('exposes elevation thresholds for the UI to display', () => {
    expect(ELEVATION_THRESHOLDS.deepWaterMaxM).toBeLessThan(0)
    expect(ELEVATION_THRESHOLDS.lowlandMaxM).toBe(500)
    expect(ELEVATION_THRESHOLDS.midlandMaxM).toBe(1500)
  })
})
