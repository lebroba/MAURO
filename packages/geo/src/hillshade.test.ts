import { describe, expect, it } from 'vitest'
import { computeHillshade, type HillshadeParams } from './hillshade'

const DEFAULT_PARAMS: HillshadeParams = {
  azimuthDeg: 315,
  altitudeDeg: 45,
  zFactor: 1.0,
  cellSizeMeters: 30,
}

const W = 32
const H = 32

function flatHeightmap(elevation: number): Uint16Array {
  const out = new Uint16Array(W * H)
  out.fill(elevation)
  return out
}

function allLandMask(): Uint8Array {
  const out = new Uint8Array(W * H)
  out.fill(1)
  return out
}

function allOceanMask(): Uint8Array {
  return new Uint8Array(W * H) // zeros
}

// ============================================================================
// Test plan #16 — flat plane → uniform shade output
// ============================================================================

describe('computeHillshade — flat plane (test plan #16)', () => {
  it('produces uniform shade across all land pixels', () => {
    const out = computeHillshade(
      flatHeightmap(1000),
      allLandMask(),
      W,
      H,
      DEFAULT_PARAMS,
    )

    // Shade values for land pixels should all be identical (or within ±1
    // for floating-point edge effects at borders).
    const shades = new Set<number>()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const oi = (y * W + x) * 4
        shades.add(out[oi]!)
      }
    }
    // ≤2 distinct values allowed (interior + possibly 1 border edge case).
    expect(shades.size).toBeLessThanOrEqual(2)
  })
})

// ============================================================================
// Test plan #17 — sun overhead (altitude=90) → no directional shadowing
// ============================================================================

describe('computeHillshade — sun overhead (test plan #17)', () => {
  it('with altitudeDeg=90, all pixels equally lit (max brightness)', () => {
    const params: HillshadeParams = { ...DEFAULT_PARAMS, altitudeDeg: 90 }
    const out = computeHillshade(flatHeightmap(0), allLandMask(), W, H, params)

    // Sun straight up + flat surface = full brightness (255 or near-255).
    for (let i = 0; i < W * H; i++) {
      const oi = i * 4
      expect(out[oi]!).toBeGreaterThanOrEqual(254)
    }
  })
})

// ============================================================================
// Test plan #18 — east-facing slope with sun in west (azimuth 270)
// ============================================================================

describe('computeHillshade — directional gradient (test plan #18)', () => {
  it('with a centered peak, west-facing and east-facing slopes shade asymmetrically per sun direction', () => {
    // Pyramid heightmap with peak at x=W/2.
    //   Western half (x < W/2): slopes face west (normal points up + west)
    //   Eastern half (x > W/2): slopes face east (normal points up + east)
    const heightmap = new Uint16Array(W * H)
    const peakX = W / 2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const distFromPeak = Math.abs(x - peakX)
        heightmap[y * W + x] = Math.max(0, 3000 - distFromPeak * 100)
      }
    }
    const mask = allLandMask()
    const yMid = Math.floor(H / 2)

    // Sun in the WEST (azimuth 270°) should illuminate the WEST-facing slopes.
    const sunWest = computeHillshade(heightmap, mask, W, H, {
      ...DEFAULT_PARAMS,
      azimuthDeg: 270,
    })
    const westFaceWithSunWest = sunWest[(yMid * W + 4) * 4]!
    const eastFaceWithSunWest = sunWest[(yMid * W + (W - 5)) * 4]!
    expect(westFaceWithSunWest).toBeGreaterThan(eastFaceWithSunWest)

    // Sun in the EAST (azimuth 90°) should illuminate the EAST-facing slopes.
    const sunEast = computeHillshade(heightmap, mask, W, H, {
      ...DEFAULT_PARAMS,
      azimuthDeg: 90,
    })
    const westFaceWithSunEast = sunEast[(yMid * W + 4) * 4]!
    const eastFaceWithSunEast = sunEast[(yMid * W + (W - 5)) * 4]!
    expect(eastFaceWithSunEast).toBeGreaterThan(westFaceWithSunEast)
  })
})

