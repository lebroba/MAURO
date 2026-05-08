import { describe, expect, it } from 'vitest'
import { applyEvent, pointInPolygon } from './applyEvent'
import { xoshiro256ss } from '../rng/xoshiro256'
import type {
  GeographyMutationEvent,
  NationCreatedEvent,
  SubstrateState,
  TileMetadata,
  WorldCreatedEvent,
  WorldGeneratedEvent,
} from '../types'

// ----------------------------------------------------------------------------
// Test fixtures — small 16x16 substrate with a 4x4 demo polygon at (4,4)-(8,8).
// Polygon vertices are at integer corners; pixel centers (x+0.5, y+0.5) inside
// the polygon are pixels (4..7, 4..7) — exactly 16 pixels.
// ----------------------------------------------------------------------------

const W = 16
const H = 16
const BASE_ELEVATION = 1000

function makeState(elevation = BASE_ELEVATION): SubstrateState {
  const heightmap = new Uint16Array(W * H)
  heightmap.fill(elevation)
  const mask = new Uint8Array(W * H)
  mask.fill(1) // all land
  return { heightmap, mask, width: W, height: H }
}

const TILE_META: TileMetadata = {
  slug: 'earth-patagonia',
  body: 'earth',
  sourceRegion: { name: 'test', lat: 0, lon: 0, widthDeg: 1, heightDeg: 1 },
  cellSizeMeters: 30,
  hillshadeParams: {
    azimuthDeg: 315,
    altitudeDeg: 45,
    zFactor: 1,
    cellSizeMeters: 30,
  },
  demoPolygon: {
    polygonId: 'demo',
    // Square covering pixels (4..7, 4..7) — 16 pixels exactly.
    pixels: [
      [4, 4],
      [8, 4],
      [8, 8],
      [4, 8],
    ],
    description: 'test polygon',
  },
  source: {
    dataset: 'SRTM',
    datasetVersion: 'test',
    downloadUrl: 'test',
    fileChecksum: 'test',
    license: 'public-domain',
    attribution: 'test',
  },
}

function makeUpliftEvent(
  delta: number,
  polygonId = 'demo',
): GeographyMutationEvent {
  return {
    kind: 'GeographyMutation',
    atDate: '2026-01-01',
    payload: { variant: 'volcanic_uplift', polygonId, elevationDelta: delta },
  }
}

// ============================================================================
// Test plan #4 — Volcanic uplift mean elevation
// ============================================================================

describe('applyEvent — volcanic_uplift mean elevation (test plan #4)', () => {
  it('increases inside-polygon pixels by exactly elevationDelta', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)

    applyEvent(state, TILE_META, makeUpliftEvent(400), rng)

    // Pixels (4..7, 4..7) should be exactly 1400.
    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        expect(state.heightmap[y * W + x]).toBe(1400)
      }
    }
  })

  it('leaves outside-polygon pixels unchanged', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)

    applyEvent(state, TILE_META, makeUpliftEvent(400), rng)

    let unchangedCount = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inside = x >= 4 && x <= 7 && y >= 4 && y <= 7
        if (!inside) {
          expect(state.heightmap[y * W + x]).toBe(BASE_ELEVATION)
          unchangedCount++
        }
      }
    }
    // 16x16 - 4x4 = 256 - 16 = 240 pixels outside.
    expect(unchangedCount).toBe(240)
  })
})

// ============================================================================
// Test plan #5 — Mask immutability
// ============================================================================

describe('applyEvent — mask immutability (test plan #5)', () => {
  it('does not mutate the mask buffer or its bytes', () => {
    const state = makeState()
    const maskRef = state.mask
    const maskCopy = new Uint8Array(state.mask)
    const rng = xoshiro256ss(0n)

    applyEvent(state, TILE_META, makeUpliftEvent(400), rng)

    // Reference equality — same buffer object.
    expect(state.mask).toBe(maskRef)
    // Byte equality — no contents changed.
    expect(state.mask).toEqual(maskCopy)
  })

  it('produces identical mask after applying many events in sequence', () => {
    const state = makeState()
    const maskCopy = new Uint8Array(state.mask)
    const rng = xoshiro256ss(0n)

    for (let i = 0; i < 100; i++) {
      applyEvent(state, TILE_META, makeUpliftEvent(1), rng)
    }

    expect(state.mask).toEqual(maskCopy)
  })
})

// ============================================================================
// Test plan #6 — Polygon clipping correctness
// ============================================================================

