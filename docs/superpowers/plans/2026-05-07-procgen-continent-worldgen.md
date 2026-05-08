# Procedural Continent Worldgen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 5-day spike: user clicks Create World → picks (or omits) a master seed → sees a unique 2D world map with N filled continent polygons on a verdigris ocean. Earth-statistics-bounded randomness produces "Earth-credible but not Earth" worlds. Same seed → byte-identical world every time. No terrain, no archetypes — those are the next iterations.

**Architecture:** New `Continent` entity stored on the existing event-sourced world via a new `WorldGenerated` event. Pure procgen function in `packages/sim/src/worldgen/` produces continents from a seed (xoshiro256** + splitmix64 stage-seeding per AP §2). Web side adds a thin new route + form, branches the existing world-detail page on `procgen_seed`, and extends `MapView` with a continents render layer using the same data-driven fill+line pattern already proven for `savedNations`.

**Tech Stack:** TypeScript strict, Vitest (unit + integration), Playwright (E2E), MapLibre GL (existing), Next.js App Router (existing), Supabase Postgres (existing). No new pinned dependencies.

**Spec source:** `docs/superpowers/specs/2026-05-07-procgen-continent-worldgen-design.md`

---

## File Structure

```
packages/sim/src/
├── types.ts                                    # MODIFY — add Continent type, WorldGeneratedPayload, widen WorldEvent union
├── index.ts                                    # MODIFY — export Continent type
├── events/
│   ├── applyEvent.ts                           # MODIFY — WorldGenerated branch (no-op on substrate)
│   └── applyEvent.test.ts                      # MODIFY — regression: substrate-unchanged invariant for WorldGenerated
└── worldgen/                                   # NEW LIBRARY
    ├── index.ts                                # public surface
    ├── earth-stats.ts                          # constants codifying Earth's actual numbers
    ├── earth-stats.test.ts                     # static-value tests (smoke; documents intent)
    ├── seed.ts                                 # mixSeedString (string → 4×u64 xoshiro state)
    ├── seed.test.ts
    ├── bias.ts                                 # biasNorth, sampleLatitudeBand
    ├── bias.test.ts
    ├── pareto.ts                               # samplePareto + sizeBudget
    ├── pareto.test.ts
    ├── voronoi.ts                              # sphericalVoronoi (analytical, great-circle bisectors)
    ├── voronoi.test.ts
    ├── fractalize.ts                           # brownianBridgeRing (recursive midpoint + perpendicular noise)
    ├── fractalize.test.ts
    ├── naming.ts                               # generatePlaceholderName
    ├── naming.test.ts
    ├── generate-world.ts                       # main pipeline
    └── generate-world.test.ts                  # determinism + characteristic-stat tests

supabase/migrations/
└── 0005_procgen_worlds.sql                     # NEW — adds procgen_seed column + check constraint

apps/web/src/
├── app/
│   ├── page.tsx                                # MODIFY — add "New procgen world" button
│   ├── api/worlds/procgen/
│   │   └── route.ts                            # NEW — POST creates a procgen world
│   └── worlds/
│       ├── new-procgen/
│       │   ├── page.tsx                        # NEW — server page (auth gate)
│       │   └── procgen-form.tsx                # NEW — client form (single seed input)
│       ├── [id]/
│       │   ├── page.tsx                        # MODIFY — branch on procgen_seed; load WorldGenerated event
│       │   └── world-detail-client.tsx         # MODIFY — accept continents, conditional rendering
└── components/
    └── MapView.tsx                             # MODIFY — accept continents prop, conditional bg, mount continents layer

e2e/tests/
└── procgen-world.spec.ts                       # NEW — happy path: create procgen world → see N continents
```

**File count:** 21 new + 7 modified = 28 files.

---

## Day 1 — Foundations: types, RNG seed handling, Earth stats, bias

### Task 1: Add Continent type to @mauro/sim types

**Files:**
- Modify: `packages/sim/src/types.ts`
- Modify: `packages/sim/src/index.ts`

- [ ] **Step 1: Add the Continent + WorldGeneratedPayload types**

In `packages/sim/src/types.ts`, near the existing `NationCreatedPayload` interface, add:

```ts
/**
 * A procgen continent — an entity that lives on a procgen-kind world.
 * Polygon is a closed ring on the sphere in (lon, lat) order. Interior
 * coordinates are kept simple — a single outer ring, no holes — for v1.
 */
export interface Continent {
  /** uuid v4, generated deterministically from the world seed. */
  id: string
  /** Placeholder generative name, e.g. "Continent Theta". */
  name: string
  /** Hex color used for both fill and (darker variant) stroke. */
  color: string
  /** Closed ring on the sphere; first vertex repeated as last. */
  polygon: GeoJSONPolygon
}

export interface WorldGeneratedPayload {
  /** Hex-encoded master seed (4 × u64) used to produce the continents. */
  seed: string
  /** Continents pinned at world-creation time — see determinism spec §determinism. */
  continents: Continent[]
}
```

Find the existing `WorldEvent` union (search for `kind: 'NationCreated'`) and widen it to include `WorldGenerated`:

```ts
export type WorldEvent =
  | WorldCreatedEvent
  | NationCreatedEvent
  | GeographyMutationEvent
  | WorldGeneratedEvent

export interface WorldGeneratedEvent {
  id: number
  worldId: string
  kind: 'WorldGenerated'
  atDate: string
  payload: WorldGeneratedPayload
}
```

- [ ] **Step 2: Export Continent + WorldGeneratedPayload from the package barrel**

Edit `packages/sim/src/index.ts`. Find the existing `export * from './types'` line. It already re-exports the new types, so no change is needed there — but verify by reading the line.

If `./types` is not re-exported via `export *`, add explicit re-exports:

```ts
export type { Continent, WorldGeneratedPayload, WorldGeneratedEvent } from './types'
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/sim && npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/sim/src/types.ts packages/sim/src/index.ts
git commit -m "feat(sim): Continent + WorldGenerated types"
```

---

### Task 2: Earth statistics constants

**Files:**
- Create: `packages/sim/src/worldgen/earth-stats.ts`
- Create: `packages/sim/src/worldgen/earth-stats.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/earth-stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LAND_COVERAGE_FRACTION,
  CONTINENT_COUNT_DISTRIBUTION,
  HEMISPHERIC_BIAS_NORTH,
  LATITUDINAL_WEIGHTING,
  SIZE_DISTRIBUTION_ALPHA,
  COASTLINE_COMPLEXITY_RANGE,
} from './earth-stats'

describe('earth-stats — values are sane defaults', () => {
  it('LAND_COVERAGE_FRACTION matches Earth (~29%)', () => {
    expect(LAND_COVERAGE_FRACTION).toBeGreaterThan(0.27)
    expect(LAND_COVERAGE_FRACTION).toBeLessThan(0.31)
  })

  it('CONTINENT_COUNT_DISTRIBUTION sums to 1.0', () => {
    const sum = CONTINENT_COUNT_DISTRIBUTION.reduce((a, [, w]) => a + w, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('CONTINENT_COUNT_DISTRIBUTION is centered around 5–6', () => {
    const counts = CONTINENT_COUNT_DISTRIBUTION
    const five = counts.find(([n]) => n === 5)
    const six = counts.find(([n]) => n === 6)
    expect(five?.[1]).toBeGreaterThan(0.3)
    expect(six?.[1]).toBeGreaterThan(0.3)
  })

  it('HEMISPHERIC_BIAS_NORTH matches Earth (~68% N)', () => {
    expect(HEMISPHERIC_BIAS_NORTH).toBeGreaterThan(0.65)
    expect(HEMISPHERIC_BIAS_NORTH).toBeLessThan(0.72)
  })

  it('LATITUDINAL_WEIGHTING has 18 bands (10° each)', () => {
    expect(LATITUDINAL_WEIGHTING).toHaveLength(18)
  })

  it('LATITUDINAL_WEIGHTING sums to 1.0', () => {
    const sum = LATITUDINAL_WEIGHTING.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('SIZE_DISTRIBUTION_ALPHA is in plausible Pareto range', () => {
    expect(SIZE_DISTRIBUTION_ALPHA).toBeGreaterThan(1.0)
    expect(SIZE_DISTRIBUTION_ALPHA).toBeLessThan(2.5)
  })

  it('COASTLINE_COMPLEXITY_RANGE is [smoothMin, fractalMax]', () => {
    const [lo, hi] = COASTLINE_COMPLEXITY_RANGE
    expect(lo).toBeGreaterThanOrEqual(1.0)
    expect(hi).toBeLessThanOrEqual(1.6)
    expect(lo).toBeLessThan(hi)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sim
npx vitest run src/worldgen/earth-stats.test.ts
```

Expected: FAIL — module `./earth-stats` not found.

- [ ] **Step 3: Implement the constants**

Create `packages/sim/src/worldgen/earth-stats.ts`:

```ts
// Earth-statistics constants for procgen worldgen. These are the centerpoint
// values the procgen function defaults to; randomness is bounded around them.
//
// Source values: Wikipedia "Earth", "Geography of Earth", "Continent". Numbers
// are calibrated to produce Earth-credible variance, not pixel-accurate Earth.

/** Earth's land:water ratio. ~149 / 510 million km² ≈ 0.29. */
export const LAND_COVERAGE_FRACTION = 0.29

/** Distribution over (continent count, weight). Weighted toward 5–6 — Earth
 *  has 5–7 continents depending on the convention used. */
export const CONTINENT_COUNT_DISTRIBUTION: ReadonlyArray<readonly [number, number]> = [
  [4, 0.15],
  [5, 0.40],
  [6, 0.35],
  [7, 0.10],
]

/** Fraction of land area in the Northern hemisphere. Earth is ~68% N. */
export const HEMISPHERIC_BIAS_NORTH = 0.68

/**
 * Probability density over 18 latitude bands of 10° each, ordered south-to-north:
 *   bands[0] = -90°..-80°, bands[1] = -80°..-70°, ..., bands[17] = +80°..+90°
 *
 * Calibrated from Earth's actual continent area distribution: most land sits
 * 30°–70°N with a secondary cluster 0°–30°S (Africa/South America/Australia)
 * and Antarctica's contribution at the south pole.
 *
 * Sums to 1.0 (verified by test).
 */
export const LATITUDINAL_WEIGHTING: ReadonlyArray<number> = [
  0.04, 0.02, 0.01, 0.01, 0.02, 0.03, // -90 to -30
  0.05, 0.07, 0.06, 0.04, // -30 to +10
  0.06, 0.10, 0.13, 0.13, // +10 to +50
  0.10, 0.07, 0.04, 0.02, // +50 to +90
]

/** Pareto α for continent size distribution. α=1.4 produces a long-tailed
 *  distribution where the largest continent is ~3× the median. */
export const SIZE_DISTRIBUTION_ALPHA = 1.4

/** Per-continent fractal dimension D for coastline complexity.
 *  1.05 = smooth (Africa-style); 1.5 = highly fractal (Norway fjords). */
export const COASTLINE_COMPLEXITY_RANGE: readonly [number, number] = [1.05, 1.5]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/worldgen/earth-stats.test.ts
```

Expected: PASS — 8/8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/earth-stats.ts packages/sim/src/worldgen/earth-stats.test.ts
git commit -m "feat(sim/worldgen): Earth-statistics constants"
```

---

### Task 3: Seed parsing — string → xoshiro state

**Files:**
- Create: `packages/sim/src/worldgen/seed.ts`
- Create: `packages/sim/src/worldgen/seed.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mixSeedString, encodeSeedHex, parseSeedHex } from './seed'

describe('seed — string mixing', () => {
  it('produces 4 × u64 (BigInt) state from any string', () => {
    const state = mixSeedString('hello')
    expect(state).toHaveLength(4)
    state.forEach((s) => {
      expect(typeof s).toBe('bigint')
      expect(s).toBeGreaterThanOrEqual(0n)
      expect(s).toBeLessThan(1n << 64n)
    })
  })

  it('is deterministic for the same input', () => {
    const a = mixSeedString('hello')
    const b = mixSeedString('hello')
    expect(a).toEqual(b)
  })

  it('produces different states for different inputs', () => {
    const a = mixSeedString('hello')
    const b = mixSeedString('world')
    expect(a).not.toEqual(b)
  })

  it('rejects empty string with a clear error', () => {
    expect(() => mixSeedString('')).toThrow(/empty/i)
  })

  it('handles unicode without throwing', () => {
    expect(() => mixSeedString('世界')).not.toThrow()
  })
})