// ============================================================================
// Test plan #19 — ocean pixels render as the fixed verdigris color
// ============================================================================

describe('computeHillshade — ocean rendering (test plan #19)', () => {
  it('mask=0 pixels get the verdigris ocean color (#3B6B5A) regardless of heightmap', () => {
    const out = computeHillshade(
      flatHeightmap(50_000), // arbitrary high value — should be ignored
      allOceanMask(),
      W,
      H,
      DEFAULT_PARAMS,
    )

    for (let i = 0; i < W * H; i++) {
      const oi = i * 4
      expect(out[oi]).toBe(0x3b)
      expect(out[oi + 1]).toBe(0x6b)
      expect(out[oi + 2]).toBe(0x5a)
      expect(out[oi + 3]).toBe(255)
    }
  })

  it('mixed mask: land pixels are shaded, ocean pixels are verdigris', () => {
    const heightmap = flatHeightmap(1000)
    const mask = new Uint8Array(W * H)
    // Half land (left half), half ocean (right half).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        mask[y * W + x] = x < W / 2 ? 1 : 0
      }
    }

    const out = computeHillshade(heightmap, mask, W, H, DEFAULT_PARAMS)

    // Sample a land pixel — should be grey, not verdigris.
    const landSample = out[(5 * W + 5) * 4]!
    expect(landSample).not.toBe(0x3b)
    // Sample an ocean pixel.
    const oceanSample = out[(5 * W + W - 5) * 4]!
    expect(oceanSample).toBe(0x3b)
  })
})

// ============================================================================
// Test plan #20 — output buffer length
// ============================================================================

describe('computeHillshade — output buffer (test plan #20)', () => {
  it('returns RGBA buffer with length width * height * 4', () => {
    const out = computeHillshade(
      flatHeightmap(0),
      allLandMask(),
      W,
      H,
      DEFAULT_PARAMS,
    )
    expect(out.length).toBe(W * H * 4)
  })

  it('alpha channel is 255 for every pixel (no transparency)', () => {
    const out = computeHillshade(
      flatHeightmap(0),
      allLandMask(),
      W,
      H,
      DEFAULT_PARAMS,
    )
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4 + 3]).toBe(255)
    }
  })
})

// ============================================================================
// Test plan #21 — edge replication (no black border)
// ============================================================================

describe('computeHillshade — edge replication (test plan #21)', () => {
  it('border pixels do not produce a black edge artifact', () => {
    const heightmap = flatHeightmap(2000)
    const mask = allLandMask()
    const out = computeHillshade(heightmap, mask, W, H, DEFAULT_PARAMS)

    const corners = [
      [0, 0],
      [W - 1, 0],
      [0, H - 1],
      [W - 1, H - 1],
    ] as const

    for (const [x, y] of corners) {
      const oi = (y * W + x) * 4
      const cornerShade = out[oi]!
      // Replicate-padding means corner-pixel slope = 0 = same shade as flat
      // interior. Should NOT be black (which would indicate a bug where the
      // convolution read past the buffer and got zeros).
      expect(cornerShade).toBeGreaterThan(0)
    }
  })

  it('corner shade is within ±2 of interior shade for a flat heightmap', () => {
    const heightmap = flatHeightmap(2000)
    const mask = allLandMask()
    const out = computeHillshade(heightmap, mask, W, H, DEFAULT_PARAMS)

    const interior = out[(10 * W + 10) * 4]!
    const corner = out[(0 * W + 0) * 4]!
    expect(Math.abs(corner - interior)).toBeLessThanOrEqual(2)
  })
})

// ============================================================================
// Determinism — same inputs produce byte-identical output
// ============================================================================

describe('computeHillshade — determinism', () => {
  it('two invocations with identical inputs produce byte-identical output', () => {
    const heightmap = flatHeightmap(1000)
    const mask = allLandMask()
    const a = computeHillshade(heightmap, mask, W, H, DEFAULT_PARAMS)
    const b = computeHillshade(heightmap, mask, W, H, DEFAULT_PARAMS)
    expect(a).toEqual(b)
  })
})