describe('applyEvent — polygon clipping (test plan #6)', () => {
  it('mutates exactly N pixels for a polygon covering N pixels', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)

    applyEvent(state, TILE_META, makeUpliftEvent(500), rng)

    let mutatedCount = 0
    for (let i = 0; i < state.heightmap.length; i++) {
      if (state.heightmap[i] !== BASE_ELEVATION) mutatedCount++
    }
    // Polygon covers 4×4 = 16 pixel centers exactly.
    expect(mutatedCount).toBe(16)
  })

  it('throws when polygon has fewer than 3 vertices', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)
    const badTile: TileMetadata = {
      ...TILE_META,
      demoPolygon: {
        polygonId: 'bad',
        pixels: [
          [0, 0],
          [1, 1],
        ],
        description: 'degenerate',
      },
    }
    expect(() =>
      applyEvent(state, badTile, makeUpliftEvent(100, 'bad'), rng),
    ).toThrow(/≥3 vertices/)
  })

  it('handles polygons whose bbox extends past image bounds (clips, no crash)', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)
    // Polygon corners reach (-5,-5) and (20,20) — extends past 16x16 bounds.
    const oversizeTile: TileMetadata = {
      ...TILE_META,
      demoPolygon: {
        polygonId: 'big',
        pixels: [
          [-5, -5],
          [20, -5],
          [20, 20],
          [-5, 20],
        ],
        description: 'covers everything',
      },
    }

    applyEvent(state, oversizeTile, makeUpliftEvent(100, 'big'), rng)

    // Every pixel should be mutated (polygon covers the whole image).
    for (let i = 0; i < state.heightmap.length; i++) {
      expect(state.heightmap[i]).toBe(1100)
    }
  })

  it('handles polygons entirely outside the image (no-op, no crash)', () => {
    const state = makeState()
    const heightmapCopy = new Uint16Array(state.heightmap)
    const rng = xoshiro256ss(0n)
    const offscreenTile: TileMetadata = {
      ...TILE_META,
      demoPolygon: {
        polygonId: 'off',
        pixels: [
          [100, 100],
          [110, 100],
          [110, 110],
          [100, 110],
        ],
        description: 'offscreen',
      },
    }

    applyEvent(state, offscreenTile, makeUpliftEvent(100, 'off'), rng)

    expect(state.heightmap).toEqual(heightmapCopy)
  })
})

// ============================================================================
// Test plan #7 — 16-bit upper clamp
// ============================================================================

describe('applyEvent — 16-bit upper clamp (test plan #7)', () => {
  it('clamps to UINT16_MAX (65535) when delta would overflow', () => {
    const state = makeState(60_000)
    const rng = xoshiro256ss(0n)

    // 60000 + 10000 = 70000 > 65535 → clamps to 65535
    applyEvent(state, TILE_META, makeUpliftEvent(10_000), rng)

    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        expect(state.heightmap[y * W + x]).toBe(65535)
      }
    }
  })

  it('does not wrap-around (would be the buggy behavior we are guarding against)', () => {
    const state = makeState(65_000)
    const rng = xoshiro256ss(0n)

    // 65000 + 1000 = 66000. If we wrapped at 16-bit, we'd see 66000 - 65536 = 464.
    // The correct clamp behavior is 65535.
    applyEvent(state, TILE_META, makeUpliftEvent(1000), rng)

    expect(state.heightmap[4 * W + 4]).toBe(65535)
    expect(state.heightmap[4 * W + 4]).not.toBe(464)
  })
})

// ============================================================================
// Test plan #8 — 16-bit lower clamp
// ============================================================================

describe('applyEvent — 16-bit lower clamp (test plan #8)', () => {
  it('clamps to 0 when negative delta would underflow', () => {
    const state = makeState(500)
    const rng = xoshiro256ss(0n)

    // 500 + (-1000) = -500 → clamps to 0
    applyEvent(state, TILE_META, makeUpliftEvent(-1000), rng)

    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        expect(state.heightmap[y * W + x]).toBe(0)
      }
    }
  })

  it('does not wrap-around on negative deltas', () => {
    const state = makeState(100)
    const rng = xoshiro256ss(0n)

    // If we wrapped, 100 - 200 = -100 stored as Uint16 → 65436.
    applyEvent(state, TILE_META, makeUpliftEvent(-200), rng)

    expect(state.heightmap[4 * W + 4]).toBe(0)
    expect(state.heightmap[4 * W + 4]).not.toBe(65436)
  })
})

// ============================================================================
// Test plan #9 — unknown event kinds throw
// ============================================================================

describe('applyEvent — unknown event kinds (test plan #9)', () => {
  it('throws when event.kind is unrecognized', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)
    const bogus = {
      kind: 'NotARealKind' as 'WorldCreated',
      atDate: '2026-01-01',
      payload: {} as WorldCreatedEvent['payload'],
    }
    expect(() =>
      applyEvent(state, TILE_META, bogus as WorldCreatedEvent, rng),
    ).toThrow(/unknown event kind/)
  })

  it('throws when GeographyMutation variant is unrecognized', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)
    const bogus = {
      kind: 'GeographyMutation',
      atDate: '2026-01-01',
      payload: {
        variant: 'tsunami' as 'volcanic_uplift',
        polygonId: 'demo',
        elevationDelta: 0,
      },
    } satisfies GeographyMutationEvent
    expect(() => applyEvent(state, TILE_META, bogus, xoshiro256ss(0n))).toThrow(
      /unknown variant/,
    )
  })

  it('throws when polygonId references a polygon not present on the tile', () => {
    const state = makeState()
    const rng = xoshiro256ss(0n)
    expect(() =>
      applyEvent(state, TILE_META, makeUpliftEvent(100, 'nonexistent'), rng),
    ).toThrow(/not found on tile/)
  })
})