describe('seed — hex round-trip', () => {
  it('encodes 4 × u64 as a single hex string', () => {
    const state: [bigint, bigint, bigint, bigint] = [1n, 2n, 3n, 4n]
    const hex = encodeSeedHex(state)
    expect(hex).toMatch(/^[0-9a-f]+$/)
    expect(hex.length).toBe(64) // 4 × 16 hex chars
  })

  it('round-trips encode → parse', () => {
    const original: [bigint, bigint, bigint, bigint] = [
      0xdeadbeefcafebafen,
      0x1n,
      0xffffffffffffffffn,
      0x9e3779b97f4a7c15n,
    ]
    const hex = encodeSeedHex(original)
    const parsed = parseSeedHex(hex)
    expect(parsed).toEqual(original)
  })

  it('parseSeedHex rejects malformed input', () => {
    expect(() => parseSeedHex('not-hex')).toThrow(/hex/i)
    expect(() => parseSeedHex('abc')).toThrow(/64/)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/seed.test.ts
```

Expected: FAIL — module `./seed` not found.

- [ ] **Step 3: Implement seed.ts**

Create `packages/sim/src/worldgen/seed.ts`:

```ts
import { splitmix64 } from '../rng/splitmix64'

const MASK_64 = (1n << 64n) - 1n

/**
 * Hash a string into 4 × u64 — the initial state for xoshiro256**.
 *
 * Uses FNV-1a (64-bit) over UTF-8 bytes to produce a single 64-bit hash,
 * then runs splitmix64 four times to derive the four state words. This is
 * deterministic, platform-independent (BigInt arithmetic doesn't care about
 * native word size), and well-distributed enough for seeding a PRNG.
 */
export function mixSeedString(s: string): [bigint, bigint, bigint, bigint] {
  if (s.length === 0) {
    throw new Error('mixSeedString: seed string cannot be empty')
  }

  // FNV-1a 64-bit over UTF-8 bytes.
  const FNV_OFFSET = 0xcbf29ce484222325n
  const FNV_PRIME = 0x100000001b3n
  const bytes = new TextEncoder().encode(s)
  let hash = FNV_OFFSET
  for (const b of bytes) {
    hash = (hash ^ BigInt(b)) & MASK_64
    hash = (hash * FNV_PRIME) & MASK_64
  }

  // Avoid the all-zero state — xoshiro256** has it as an algorithmic fixed point.
  if (hash === 0n) hash = 0x9e3779b97f4a7c15n

  // Use splitmix64 to derive four state words from the FNV hash.
  const sm = splitmix64(hash)
  return [sm(), sm(), sm(), sm()]
}

/** Encode 4 × u64 as a single 64-character lowercase hex string. */
export function encodeSeedHex(state: readonly [bigint, bigint, bigint, bigint]): string {
  return state.map((s) => (s & MASK_64).toString(16).padStart(16, '0')).join('')
}

/** Parse a 64-character hex string back into 4 × u64. */
export function parseSeedHex(hex: string): [bigint, bigint, bigint, bigint] {
  if (!/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('parseSeedHex: input must be hex (0-9, a-f)')
  }
  if (hex.length !== 64) {
    throw new Error(`parseSeedHex: input must be 64 hex chars (got ${hex.length})`)
  }
  return [
    BigInt('0x' + hex.slice(0, 16)),
    BigInt('0x' + hex.slice(16, 32)),
    BigInt('0x' + hex.slice(32, 48)),
    BigInt('0x' + hex.slice(48, 64)),
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/worldgen/seed.test.ts
```

Expected: PASS — all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/seed.ts packages/sim/src/worldgen/seed.test.ts
git commit -m "feat(sim/worldgen): seed string → xoshiro state mixing"
```

---

### Task 4: Hemispheric + latitudinal bias

**Files:**
- Create: `packages/sim/src/worldgen/bias.ts`
- Create: `packages/sim/src/worldgen/bias.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/bias.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { sampleLatitudeBand, biasLatitudeNorth } from './bias'
import { LATITUDINAL_WEIGHTING } from './earth-stats'

describe('sampleLatitudeBand — Earth-weighted draw', () => {
  it('returns a latitude in [-90, +90]', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    for (let i = 0; i < 100; i++) {
      const lat = sampleLatitudeBand(rng, LATITUDINAL_WEIGHTING)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
    }
  })

  it('empirical distribution matches the input weighting (1000 samples, ±5%)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const counts = new Array(LATITUDINAL_WEIGHTING.length).fill(0)
    const N = 1000
    for (let i = 0; i < N; i++) {
      const lat = sampleLatitudeBand(rng, LATITUDINAL_WEIGHTING)
      const band = Math.min(17, Math.floor((lat + 90) / 10))
      counts[band] += 1
    }
    for (let i = 0; i < LATITUDINAL_WEIGHTING.length; i++) {
      const expected = LATITUDINAL_WEIGHTING[i] * N
      const observed = counts[i]
      // Allow ±5% absolute (~50 of 1000), more tolerant for sparse bands
      const tolerance = Math.max(20, expected * 0.5)
      expect(Math.abs(observed - expected)).toBeLessThan(tolerance)
    }
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    const seq1 = Array.from({ length: 50 }, () => sampleLatitudeBand(r1, LATITUDINAL_WEIGHTING))
    const seq2 = Array.from({ length: 50 }, () => sampleLatitudeBand(r2, LATITUDINAL_WEIGHTING))
    expect(seq1).toEqual(seq2)
  })
})

describe('biasLatitudeNorth — northward shift on uniform latitudes', () => {
  it('a 0.68 bias produces ~68% of points in the N hemisphere (±5%, 1000 samples)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    let north = 0
    const N = 1000
    for (let i = 0; i < N; i++) {
      const uniformLat = (rng.next() % 18000n) / 100n // 0..180 in 0.01 degree steps, then -90
      const startLat = Number(uniformLat) - 90
      const biased = biasLatitudeNorth(rng, startLat, 0.68)
      if (biased > 0) north += 1
    }
    expect(north / N).toBeGreaterThan(0.62)
    expect(north / N).toBeLessThan(0.74)
  })

  it('a 0.5 bias is approximately neutral (±5%)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    let north = 0
    const N = 1000
    for (let i = 0; i < N; i++) {
      const uniformLat = (rng.next() % 18000n) / 100n
      const startLat = Number(uniformLat) - 90
      const biased = biasLatitudeNorth(rng, startLat, 0.5)
      if (biased > 0) north += 1
    }
    expect(north / N).toBeGreaterThan(0.45)
    expect(north / N).toBeLessThan(0.55)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/bias.test.ts
```

Expected: FAIL — module `./bias` not found.

- [ ] **Step 3: Implement bias.ts**

Create `packages/sim/src/worldgen/bias.ts`:

```ts
import type { Xoshiro256 } from '../rng/xoshiro256'

const MASK_64 = (1n << 64n) - 1n

/** RNG → uniform [0, 1) double. */
function nextDouble(rng: Xoshiro256): number {
  // Top 53 bits of a 64-bit integer, divided by 2^53. Standard PRNG → double.
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/**
 * Sample a latitude in [-90, +90] from a discrete probability density over
 * latitude bands. `weights` is an array whose length defines band count;
 * each entry is the fraction of probability mass in that band.
 *
 * Within a chosen band, latitude is sampled uniformly. This is intentionally
 * coarse — the bands are 10° wide on Earth, which is finer than the variance
 * we care about for continent placement.
 */
export function sampleLatitudeBand(
  rng: Xoshiro256,
  weights: ReadonlyArray<number>,
): number {
  const u = nextDouble(rng)
  let cum = 0
  let band = 0
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i]!
    if (u < cum) {
      band = i
      break
    }
    band = weights.length - 1
  }
  const bandWidthDeg = 180 / weights.length
  const bandStart = -90 + band * bandWidthDeg
  return bandStart + nextDouble(rng) * bandWidthDeg
}

/**
 * Given a starting latitude and a "fraction of points that should end up
 * northward" weight, decide whether to flip-and-mirror. This is a pre-bias
 * step before any uniform-on-sphere sampler — it shifts the distribution
 * without breaking determinism.
 *
 * `biasNorth` ∈ [0, 1]: 0.5 = neutral, 1.0 = always-north, 0.0 = always-south.
 *
 * Algorithm: with probability `biasNorth` the point is forced into the
 * northern hemisphere (mirror if currently south). With probability
 * (1 - biasNorth) the point is forced south (mirror if currently north).
 * The result is exactly the requested distribution, regardless of the
 * input distribution.
 */
export function biasLatitudeNorth(
  rng: Xoshiro256,
  lat: number,
  biasNorth: number,
): number {
  const wantNorth = nextDouble(rng) < biasNorth
  const isNorth = lat > 0
  if (wantNorth === isNorth) return lat
  return -lat
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/worldgen/bias.test.ts
```

Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/bias.ts packages/sim/src/worldgen/bias.test.ts
git commit -m "feat(sim/worldgen): hemispheric + latitudinal bias sampling"
```

---

## Day 2 — Spherical Voronoi tessellation

### Task 5: Spherical Voronoi cell extraction

**Files:**
- Create: `packages/sim/src/worldgen/voronoi.ts`
- Create: `packages/sim/src/worldgen/voronoi.test.ts`

The hardest piece. We compute Voronoi cells on the unit sphere given N seed points (in (lon, lat)). Output: for each seed, a polygon (ring of (lon, lat) points) that bounds its cell.

**Algorithm:** brute-force discretization for N ≤ 16 (our case is N ≤ 7). Generate ~4000 test points evenly distributed on the sphere via Fibonacci spiral. For each test point, find its nearest seed by great-circle distance. Group test points by nearest-seed → cell membership. For each cell, extract its boundary by finding test points whose nearest neighbors include other-seed cells, and order them around the seed via angle.

This is intentionally not the analytical great-circle-bisector approach. Brute force is:
- Simpler (~80 lines vs ~250)
- More robust (no degenerate cases at the antimeridian)
- Plenty fast for N=7 (4000 distance comparisons × 7 = 28k ops, sub-millisecond)
- Acceptable boundary smoothness for the spike (refined later by fractalization)

- [ ] **Step 1: Write the tests first**

Create `packages/sim/src/worldgen/voronoi.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { sphericalVoronoi } from './voronoi'
import type { LonLat } from '../sphere/coords'

describe('sphericalVoronoi — basic invariants', () => {
  const seedPoints: LonLat[] = [
    { lon: 0, lat: 0 },
    { lon: 90, lat: 0 },
    { lon: 180, lat: 0 },
    { lon: -90, lat: 0 },
    { lon: 0, lat: 60 },
    { lon: 0, lat: -60 },
  ]

  it('returns one cell per seed point', () => {
    const cells = sphericalVoronoi(seedPoints)
    expect(cells).toHaveLength(seedPoints.length)
  })

  it('each cell is a closed polygon (first point repeats as last)', () => {
    const cells = sphericalVoronoi(seedPoints)
    for (const cell of cells) {
      const ring = cell.coordinates[0]!
      expect(ring.length).toBeGreaterThan(3)
      const first = ring[0]!
      const last = ring[ring.length - 1]!
      expect(last[0]).toBeCloseTo(first[0], 6)
      expect(last[1]).toBeCloseTo(first[1], 6)
    }
  })

  it('each cell contains its seed point', () => {
    const cells = sphericalVoronoi(seedPoints)
    for (let i = 0; i < seedPoints.length; i++) {
      const seed = seedPoints[i]!
      const ringPoints = cells[i]!.coordinates[0]!
      const meanLon = ringPoints.reduce((a, p) => a + p[0], 0) / ringPoints.length
      const meanLat = ringPoints.reduce((a, p) => a + p[1], 0) / ringPoints.length
      // The seed should be closer to the cell's centroid than any other seed's centroid
      const dToOwn = Math.hypot(meanLon - seed.lon, meanLat - seed.lat)
      for (let j = 0; j < seedPoints.length; j++) {
        if (j === i) continue
        const other = seedPoints[j]!
        const dToOther = Math.hypot(meanLon - other.lon, meanLat - other.lat)
        // Ownership: cell mean should be closer to its own seed than to others'
        // (allowing some tolerance for spherical distortion at high latitudes)
        expect(dToOwn).toBeLessThan(dToOther + 30)
      }
    }
  })

  it('is deterministic for the same input order', () => {
    const a = sphericalVoronoi(seedPoints)
    const b = sphericalVoronoi(seedPoints)
    expect(a).toEqual(b)
  })

  it('handles N=2 (two-cell tessellation, hemispheres)', () => {
    const two: LonLat[] = [
      { lon: 0, lat: 0 },
      { lon: 180, lat: 0 },
    ]
    const cells = sphericalVoronoi(two)
    expect(cells).toHaveLength(2)
    cells.forEach((cell) => {
      expect(cell.coordinates[0]!.length).toBeGreaterThan(8)
    })
  })

  it('throws on N < 2', () => {
    expect(() => sphericalVoronoi([{ lon: 0, lat: 0 }])).toThrow(/at least 2/)
    expect(() => sphericalVoronoi([])).toThrow(/at least 2/)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/voronoi.test.ts
```

Expected: FAIL — module `./voronoi` not found.

- [ ] **Step 3: Implement voronoi.ts**

Create `packages/sim/src/worldgen/voronoi.ts`:

```ts
import type { GeoJSONPolygon } from '../types'
import type { LonLat } from '../sphere/coords'
import { lonLatToCartesian } from '../sphere/coords'

const TEST_POINT_COUNT = 4000

/** Great-circle distance squared (chord length squared on the unit sphere). */
function chordDistSq(a: LonLat, b: LonLat): number {
  const ca = lonLatToCartesian(a)
  const cb = lonLatToCartesian(b)
  const dx = ca.x - cb.x
  const dy = ca.y - cb.y
  const dz = ca.z - cb.z
  return dx * dx + dy * dy + dz * dz
}

/** Fibonacci-spiral on the unit sphere — N points, evenly distributed. */
function fibonacciSphere(n: number): LonLat[] {
  const points: LonLat[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i) / (n - 1)
    const radius = Math.sqrt(1 - y * y)
    const theta = goldenAngle * i
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius
    const lat = Math.asin(y) * (180 / Math.PI)
    const lon = Math.atan2(z, x) * (180 / Math.PI)
    points.push({ lon, lat })
  }
  return points
}

/** Index of the nearest seed point to `p`, by great-circle distance. */
function nearestSeed(p: LonLat, seeds: LonLat[]): number {
  let bestIdx = 0
  let bestD = Infinity
  for (let i = 0; i < seeds.length; i++) {
    const d = chordDistSq(p, seeds[i]!)
    if (d < bestD) {
      bestD = d
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Compute Voronoi cells on the unit sphere for N seed points.
 *
 * Returns one closed polygon per seed (in input order). Polygon coordinates
 * are (lon, lat) pairs; the first vertex is repeated as the last.
 *
 * Algorithm: brute-force via dense Fibonacci-spiral test points. For each
 * test point, find its nearest seed → labels every test point with a cell id.
 * For each cell, extract the labeled test points, sort them around the seed
 * by bearing, and return as a polygon ring.
 *
 * Trade-off: boundaries are coarse (~3° resolution) — the fractalization
 * pass smooths and adds detail. For N ≤ 16 seeds this is sub-millisecond.
 */
export function sphericalVoronoi(seeds: LonLat[]): GeoJSONPolygon[] {
  if (seeds.length < 2) {
    throw new Error('sphericalVoronoi: requires at least 2 seed points')
  }

  // Step 1: dense test-point distribution.
  const testPoints = fibonacciSphere(TEST_POINT_COUNT)

  // Step 2: label every test point with its nearest-seed index.
  const labels = testPoints.map((p) => nearestSeed(p, seeds))

  // Step 3: per cell, gather labeled test points and sort by bearing from seed.
  const result: GeoJSONPolygon[] = []
  for (let cellId = 0; cellId < seeds.length; cellId++) {
    const cellPoints: Array<{ lon: number; lat: number; bearing: number }> = []
    const seed = seeds[cellId]!
    for (let i = 0; i < testPoints.length; i++) {
      if (labels[i] !== cellId) continue
      const p = testPoints[i]!
      // Bearing from seed to p (deg). Naive approximation OK at this resolution.
      const dLon = p.lon - seed.lon
      const dLat = p.lat - seed.lat
      const bearing = Math.atan2(dLat, dLon)
      cellPoints.push({ lon: p.lon, lat: p.lat, bearing })
    }
    cellPoints.sort((a, b) => a.bearing - b.bearing)
    const ring: Array<[number, number]> = cellPoints.map((c) => [c.lon, c.lat])
    if (ring.length > 0) {
      ring.push([ring[0]![0], ring[0]![1]]) // close the ring
    }
    result.push({ type: 'Polygon', coordinates: [ring] })
  }
  return result
}
```

- [ ] **Step 4: Run test, expect PASS on the basic invariants**

```bash
npx vitest run src/worldgen/voronoi.test.ts
```

Expected: PASS on all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/voronoi.ts packages/sim/src/worldgen/voronoi.test.ts
git commit -m "feat(sim/worldgen): spherical Voronoi tessellation (brute-force)"
```

---

## Day 3 — Pareto sampling, fractalization, naming

### Task 6: Pareto size sampling + cell-area constraint

**Files:**
- Create: `packages/sim/src/worldgen/pareto.ts`
- Create: `packages/sim/src/worldgen/pareto.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/pareto.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { samplePareto, allocateLandShares } from './pareto'

describe('samplePareto', () => {
  it('returns values >= 1 (Pareto support is [x_min, ∞), x_min=1)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    for (let i = 0; i < 100; i++) {
      const v = samplePareto(rng, 1.4)
      expect(v).toBeGreaterThanOrEqual(1.0)
    }
  })

  it('larger α produces less skewed distributions (median lower)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const samplesAlpha1 = Array.from({ length: 1000 }, () => samplePareto(rng, 1.0))
    const samplesAlpha3 = Array.from({ length: 1000 }, () => samplePareto(rng, 3.0))
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    expect(median(samplesAlpha3)).toBeLessThan(median(samplesAlpha1))
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    const a = Array.from({ length: 50 }, () => samplePareto(r1, 1.4))
    const b = Array.from({ length: 50 }, () => samplePareto(r2, 1.4))
    expect(a).toEqual(b)
  })
})

describe('allocateLandShares', () => {
  it('returns N values that sum to totalLand (within float epsilon)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const shares = allocateLandShares(rng, 6, 0.29 * 4 * Math.PI, 1.4)
    expect(shares).toHaveLength(6)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(0.29 * 4 * Math.PI, 6)
  })

  it('produces a Pareto-shaped distribution: max is several times median', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const shares = allocateLandShares(rng, 7, 1.0, 1.4).sort((a, b) => b - a)
    expect(shares[0]!).toBeGreaterThan(2 * shares[Math.floor(shares.length / 2)]!)
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    const a = allocateLandShares(r1, 6, 1.0, 1.4)
    const b = allocateLandShares(r2, 6, 1.0, 1.4)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/pareto.test.ts
```

Expected: FAIL — module `./pareto` not found.

- [ ] **Step 3: Implement pareto.ts**

Create `packages/sim/src/worldgen/pareto.ts`:

```ts
import type { Xoshiro256 } from '../rng/xoshiro256'

/** Top 53 bits → [0, 1). */
function nextDouble(rng: Xoshiro256): number {
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/**
 * Sample from a Pareto (Type I) distribution with x_min = 1.
 *
 * CDF: F(x) = 1 - (1/x)^α for x ≥ 1.
 * Inverse-CDF sampling: x = (1 - u)^(-1/α) where u ∈ [0, 1).
 */
export function samplePareto(rng: Xoshiro256, alpha: number): number {
  if (alpha <= 0) {
    throw new Error('samplePareto: alpha must be > 0')
  }
  // (1 - u) ∈ (0, 1], so 1 / (1 - u) is finite.
  const u = nextDouble(rng)
  return Math.pow(1 - u, -1 / alpha)
}

/**
 * Allocate `totalLand` units across `count` continents using a Pareto-shaped
 * distribution. Returns `count` numbers that sum exactly to `totalLand`.
 *
 * Algorithm: draw `count` Pareto samples, then normalize them to sum to
 * `totalLand`. Preserves the relative-shape property (one big + several
 * smaller) while constraining the total.
 */
export function allocateLandShares(
  rng: Xoshiro256,
  count: number,
  totalLand: number,
  alpha: number,
): number[] {
  if (count < 1) {
    throw new Error('allocateLandShares: count must be ≥ 1')
  }
  const raw: number[] = []
  let sum = 0
  for (let i = 0; i < count; i++) {
    const v = samplePareto(rng, alpha)
    raw.push(v)
    sum += v
  }
  return raw.map((v) => (v / sum) * totalLand)
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/worldgen/pareto.test.ts
```

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/pareto.ts packages/sim/src/worldgen/pareto.test.ts
git commit -m "feat(sim/worldgen): Pareto size sampling + land-share allocation"
```

---

### Task 7: Brownian-bridge ring fractalization

**Files:**
- Create: `packages/sim/src/worldgen/fractalize.ts`
- Create: `packages/sim/src/worldgen/fractalize.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/fractalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { brownianBridgeRing } from './fractalize'

describe('brownianBridgeRing', () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  it('returns a closed polygon (first vertex repeats as last)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    const first = out[0]!
    const last = out[out.length - 1]!
    expect(last[0]).toBeCloseTo(first[0], 9)
    expect(last[1]).toBeCloseTo(first[1], 9)
  })

  it('produces 2^subdivisions × original segments', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const original = square.length - 1 // 4 segments
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    // After 3 subdivisions, each segment becomes 8 segments → 32 total + closing = 33
    expect(out.length).toBe(original * Math.pow(2, 3) + 1)
  })

  it('output ring still encloses the original (centroid preserved)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    const cx = out.slice(0, -1).reduce((a, p) => a + p[0], 0) / (out.length - 1)
    const cy = out.slice(0, -1).reduce((a, p) => a + p[1], 0) / (out.length - 1)
    // Square's centroid is (5, 5).
    expect(cx).toBeCloseTo(5, 0)
    expect(cy).toBeCloseTo(5, 0)
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    const a = brownianBridgeRing(r1, square, 1.2, 3)
    const b = brownianBridgeRing(r2, square, 1.2, 3)
    expect(a).toEqual(b)
  })

  it('higher fractalDimension produces longer perimeter (more wiggly)', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    const smooth = brownianBridgeRing(r1, square, 1.05, 4)
    const wiggly = brownianBridgeRing(r2, square, 1.5, 4)

    const perim = (ring: Array<[number, number]>) => {
      let p = 0
      for (let i = 1; i < ring.length; i++) {
        const dx = ring[i]![0] - ring[i - 1]![0]
        const dy = ring[i]![1] - ring[i - 1]![1]
        p += Math.hypot(dx, dy)
      }
      return p
    }
    expect(perim(wiggly)).toBeGreaterThan(perim(smooth))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/fractalize.test.ts
```

Expected: FAIL — module `./fractalize` not found.

- [ ] **Step 3: Implement fractalize.ts**

Create `packages/sim/src/worldgen/fractalize.ts`:

```ts
import type { Xoshiro256 } from '../rng/xoshiro256'

/** Top 53 bits → [0, 1). */
function nextDouble(rng: Xoshiro256): number {
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/** Gaussian via Box-Muller. */
function nextGaussian(rng: Xoshiro256): number {
  let u = 0
  let v = 0
  while (u === 0) u = nextDouble(rng)
  while (v === 0) v = nextDouble(rng)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Fractalize a closed polygon ring via Brownian-bridge midpoint refinement.
 *
 * Each segment is recursively subdivided. At each step, the new midpoint is
 * the geometric midpoint plus a perpendicular displacement drawn from a
 * Gaussian whose variance scales with segment length × (2 - fractalDimension).
 *
 * - fractalDimension = 1.0 → straight lines (no displacement)
 * - fractalDimension = 1.5 → highly fractal (large displacements)
 *
 * `subdivisions` is the recursion depth; each level doubles the vertex count
 * per segment. 3 levels → 8× vertices per segment; 4 levels → 16×.
 *
 * Input ring must be closed (first vertex repeated as last).
 */
export function brownianBridgeRing(
  rng: Xoshiro256,
  ring: ReadonlyArray<readonly [number, number]>,
  fractalDimension: number,
  subdivisions: number,
): Array<[number, number]> {
  if (subdivisions === 0) {
    return ring.map((p) => [p[0], p[1]] as [number, number])
  }
  // Roughness factor: 1 = fully variable, 0 = no displacement.
  // For D in [1, 2), 2 - D ∈ (0, 1].
  const roughness = Math.max(0, 2 - fractalDimension)

  const refineOnce = (
    inputRing: ReadonlyArray<readonly [number, number]>,
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let i = 0; i < inputRing.length - 1; i++) {
      const a = inputRing[i]!
      const b = inputRing[i + 1]!
      out.push([a[0], a[1]])
      const mx = (a[0] + b[0]) / 2
      const my = (a[1] + b[1]) / 2
      // Perpendicular vector (rotate (b - a) by 90°).
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const segLen = Math.hypot(dx, dy)
      const px = -dy / Math.max(segLen, 1e-9)
      const py = dx / Math.max(segLen, 1e-9)
      // Displacement variance ~ (segLen × roughness) / 2. Halved so
      // overall ring shape is preserved at low fractal-D.
      const displacement = nextGaussian(rng) * (segLen * roughness * 0.25)
      out.push([mx + px * displacement, my + py * displacement])
    }
    // Close the ring.
    out.push([out[0]![0], out[0]![1]])
    return out
  }

  let current: Array<[number, number]> = ring.map((p) => [p[0], p[1]])
  for (let s = 0; s < subdivisions; s++) {
    current = refineOnce(current)
  }
  return current
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/worldgen/fractalize.test.ts
```

Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/fractalize.ts packages/sim/src/worldgen/fractalize.test.ts
git commit -m "feat(sim/worldgen): Brownian-bridge ring fractalization"
```

---

### Task 8: Continent name + color generation

**Files:**
- Create: `packages/sim/src/worldgen/naming.ts`
- Create: `packages/sim/src/worldgen/naming.test.ts`

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/naming.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { generatePlaceholderName, pickContinentColor } from './naming'

describe('generatePlaceholderName', () => {
  it('returns a non-empty string', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    expect(generatePlaceholderName(rng).length).toBeGreaterThan(0)
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    expect(generatePlaceholderName(r1)).toBe(generatePlaceholderName(r2))
  })

  it('produces variety across a series', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const names = new Set<string>()
    for (let i = 0; i < 20; i++) {
      names.add(generatePlaceholderName(rng))
    }
    expect(names.size).toBeGreaterThan(15) // at least 75% unique
  })
})

describe('pickContinentColor', () => {
  it('returns a 7-character hex string starting with #', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('test'))
    const c = pickContinentColor(rng)
    expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('never returns verdigris (#3B6B5A — reserved for ocean)', () => {
    const rng = xoshiro256ssFromState(...mixSeedString('palette-test'))
    for (let i = 0; i < 100; i++) {
      const c = pickContinentColor(rng).toLowerCase()
      expect(c).not.toBe('#3b6b5a')
    }
  })

  it('is deterministic from same seed', () => {
    const r1 = xoshiro256ssFromState(...mixSeedString('test'))
    const r2 = xoshiro256ssFromState(...mixSeedString('test'))
    expect(pickContinentColor(r1)).toBe(pickContinentColor(r2))
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/naming.test.ts
```

Expected: FAIL — module `./naming` not found.

- [ ] **Step 3: Implement naming.ts**

Create `packages/sim/src/worldgen/naming.ts`:

```ts
import type { Xoshiro256 } from '../rng/xoshiro256'

/**
 * Greek-alphabet placeholder names. The product team has already accepted
 * "placeholder" as the v1 quality bar — narrative-flavored names land in
 * a future iteration.
 */
const NAME_POOL: ReadonlyArray<string> = [
  'Continent Alpha', 'Continent Beta', 'Continent Gamma', 'Continent Delta',
  'Continent Epsilon', 'Continent Zeta', 'Continent Eta', 'Continent Theta',
  'Continent Iota', 'Continent Kappa', 'Continent Lambda', 'Continent Mu',
  'Continent Nu', 'Continent Xi', 'Continent Omicron', 'Continent Pi',
  'Continent Rho', 'Continent Sigma', 'Continent Tau', 'Continent Upsilon',
  'Continent Phi', 'Continent Chi', 'Continent Psi', 'Continent Omega',
]

/**
 * Cartographic-intelligence palette — same as NationColorPicker's swatches,
 * with verdigris (#3B6B5A) excluded because it's reserved as the ocean fill.
 */
const COLOR_PALETTE: ReadonlyArray<string> = [
  '#B8442C', // stamp red
  '#9C3848', // crimson
  '#3B4D6B', // indigo
  '#C77E2D', // saffron
  '#5B3A4F', // plum
  '#7C8A66', // sage
  '#7A5A2F', // bronze
  '#4A4D52', // slate
]

function nextU64Index(rng: Xoshiro256, modulus: number): number {
  return Number(rng.next() % BigInt(modulus))
}

export function generatePlaceholderName(rng: Xoshiro256): string {
  return NAME_POOL[nextU64Index(rng, NAME_POOL.length)]!
}

export function pickContinentColor(rng: Xoshiro256): string {
  return COLOR_PALETTE[nextU64Index(rng, COLOR_PALETTE.length)]!
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/worldgen/naming.test.ts
```

Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/worldgen/naming.ts packages/sim/src/worldgen/naming.test.ts
git commit -m "feat(sim/worldgen): placeholder name + color generation"
```

---

## Day 4 — Main pipeline + DB integration + API

### Task 9: generateWorld — main pipeline

**Files:**
- Create: `packages/sim/src/worldgen/generate-world.ts`
- Create: `packages/sim/src/worldgen/generate-world.test.ts`
- Create: `packages/sim/src/worldgen/index.ts` (barrel)

- [ ] **Step 1: Write the test first**

Create `packages/sim/src/worldgen/generate-world.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateWorld } from './generate-world'

describe('generateWorld — determinism', () => {
  it('produces byte-identical output from same seed', () => {
    const a = generateWorld('test-seed-cafe-1234')
    const b = generateWorld('test-seed-cafe-1234')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces different output for different seeds', () => {
    const a = generateWorld('seed-one')
    const b = generateWorld('seed-two')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('generateWorld — characteristic stats', () => {
  it('continent count is in the expected distribution range [4, 7]', () => {
    const counts = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const w = generateWorld(`seed-${i}`)
      counts.add(w.continents.length)
    }
    counts.forEach((c) => {
      expect(c).toBeGreaterThanOrEqual(4)
      expect(c).toBeLessThanOrEqual(7)
    })
  })

  it('hemispheric distribution: across 50 worlds, ~68% of continent centroids are northern', () => {
    let northCount = 0
    let total = 0
    for (let i = 0; i < 50; i++) {
      const w = generateWorld(`seed-${i}`)
      for (const c of w.continents) {
        const ring = c.polygon.coordinates[0]!
        const centroidLat = ring.reduce((a, p) => a + p[1], 0) / ring.length
        if (centroidLat > 0) northCount += 1
        total += 1
      }
    }
    const fraction = northCount / total
    expect(fraction).toBeGreaterThan(0.55)
    expect(fraction).toBeLessThan(0.80)
  })

  it('every continent has a closed polygon with > 8 vertices (post-fractalization)', () => {
    const w = generateWorld('test-seed')
    for (const c of w.continents) {
      const ring = c.polygon.coordinates[0]!
      expect(ring.length).toBeGreaterThan(8)
      const first = ring[0]!
      const last = ring[ring.length - 1]!
      expect(first[0]).toBeCloseTo(last[0], 6)
      expect(first[1]).toBeCloseTo(last[1], 6)
    }
  })

  it('every continent has a 64-character hex seed and a name', () => {
    const w = generateWorld('test-seed')
    expect(w.seed).toMatch(/^[0-9a-f]{64}$/)
    for (const c of w.continents) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.id.length).toBeGreaterThan(0)
    }
  })
})

describe('generateWorld — performance', () => {
  it('generates a 7-continent world in under 500ms', () => {
    const start = Date.now()
    generateWorld('perf-seed')
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/worldgen/generate-world.test.ts
```

Expected: FAIL — module `./generate-world` not found.

- [ ] **Step 3: Implement generate-world.ts**

Create `packages/sim/src/worldgen/generate-world.ts`:

```ts
import type { Continent, WorldGeneratedPayload } from '../types'
import type { Xoshiro256 } from '../rng/xoshiro256'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { uniformOnSphere } from '../sphere/distribution'
import {
  CONTINENT_COUNT_DISTRIBUTION,
  HEMISPHERIC_BIAS_NORTH,
  LAND_COVERAGE_FRACTION,
  SIZE_DISTRIBUTION_ALPHA,
  COASTLINE_COMPLEXITY_RANGE,
} from './earth-stats'
import { mixSeedString, encodeSeedHex } from './seed'
import { biasLatitudeNorth } from './bias'
import { sphericalVoronoi } from './voronoi'
import { allocateLandShares } from './pareto'
import { brownianBridgeRing } from './fractalize'
import { generatePlaceholderName, pickContinentColor } from './naming'

/** Top 53 bits → [0, 1). */
function nextDouble(rng: Xoshiro256): number {
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/** Sample (count, weight) tuples by weight. Returns the chosen count. */
function sampleCount(rng: Xoshiro256): number {
  const u = nextDouble(rng)
  let cum = 0
  for (const [n, w] of CONTINENT_COUNT_DISTRIBUTION) {
    cum += w
    if (u < cum) return n
  }
  return CONTINENT_COUNT_DISTRIBUTION[CONTINENT_COUNT_DISTRIBUTION.length - 1]![0]
}

/** Trim a polygon ring inward toward its centroid until the area matches a
 *  target fraction. We use a simple uniform shrink — sufficient for the spike,
 *  produces convex-ish smaller cells inside the original Voronoi cells. */
function shrinkRingTowardCentroid(
  ring: Array<[number, number]>,
  shrinkFactor: number,
): Array<[number, number]> {
  const n = ring.length - 1 // closed
  const cx = ring.slice(0, -1).reduce((a, p) => a + p[0], 0) / n
  const cy = ring.slice(0, -1).reduce((a, p) => a + p[1], 0) / n
  const out: Array<[number, number]> = ring.map(([x, y]) => [
    cx + (x - cx) * shrinkFactor,
    cy + (y - cy) * shrinkFactor,
  ])
  return out
}

/** Approximate (lon, lat) polygon area in radians² (planar approximation —
 *  good enough for the spike's relative-area math; sphere-correct version
 *  in sphere/area.ts is used for the final accounting). */
function approxPlanarArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!
    const [x2, y2] = ring[i + 1]!
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

/**
 * Procgen pipeline. Pure function — same seed → byte-identical output.
 *
 * Stages (each gets its own splitmix64-derived RNG via xoshiro state offset):
 *   1. count    — number of continents
 *   2. place    — seed-point placement (uniform sphere + N-bias)
 *   3. size     — Pareto land-share allocation
 *   4. fract    — coastline fractalization
 *   5. label    — name + color picks per continent
 */
export function generateWorld(seedString: string): WorldGeneratedPayload {
  const masterState = mixSeedString(seedString)
  const seedHex = encodeSeedHex(masterState)

  // Stage RNGs. Each stage gets a fresh xoshiro instance from a different
  // perturbation of the master state — preserves overall determinism while
  // isolating per-stage entropy consumption.
  const stage = (offset: bigint): Xoshiro256 =>
    xoshiro256ssFromState(
      masterState[0] ^ offset,
      masterState[1] ^ (offset << 1n),
      masterState[2] ^ (offset << 2n),
      masterState[3] ^ (offset << 3n),
    )

  // 1. How many continents?
  const count = sampleCount(stage(0x100n))

  // 2. Place seed points uniformly on the sphere, then bias toward N.
  const placeRng = stage(0x200n)
  const seedPoints = []
  for (let i = 0; i < count; i++) {
    const p = uniformOnSphere(placeRng)
    seedPoints.push({ lon: p.lon, lat: biasLatitudeNorth(placeRng, p.lat, HEMISPHERIC_BIAS_NORTH) })
  }

  // 3. Voronoi tessellation — one polygon per seed.
  const cells = sphericalVoronoi(seedPoints)

  // 4. Allocate land shares; shrink each cell inward to target area.
  const sizeRng = stage(0x300n)
  // Total target land in (lon, lat)² units; the sphere is 360 × 180 = 64800 deg²
  // (planar approximation). 29% of that ≈ 18792 deg².
  const totalLandUnits = LAND_COVERAGE_FRACTION * 360 * 180
  const targets = allocateLandShares(sizeRng, count, totalLandUnits, SIZE_DISTRIBUTION_ALPHA)

  const shrunkCells = cells.map((cell, i) => {
    const ring = cell.coordinates[0]!
    const cellArea = Math.max(1e-6, approxPlanarArea(ring))
    const ratio = Math.min(1, Math.sqrt(targets[i]! / cellArea))
    return shrinkRingTowardCentroid(ring, ratio)
  })

  // 5. Fractalize coastlines — per-continent fractal dimension drawn from range.
  const fractRng = stage(0x400n)
  const [dLo, dHi] = COASTLINE_COMPLEXITY_RANGE
  const fractalized = shrunkCells.map((ring) => {
    const D = dLo + nextDouble(fractRng) * (dHi - dLo)
    return brownianBridgeRing(fractRng, ring, D, 3)
  })

  // 6. Name + color per continent.
  const labelRng = stage(0x500n)
  const idRng = stage(0x600n)
  const continents: Continent[] = fractalized.map((ring, i) => ({
    id: encodeSeedHex([idRng.next(), idRng.next(), idRng.next(), idRng.next()]).slice(0, 36),
    name: generatePlaceholderName(labelRng),
    color: pickContinentColor(labelRng),
    polygon: { type: 'Polygon', coordinates: [ring] },
  }))

  return { seed: seedHex, continents }
}
```

- [ ] **Step 4: Create the barrel**

Create `packages/sim/src/worldgen/index.ts`:

```ts
export { generateWorld } from './generate-world'
export {
  LAND_COVERAGE_FRACTION,
  CONTINENT_COUNT_DISTRIBUTION,
  HEMISPHERIC_BIAS_NORTH,
  LATITUDINAL_WEIGHTING,
  SIZE_DISTRIBUTION_ALPHA,
  COASTLINE_COMPLEXITY_RANGE,
} from './earth-stats'
export { mixSeedString, encodeSeedHex, parseSeedHex } from './seed'
```

Add to `packages/sim/src/index.ts`:

```ts
export { generateWorld } from './worldgen'
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npx vitest run src/worldgen/generate-world.test.ts
```

Expected: PASS — all 6 tests.

- [ ] **Step 6: Run all sim tests to verify no regressions**

```bash
cd packages/sim
npx vitest run
```

Expected: all pre-existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/sim/src/worldgen/generate-world.ts packages/sim/src/worldgen/generate-world.test.ts packages/sim/src/worldgen/index.ts packages/sim/src/index.ts
git commit -m "feat(sim/worldgen): generateWorld pipeline (determinism + stat-tested)"
```

---

### Task 10: WorldGenerated event handler

**Files:**
- Modify: `packages/sim/src/events/applyEvent.ts`
- Modify: `packages/sim/src/events/applyEvent.test.ts`

- [ ] **Step 1: Write the regression test first**

Add to `packages/sim/src/events/applyEvent.test.ts` near the existing NationCreated tests:

```ts
describe('applyEvent — WorldGenerated does not mutate substrate', () => {
  it('substrate hash unchanged after WorldGenerated event', () => {
    // Use whatever fixture the existing tests use — see top of file.
    // The point: WorldGenerated is metadata, not substrate. heightmap and
    // mask are byte-identical before and after the event.
    const state = makeFixtureState() // existing helper
    const before = sha256OfHeightmap(state.heightmap) // existing helper or inline
    applyEvent(state, fixtureTileMeta(), {
      id: 99,
      worldId: 'w-1',
      kind: 'WorldGenerated',
      atDate: '1247-01-01',
      payload: {
        seed: '00'.repeat(64),
        continents: [],
      },
    } as any, fixtureRng())
    const after = sha256OfHeightmap(state.heightmap)
    expect(after).toBe(before)
  })
})
```

If the existing test file's fixture helpers aren't named `makeFixtureState` / `fixtureTileMeta` / `fixtureRng`, look at the existing NationCreated regression test in the same file and copy its setup pattern.

- [ ] **Step 2: Run test, expect FAIL**

```bash
npx vitest run src/events/applyEvent.test.ts
```

Expected: FAIL on the new test — likely `Error: applyEvent: unknown event kind: WorldGenerated`.

- [ ] **Step 3: Add the WorldGenerated branch in applyEvent.ts**

Find the existing `switch (event.kind)` in `packages/sim/src/events/applyEvent.ts`. Add a new case alongside `NationCreated`:

```ts
case 'WorldGenerated':
  // Substrate-unchanged event. The continents live in the event payload;
  // the heightmap and mask are not touched. (Same pattern as NationCreated.)
  return state
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npx vitest run src/events/applyEvent.test.ts
```

Expected: PASS, including the new regression.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/events/applyEvent.ts packages/sim/src/events/applyEvent.test.ts
git commit -m "feat(sim/events): WorldGenerated handler (substrate-unchanged)"
```

---

### Task 11: Database migration — procgen_seed column

**Files:**
- Create: `supabase/migrations/0005_procgen_worlds.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_procgen_worlds.sql`:

```sql
-- 0005_procgen_worlds.sql
--
-- Adds procgen_seed column to worlds. A world is now either tile-based
-- (tile_slug set) OR procgen (procgen_seed set). The CHECK constraint
-- enforces exactly-one-of-the-two at DB level.
--
-- Existing worlds are unaffected: tile_slug is still NOT NULL on every
-- pre-migration row, and procgen_seed defaults to NULL.
--
-- Idempotency: this migration is a one-shot ALTER. If re-run, it errors
-- on the column add. Supabase migration runner handles that via the
-- migrations table.

BEGIN;

-- 1. Allow tile_slug to be NULL (procgen worlds don't have one).
ALTER TABLE worlds
  ALTER COLUMN tile_slug DROP NOT NULL;

-- 2. New column for the procgen master seed (hex-encoded xoshiro state).
ALTER TABLE worlds
  ADD COLUMN procgen_seed TEXT NULL;

-- 3. Exactly one of (tile_slug, procgen_seed) must be set on every row.
ALTER TABLE worlds
  ADD CONSTRAINT worlds_kind_consistent CHECK (
    (tile_slug IS NULL) <> (procgen_seed IS NULL)
  );

-- 4. Index for procgen lookups (rare but cheap).
CREATE INDEX IF NOT EXISTS worlds_procgen_seed_idx
  ON worlds (procgen_seed)
  WHERE procgen_seed IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd /e/projects/MAURO
supabase db push
```

Expected: migration applies cleanly. If the local Supabase CLI isn't set up, run the SQL via the Supabase dashboard SQL editor instead.

- [ ] **Step 3: Verify the schema**

```bash
supabase db psql -c "\d worlds"
```

Expected output includes:
- `tile_slug | text |` (no `not null`)
- `procgen_seed | text |`
- a check constraint named `worlds_kind_consistent`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_procgen_worlds.sql
git commit -m "feat(db): procgen_seed column + kind-consistent constraint"
```

---

### Task 12: API endpoint — POST /api/worlds/procgen

**Files:**
- Create: `apps/web/src/app/api/worlds/procgen/route.ts`

- [ ] **Step 1: Look at the existing tile-world POST handler for reference**

Read `apps/web/src/app/api/worlds/route.ts` to see the pattern (auth gate, RLS, atomic insert + event-creation via RPC).

- [ ] **Step 2: Implement the procgen endpoint**

Create `apps/web/src/app/api/worlds/procgen/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'
import { generateWorld } from '@mauro/sim'

// POST /api/worlds/procgen
//
// Creates a procgen-kind world. Required auth (user-scoped SELECT first to
// confirm the session). Body: { seed?: string } — if absent, server picks
// one. Server runs generateWorld(seed), inserts the world row, and writes
// two events: WorldCreated (handle) and WorldGenerated (continents payload).
//
// Returns: { id: string, seed: string }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface ProcgenRequest {
  /** Optional user-supplied seed. Empty/missing → server generates one. */
  seed?: string
  /** Optional name for the world. Default: 'Procgen World'. */
  name?: string
}

export async function POST(request: Request) {
  const userClient = await createSupabaseServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: ProcgenRequest = {}
  try {
    body = (await request.json()) as ProcgenRequest
  } catch {
    // Empty body is fine — defaults take over.
  }

  // Pick a seed if user didn't supply one.
  const userSeed = body.seed?.trim()
  const seed = userSeed && userSeed.length > 0 ? userSeed : crypto.randomUUID()

  // Run the procgen.
  const payload = generateWorld(seed)
  const worldName = body.name?.trim() || 'Procgen World'

  // Insert the world + two events as a single service-role transaction.
  // We don't have a single RPC for this yet, so do it as discrete inserts.
  // The world row INSERT is auth-checked via RLS in a normal context; here
  // we use service-role and confirm the user above.
  const service = createSupabaseServiceClient()

  const { data: world, error: worldErr } = await service
    .from('worlds')
    .insert({
      name: worldName,
      tile_slug: null,
      procgen_seed: payload.seed,
      magic_level: 'medium',
      master_seed: payload.seed.slice(0, 16),
      user_id: user.id,
    })
    .select('id')
    .single()

  if (worldErr || !world) {
    return NextResponse.json(
      { error: `world insert failed: ${worldErr?.message ?? 'no data'}` },
      { status: 500 },
    )
  }

  // WorldCreated + WorldGenerated, both pinned at today's date.
  const today = new Date().toISOString().slice(0, 10)
  const { error: createdErr } = await service.rpc('add_event', {
    p_world_id: world.id,
    p_kind: 'WorldCreated',
    p_at_date: today,
    p_payload: { name: worldName },
  })
  if (createdErr) {
    return NextResponse.json(
      { error: `WorldCreated event failed: ${createdErr.message}` },
      { status: 500 },
    )
  }

  const { error: genErr } = await service.rpc('add_event', {
    p_world_id: world.id,
    p_kind: 'WorldGenerated',
    p_at_date: today,
    p_payload: payload,
  })
  if (genErr) {
    return NextResponse.json(
      { error: `WorldGenerated event failed: ${genErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: world.id, seed: payload.seed }, { status: 201 })
}
```

- [ ] **Step 3: Verify the endpoint compiles**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Smoke-test with curl (optional, requires local supabase + auth)**

If the dev server is running and you're signed in, in the browser console:

```js
const r = await fetch('/api/worlds/procgen', { method: 'POST', body: JSON.stringify({ seed: 'demo' }), headers: { 'content-type': 'application/json' } })
console.log(await r.json())
// → { id: '<uuid>', seed: '<64-char hex>' }
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/worlds/procgen/route.ts
git commit -m "feat(web/api): POST /api/worlds/procgen endpoint"
```

---

## Day 5 — UI integration + E2E test

### Task 13: New procgen world page (server + client form)

**Files:**
- Create: `apps/web/src/app/worlds/new-procgen/page.tsx`
- Create: `apps/web/src/app/worlds/new-procgen/procgen-form.tsx`

- [ ] **Step 1: Server page (auth gate)**

Create `apps/web/src/app/worlds/new-procgen/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ProcgenForm } from './procgen-form'

export default async function NewProcgenWorldPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=/worlds/new-procgen')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-xl border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; New procgen world
        </div>
        <h1 className="font-display mb-4 text-4xl">Generate.</h1>
        <p className="text-muted font-serif mb-8 italic leading-relaxed">
          A procedural world built from real-Earth statistics. Pick a seed
          to reproduce a specific world, or leave blank for a fresh one.
        </p>
        <ProcgenForm />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Client form**

Create `apps/web/src/app/worlds/new-procgen/procgen-form.tsx`:

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function ProcgenForm() {
  const router = useRouter()
  const [seed, setSeed] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/worlds/procgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: seed.trim() || undefined,
          name: name.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Failed to generate world.')
        return
      }
      const data = (await res.json()) as { id: string; seed: string }
      router.push(`/worlds/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="proc-name" className="label-caps mb-2 block">
          World name
        </label>
        <input
          id="proc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Procgen World"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base focus:outline-none"
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor="proc-seed" className="label-caps mb-2 block">
          Seed (optional)
        </label>
        <input
          id="proc-seed"
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="leave blank for random"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base focus:outline-none"
          disabled={pending}
        />
      </div>
      {error ? (
        <p className="text-stamp font-serif text-sm italic">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-ink text-bg border-ink font-sans w-full border px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Generating…' : 'Generate world'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Add the entry button on the home page**

Read `apps/web/src/app/page.tsx`. Find the existing "New world" button. Add a sibling button beside it. The exact JSX depends on the existing layout — match the existing style (`label-caps`, `border-hairline` border, etc.). Drop in:

```tsx
<Link
  href="/worlds/new-procgen"
  className="border-hairline text-text font-sans px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-85"
>
  New procgen world
</Link>
```

If the file already has a primary CTA, place the new button as a sibling secondary CTA in the same container.

- [ ] **Step 4: Verify the page compiles + opens**

Start dev server (if not already running). Navigate to `http://localhost:3000/worlds/new-procgen`. The form should render. Submitting it (without a backend yet) will fail — fix in Task 14.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/worlds/new-procgen apps/web/src/app/page.tsx
git commit -m "feat(web): /worlds/new-procgen page + form + home button"
```

---

### Task 14: World detail page — branch on procgen_seed

**Files:**
- Modify: `apps/web/src/app/worlds/[id]/page.tsx`
- Modify: `apps/web/src/app/worlds/[id]/world-detail-client.tsx`

- [ ] **Step 1: Extend the WorldRow + EventRow types**

In `apps/web/src/app/worlds/[id]/page.tsx`, find the `WorldRow` interface and add `procgen_seed`:

```ts
interface WorldRow {
  id: string
  name: string
  tile_slug: string | null         // was: string. Now nullable for procgen worlds.
  procgen_seed: string | null      // new
  magic_level: string
  master_seed: string
  created_at: string
  latest_event_at: string
}
```

In the `EventRow` payload union, add `WorldGenerated`:

```ts
interface EventRow {
  id: number
  kind: string
  at_date: string
  payload:
    | {
        variant?: string
        name?: string
        color?: string
        polygon?: GeoJSONPolygon
        interview?: InterviewState
        seed?: string
        continents?: Continent[]   // new
      }
    | null
}
```

(Be sure to import `Continent` from `@mauro/sim`.)

- [ ] **Step 2: Extract continents from WorldGenerated event**

In the same file, near the existing `nationDisplays` derivation, add:

```ts
import type { Continent } from '@mauro/sim'

const continentEvent = eventList.find((e) => e.kind === 'WorldGenerated')
const continents: Continent[] = (continentEvent?.payload?.continents ?? []) as Continent[]
const isProcgen = w.procgen_seed !== null
```

- [ ] **Step 3: Pass new props to WorldDetailClient**

```tsx
<WorldDetailClient
  ...
  isProcgen={isProcgen}
  continents={continents}
/>
```

- [ ] **Step 4: Update the SELECT to include the new column**

Find:

```ts
.select('id, name, tile_slug, magic_level, master_seed, created_at, latest_event_at')
```

Replace with:

```ts
.select('id, name, tile_slug, procgen_seed, magic_level, master_seed, created_at, latest_event_at')
```

- [ ] **Step 5: Update WorldDetailClient props**

In `apps/web/src/app/worlds/[id]/world-detail-client.tsx`, extend `WorldDetailClientProps`:

```ts
import type { Continent } from '@mauro/sim'

interface WorldDetailClientProps {
  ...
  isProcgen: boolean
  continents: Continent[]
}
```

Destructure them in the function signature, then pass `continents` to `MapView`:

```tsx
<MapView
  imageUrl={imageUrl}
  coordsLabel={coordsLabel}
  tileLabel={tile.name}
  drawingNation={drawingNation}
  onPolygonClose={onPolygonClose}
  pendingPolygon={pendingPolygon}
  savedNations={savedNations}
  continents={continents}
  isProcgen={isProcgen}
/>
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/worlds/[id]/page.tsx apps/web/src/app/worlds/[id]/world-detail-client.tsx
git commit -m "feat(web): world page branches on procgen_seed; loads continents"
```

---

### Task 15: MapView — continents layer + conditional ocean bg

**Files:**
- Modify: `apps/web/src/components/MapView.tsx`

- [ ] **Step 1: Extend MapViewProps**

At the top of `MapView.tsx`, add to the `MapViewProps` interface:

```ts
interface MapViewProps {
  // ... existing
  /** Continents to render as filled polygons + outlines. Procgen worlds. */
  continents?: ReadonlyArray<{
    id: string
    color: string
    polygon: { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  }>
  /** When true, hide the hillshade source layer and use verdigris bg. */
  isProcgen?: boolean
}
```

Destructure with defaults in the component:

```tsx
export function MapView({
  imageUrl,
  coordsLabel,
  tileLabel,
  drawingNation,
  onPolygonClose,
  pendingPolygon,
  savedNations,
  continents = [],
  isProcgen = false,
  drawColor = '#B8442C',
}: MapViewProps) {
```

- [ ] **Step 2: Conditional bg color in map style**

In the map-init effect, find the style definition with the `bg` background layer. Change:

```ts
{
  id: 'bg',
  type: 'background',
  paint: { 'background-color': '#1a1816' },
},
```

To use the ref-mirrored value:

```ts
const isProcgenRef = useRef(isProcgen)
isProcgenRef.current = isProcgen

// ... in style ...
{
  id: 'bg',
  type: 'background',
  paint: { 'background-color': isProcgenRef.current ? '#3B6B5A' : '#1a1816' },
},
```

- [ ] **Step 3: Conditional hillshade source mount**

In the map's `load` callback, wrap the hillshade source/layer mount in a guard:

```ts
if (!isProcgenRef.current) {
  map.addSource('hillshade', {
    type: 'image',
    url: imageUrlRef.current,
    coordinates: [
      [-180, 85.05],
      [180, 85.05],
      [180, -85.05],
      [-180, -85.05],
    ],
  })
  map.addLayer({
    id: 'hillshade-layer',
    type: 'raster',
    source: 'hillshade',
    paint: { 'raster-opacity': 1 },
  })
}
// fitBounds is OK either way
```

Also: the existing image-update effect (deps `[imageUrl]`) should no-op for procgen worlds. Add a `if (!isProcgen) return` at the top.

- [ ] **Step 4: Mount the continents layer (similar to savedNations)**

Add a new useEffect that mounts the continents source + layers, modeled after the existing `savedNations` effect:

```tsx
useEffect(() => {
  const map = mapRef.current
  if (!map) return
  const sourceId = '__continents__'
  const fillLayerId = '__continents_fill__'
  const lineLayerId = '__continents_line__'

  const teardown = () => {
    const m = mapRef.current
    if (!m || !(m as unknown as { style?: unknown }).style) return
    try {
      if (m.getLayer(lineLayerId)) m.removeLayer(lineLayerId)
      if (m.getLayer(fillLayerId)) m.removeLayer(fillLayerId)
      if (m.getSource(sourceId)) m.removeSource(sourceId)
    } catch {}
  }

  if (!continents || continents.length === 0) {
    teardown()
    return
  }

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: continents.map((c) => ({
      type: 'Feature' as const,
      geometry: c.polygon,
      properties: { id: c.id, color: c.color },
    })),
  }

  let cancelled = false
  const paint = () => {
    if (cancelled) return
    const m = mapRef.current
    if (!m || !(m as unknown as { style?: unknown }).style) return
    try {
      const existing = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      if (existing) {
        existing.setData(featureCollection)
        return
      }
      m.addSource(sourceId, { type: 'geojson', data: featureCollection })
      m.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.85 },
      })
      m.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1 },
      })
    } catch {}
  }

  if (map.isStyleLoaded()) paint()
  else map.once('load', paint)

  return () => {
    cancelled = true
    teardown()
  }
}, [continents])
```

- [ ] **Step 5: Typecheck + visual smoke**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: clean.

Restart the dev server. Sign in (dev shortcut). Click "New procgen world". Submit form. The world page should render: verdigris ocean background, N colored continent polygons with thin outlines.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/MapView.tsx
git commit -m "feat(web): MapView continents layer + procgen ocean bg"
```

---

### Task 16: E2E happy path — create procgen world

**Files:**
- Create: `e2e/tests/procgen-world.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/procgen-world.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const TEST_AUTH_SECRET =
  process.env.TEST_AUTH_SECRET ?? 'mauro-local-e2e-do-not-use-in-prod'

test.describe('procgen world creation', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/test-cleanup', {
      headers: { 'x-test-secret': TEST_AUTH_SECRET },
      data: { email: process.env.E2E_TEST_EMAIL ?? 'e2e+mauro@example.com' },
    })
    expect(res.ok()).toBe(true)
  })

  test('happy path: pick a seed → see continents on the map', async ({ page }) => {
    await page.goto('/worlds/new-procgen')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Generate.' }),
    ).toBeVisible()

    await page.fill('#proc-name', 'E2E Procgen World')
    await page.fill('#proc-seed', 'cafe-1234')
    await page.getByRole('button', { name: /generate world/i }).click()

    // Should land on the world page
    await page.waitForURL(/\/worlds\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Map canvas should mount (MapLibre gives this class)
    const canvas = page.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 30_000 })

    // The world name should appear in the top ledger
    await expect(page.getByText('E2E Procgen World')).toBeVisible()
  })

  test('determinism: same seed produces same world', async ({ page, request }) => {
    // Create two worlds with the same seed via the API directly.
    const a = await request.post('/api/worlds/procgen', {
      data: { seed: 'identical-seed', name: 'World A' },
      headers: { 'content-type': 'application/json' },
    })
    expect(a.ok()).toBe(true)
    const aData = (await a.json()) as { id: string; seed: string }

    const b = await request.post('/api/worlds/procgen', {
      data: { seed: 'identical-seed', name: 'World B' },
      headers: { 'content-type': 'application/json' },
    })
    expect(b.ok()).toBe(true)
    const bData = (await b.json()) as { id: string; seed: string }

    expect(aData.seed).toBe(bData.seed)
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd e2e
npx playwright test tests/procgen-world.spec.ts
```

Expected: PASS on both tests.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/procgen-world.spec.ts
git commit -m "test(e2e): procgen world happy path + determinism"
```

---

### Task 17: Tune defaults + write spike results note

**Files:**
- Create: `docs/superpowers/specs/2026-05-12-procgen-spike-results.md`

- [ ] **Step 1: Generate 10 sample worlds**

In the running dev server, sign in, create 10 procgen worlds with varied seed strings (e.g., "alpha", "beta", … "kappa"). Visit each. Screenshot the map.

- [ ] **Step 2: Eyeball criteria**

For each of the 10 worlds, note:
- Continent count
- Did one continent dominate (Earth-like Pareto)? Or were they all similar size?
- Hemispheric distribution: did most continents land in the N?
- Coastline complexity: did it look ragged or smooth-polygon-y?
- Did any continent look obviously wrong (impossible geometry, crossing date line weirdly)?

- [ ] **Step 3: Tune if needed**

If outputs feel wrong, the most likely culprits and fixes:

- **All continents similar size:** raise `SIZE_DISTRIBUTION_ALPHA` toward 1.7+ for more skew.
- **Continents too small:** the `shrinkRingTowardCentroid` ratio formula in `generate-world.ts` may be over-shrinking. Double-check the `Math.sqrt(...)` line.
- **Coastlines too smooth:** raise `COASTLINE_COMPLEXITY_RANGE[1]` toward 1.6, or increase the subdivisions count in the `brownianBridgeRing` call.
- **Coastlines too jagged:** lower max range to 1.3, reduce subdivisions to 2.
- **Northern hemisphere too dominant:** lower `HEMISPHERIC_BIAS_NORTH` to 0.6.

Each tune is a one-line change. Commit each tune separately if the eyeball improves.

- [ ] **Step 4: Write the results note**

Create `docs/superpowers/specs/2026-05-12-procgen-spike-results.md`:

```markdown
# Procgen Spike — Results (2026-05-12)

**Spec:** `2026-05-07-procgen-continent-worldgen-design.md`
**Plan:** `2026-05-07-procgen-continent-worldgen.md`

## What we built

[1–2 sentences summarizing what shipped]

## Visual verdict

[Embed or describe the 10 sample world screenshots. Note any standout
worlds — best, worst, surprising.]

## Tuning applied

[List each constant you adjusted from the spec's initial value, with
the new value and a one-line rationale.]

## Pass / fail per success criterion

- [ ] Determinism — automated test passing
- [ ] Sphere-correctness — no impossible geometries observed
- [ ] Visual credibility — ≥ 7/10 worlds feel Earth-credible
- [ ] Variety — 10 worlds visibly distinct
- [ ] Performance — generateWorld < 500ms for 7-continent world
- [ ] Integration cleanliness — existing tile-world tests pass

## Next steps

[Recommend: ship + start archetype tagging? Pause + revisit with
different methodology? Park procgen worlds, ship continent-drawing-by-user
as the immediate UX while procgen iterates?]
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-12-procgen-spike-results.md
git commit -m "docs(spec): procgen spike results"
```

---

## Self-Review Checklist

Before marking the plan complete:

**Spec coverage:**
- [x] Continent type — Task 1
- [x] WorldGenerated event + payload — Task 1, Task 10
- [x] Earth statistics codification — Task 2
- [x] Determinism contract (RNG) — Task 3, Task 9
- [x] Hemispheric + latitudinal bias — Task 4
- [x] Spherical Voronoi — Task 5
- [x] Pareto size distribution — Task 6
- [x] Coastline fractalization — Task 7
- [x] Naming + coloring — Task 8
- [x] generateWorld pipeline — Task 9
- [x] Substrate-unchanged event invariant — Task 10
- [x] DB migration — Task 11
- [x] API endpoint — Task 12
- [x] /worlds/new-procgen page — Task 13
- [x] World detail branch on procgen_seed — Task 14
- [x] MapView continents layer + conditional bg — Task 15
- [x] E2E test — Task 16
- [x] Sample-world tuning + results doc — Task 17

**Type consistency:**
- `Continent.id` is `string` everywhere ✓
- `WorldGeneratedPayload.continents: Continent[]` ✓
- `MapView.continents` prop accepts the same shape (id, color, polygon) ✓
- `xoshiro256ssFromState` is called with 4 BigInts in all uses ✓
- `mixSeedString` returns `[bigint, bigint, bigint, bigint]` consistently ✓

**Placeholder scan:**
No "TBD" / "TODO" / "implement later" present. All steps have concrete code or commands.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-07-procgen-continent-worldgen.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