// ============================================================================
// WorldCreated dispatch — should be a no-op on the substrate.
// ============================================================================

describe('applyEvent — WorldCreated is a no-op', () => {
  it('returns state unchanged for WorldCreated events', () => {
    const state = makeState()
    const heightmapCopy = new Uint16Array(state.heightmap)
    const maskCopy = new Uint8Array(state.mask)
    const rng = xoshiro256ss(0n)

    const created: WorldCreatedEvent = {
      kind: 'WorldCreated',
      atDate: '2026-01-01',
      payload: {
        name: 'Test World',
        tileSlug: 'earth-patagonia',
        magicLevel: 'standard',
        masterSeed: 'deadbeef',
      },
    }

    const result = applyEvent(state, TILE_META, created, rng)

    expect(result).toBe(state)
    expect(state.heightmap).toEqual(heightmapCopy)
    expect(state.mask).toEqual(maskCopy)
  })
})

// ============================================================================
// pointInPolygon unit tests — used internally; exported for direct testing.
// ============================================================================

describe('pointInPolygon', () => {
  const square = [
    [5, 5],
    [10, 5],
    [10, 10],
    [5, 10],
  ] as const

  it('returns true for points strictly inside', () => {
    expect(pointInPolygon(7.5, 7.5, square)).toBe(true)
  })

  it('returns false for points strictly outside (right of polygon)', () => {
    expect(pointInPolygon(15, 7.5, square)).toBe(false)
  })

  it('returns false for points strictly outside (above polygon)', () => {
    expect(pointInPolygon(7.5, 0, square)).toBe(false)
  })

  it('handles concave polygons (L-shape)', () => {
    const lShape = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ] as const
    expect(pointInPolygon(2.5, 2.5, lShape)).toBe(true) // bottom of L
    expect(pointInPolygon(2.5, 7.5, lShape)).toBe(true) // top of L
    expect(pointInPolygon(7.5, 7.5, lShape)).toBe(false) // notch (outside)
  })
})

// ============================================================================
// applyEvent — NationCreated (substrate-unchanged invariant)
// ============================================================================

describe('applyEvent — NationCreated', () => {
  it('REGRESSION: NationCreated does NOT mutate substrate state', () => {
    const state = makeState()
    const heightmapBefore = new Uint16Array(state.heightmap) // copy
    const maskBefore = new Uint8Array(state.mask) // copy
    const rng = xoshiro256ss(42n)

    const event: NationCreatedEvent = {
      kind: 'NationCreated',
      atDate: '1247-06-01',
      payload: {
        name: 'Test Nation',
        polygon: {
          type: 'Polygon',
          coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]],
        },
        interview: {
          D: 5, C: 5, M: 5, E: 5, I: 5, I2: 5,
          government: 'feudal',
          religion: 'pantheon',
          civTier: 'iron',
          species: 'human',
          currency: 'Gold Pieces',
        },
      },
    }

    const result = applyEvent(state, TILE_META, event, rng)

    // Substrate hash invariant: heightmap and mask must be byte-identical.
    expect(result.heightmap).toEqual(heightmapBefore)
    expect(result.mask).toEqual(maskBefore)
    expect(result.width).toBe(state.width)
    expect(result.height).toBe(state.height)
  })

  it('NationCreated dispatch returns state unchanged (object identity allowed)', () => {
    const state = makeState()
    const rng = xoshiro256ss(42n)
    const event: NationCreatedEvent = {
      kind: 'NationCreated',
      atDate: '1247-06-01',
      payload: {
        name: 'Test', polygon: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        interview: {
          D: 1, C: 1, M: 1, E: 1, I: 1, I2: 1,
          government: 'anarchic', religion: 'secular', civTier: 'bone', species: 'human',
          currency: 'Gold Pieces',
        },
      },
    }
    const result = applyEvent(state, TILE_META, event, rng)
    // Implementation may return same reference or a new object with same bytes.
    expect(result.width).toBe(state.width)
  })
})

// ============================================================================
// applyEvent — WorldGenerated (substrate-unchanged invariant)
// ============================================================================

describe('applyEvent — WorldGenerated', () => {
  it('REGRESSION: WorldGenerated does NOT mutate substrate state', () => {
    const state = makeState()
    const heightmapBefore = new Uint16Array(state.heightmap) // copy
    const maskBefore = new Uint8Array(state.mask) // copy
    const rng = xoshiro256ss(42n)

    const event: WorldGeneratedEvent = {
      kind: 'WorldGenerated',
      atDate: '0000-01-01',
      payload: {
        seed: '00'.repeat(32), // 64-char hex (4 × u64)
        continents: [],
      },
    }

    const result = applyEvent(state, TILE_META, event, rng)

    // Substrate hash invariant: heightmap and mask must be byte-identical.
    expect(result.heightmap).toEqual(heightmapBefore)
    expect(result.mask).toEqual(maskBefore)
    expect(result.width).toBe(state.width)
    expect(result.height).toBe(state.height)
  })
})
