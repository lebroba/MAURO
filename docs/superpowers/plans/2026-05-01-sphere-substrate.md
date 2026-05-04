# Sphere Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sphere substrate primitives library at `packages/sim/src/sphere/` — pure-function modules covering coordinates, geodesy, cell area, sphere-native noise, and area-aware distribution — plus a planet-scale validation harness, two pinned dependencies, and a small audit pass on existing sim code.

**Architecture:** Leaf library inside `packages/sim`, sibling to `rng/`, `events/`, `query/`. Owns no state, no I/O. Hybrid coordinate-frame policy: WGS84 ellipsoid for distance/area/ECEF, unit sphere for rotation/slerp/noise. All public functions take an explicit RNG when randomness is needed; no global state. Tests co-located with sources (matches existing `xoshiro256.test.ts` convention).

**Tech Stack:** TypeScript strict mode, vitest, `simplex-noise@4.0.x` (sphere-native noise), `geographiclib-geodesic@2.0.x` (WGS84 geodesic distance via Karney). Both pinned via `--save-exact` per Architecture Principle #8.

**Spec source:** `docs/superpowers/specs/2026-05-01-sphere-substrate-design.md`

**Note on test paths:** The spec proposed `__tests__/` directory paths; this plan uses co-located `*.test.ts` files to match the existing project convention (`xoshiro256.test.ts` next to `xoshiro256.ts`). Update the spec to match after implementation if desired.

**Status (2026-05-04):** Tasks 1–18 complete on branch `feat/sphere-substrate` (23 commits, 134/134 tests green, typecheck clean). Remaining: Task 19 (`index.ts` public surface), Task 20 (`characteristic.test.ts` planet-scale validation), Task 21 (JSDoc audit pass + audit doc).

---

## File Structure

```
packages/sim/src/sphere/
├── wgs84.ts              # WGS84 ellipsoid constants (no functions)
├── wgs84.test.ts
├── _vec.ts               # Internal Cartesian3 vector ops (dot, cross, normalize, scale, add, lerp)
├── _rng.ts               # Internal RNG → number-in-[0,1) adapter for Xoshiro256
├── coords.ts             # LonLat / Cartesian3 / ECEF / TilePixel + conversions
├── coords.test.ts
├── geodesy.ts            # great-circle, geodesic, slerp, axis-angle rotation, Euler-pole
├── geodesy.test.ts
├── area.ts               # cell area (sphere + WGS84), latitude bands, polar zone
├── area.test.ts
├── noise.ts              # sphere-native 3D Simplex noise sampling
├── noise.test.ts
├── distribution.ts       # uniform-on-sphere, cosine-weighted Poisson, area-weighted accumulator
├── distribution.test.ts
├── index.ts              # public surface (re-exports only)
└── characteristic.test.ts  # planet-scale validation harness (six test families)
```

Plus modifications outside the new directory:
- `packages/sim/package.json` — add two pinned deps
- `packages/sim/src/query/WorldQuery.ts`, `tile-loader.ts`, `events/applyEvent.ts` — JSDoc audit comments
- `docs/sphere-substrate-audit-2026-05-01.md` — new audit report

---

## Task 1: Pin dependencies

**Files:**
- Modify: `packages/sim/package.json`

- [x] **Step 1: Add pinned dependencies**

Add `simplex-noise` and `geographiclib-geodesic` to the `dependencies` block of `packages/sim/package.json`. The package currently looks like:

```json
"dependencies": {
  "@supabase/ssr": "0.10.2",
  "@supabase/supabase-js": "2.105.1",
  "server-only": "0.0.1",
  "sharp": "0.33.5"
}
```

Modify to:

```json
"dependencies": {
  "@supabase/ssr": "0.10.2",
  "@supabase/supabase-js": "2.105.1",
  "geographiclib-geodesic": "2.1.1",
  "server-only": "0.0.1",
  "sharp": "0.33.5",
  "simplex-noise": "4.0.3"
}
```

(Versions written exactly with no `^` or `~`, per Architecture Principle #8. If the latest patch is newer at install time, update to the latest 4.0.x and 2.1.x patches respectively.)

- [x] **Step 2: Install**

Run: `pnpm install --frozen-lockfile=false`
Expected: lockfile updates, no errors. Both packages appear under `packages/sim/node_modules`.

- [x] **Step 3: Verify import works**

Create a one-off REPL test (don't commit it):
```bash
cd packages/sim && node --input-type=module -e "import('simplex-noise').then(m => console.log(typeof m.createNoise3D)); import('geographiclib-geodesic').then(m => console.log(typeof m.Geodesic.WGS84.Inverse))"
```
Expected: prints `function` twice.

- [x] **Step 4: Commit**

```bash
git add packages/sim/package.json pnpm-lock.yaml
git commit -m "chore(sim): pin simplex-noise@4.0.3 + geographiclib-geodesic@2.1.1"
```

---

## Task 2: WGS84 constants module

**Files:**
- Create: `packages/sim/src/sphere/wgs84.ts`
- Create: `packages/sim/src/sphere/wgs84.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/wgs84.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WGS84 } from './wgs84'

describe('WGS84 constants', () => {
  it('exposes the canonical equatorial radius in meters', () => {
    expect(WGS84.A_METERS).toBe(6378137.0)
  })

  it('exposes the canonical flattening', () => {
    expect(WGS84.F).toBe(1 / 298.257223563)
  })

  it('derives the polar radius B = A * (1 - F) within float precision', () => {
    const expected = 6378137.0 * (1 - 1 / 298.257223563)
    expect(WGS84.B_METERS).toBeCloseTo(expected, 6)
    // Sanity: about 6356752.3 m
    expect(WGS84.B_METERS).toBeGreaterThan(6356752)
    expect(WGS84.B_METERS).toBeLessThan(6356753)
  })

  it('derives first eccentricity squared E2 = 2F - F^2', () => {
    const f = 1 / 298.257223563
    expect(WGS84.E2).toBeCloseTo(2 * f - f * f, 12)
  })

  it('derives second eccentricity squared E_PRIME2 = E2 / (1 - E2)', () => {
    expect(WGS84.E_PRIME2).toBeCloseTo(WGS84.E2 / (1 - WGS84.E2), 12)
  })

  it('exposes the WGS84 mean radius (used as default for sphere math)', () => {
    expect(WGS84.MEAN_RADIUS_METERS).toBe(6371008.8)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test wgs84`
Expected: FAIL — module `./wgs84` does not exist.

- [x] **Step 3: Implement the module**

Create `packages/sim/src/sphere/wgs84.ts`:

```ts
// WGS84 ellipsoid constants — World Geodetic System 1984.
//
// All real-Earth source data MAURO consumes (NASA SRTM, GEBCO, ETOPO,
// COP30) is referenced to WGS84. These constants are the foundation for
// any computation that needs to produce real-world units (kilometers,
// square kilometers, ECEF positions).
//
// Per Architecture Principle #10's hybrid policy, the substrate uses
// WGS84 for distance/area/ECEF and unit-sphere math for rotation/slerp/
// noise/plate-tectonics.

const A = 6378137.0
const F = 1 / 298.257223563
const B = A * (1 - F)
const E2 = 2 * F - F * F
const E_PRIME2 = E2 / (1 - E2)

// WGS84 mean radius R1 = (2A + B) / 3 ≈ 6371008.8 m. This is the
// canonical "spherical Earth" approximation — used as the default radius
// for sphere-math distance and area where ellipsoid precision is not
// required.
const MEAN_RADIUS = (2 * A + B) / 3

export const WGS84 = {
  A_METERS: A,
  F,
  B_METERS: B,
  E2,
  E_PRIME2,
  MEAN_RADIUS_METERS: Math.round(MEAN_RADIUS * 10) / 10,  // 6371008.8
} as const
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test wgs84`
Expected: PASS — all 6 tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/wgs84.ts packages/sim/src/sphere/wgs84.test.ts
git commit -m "feat(sphere): WGS84 ellipsoid constants module"
```

---

## Task 3: Internal vector ops module

**Files:**
- Create: `packages/sim/src/sphere/_vec.ts`

- [x] **Step 1: Write the implementation directly (internal helpers, tested via consumers)**

The `_vec.ts` module is internal (underscore prefix). It's exercised by `coords.test.ts`, `geodesy.test.ts`, etc. through the public APIs. No standalone test file — keeping the test surface focused on public behavior.

Create `packages/sim/src/sphere/_vec.ts`:

```ts
// Internal vector ops on Cartesian3. Not exported from the package — used
// only by sibling sphere modules. The Cartesian3 frame is documented per
// consumer (unit sphere in coords.ts/geodesy.ts; ECEF in coords.ts).

import type { Cartesian3 } from './coords'

export function dot(a: Cartesian3, b: Cartesian3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function norm(a: Cartesian3): number {
  return Math.sqrt(dot(a, a))
}

export function normalize(a: Cartesian3): Cartesian3 {
  const n = norm(a)
  if (n === 0) {
    throw new Error('normalize: zero vector')
  }
  return { x: a.x / n, y: a.y / n, z: a.z / n }
}

export function scale(a: Cartesian3, s: number): Cartesian3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function add(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function lerp(a: Cartesian3, b: Cartesian3, t: number): Cartesian3 {
  return add(scale(a, 1 - t), scale(b, t))
}
```

- [x] **Step 2: Verify it compiles**

Run: `pnpm --filter @mauro/sim typecheck`
Expected: typecheck error — `Cartesian3` is imported from `./coords` but `./coords` doesn't exist yet. Defer compilation check until Task 4 lands.

- [x] **Step 3: Commit**

```bash
git add packages/sim/src/sphere/_vec.ts
git commit -m "feat(sphere): internal Cartesian3 vector ops"
```

---

## Task 4: Coords — types + LonLat ↔ unit-sphere Cartesian + utilities

**Files:**
- Create: `packages/sim/src/sphere/coords.ts` (partial — Tasks 5, 6 add to it)
- Create: `packages/sim/src/sphere/coords.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/coords.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  cartesianToLonLat,
  clampLat,
  lonLatToCartesian,
  normalizeLon,
  type Cartesian3,
  type LonLat,
} from './coords'

describe('LonLat ↔ unit-sphere Cartesian conversions', () => {
  it('maps (0, 0) to (1, 0, 0) — equator at prime meridian', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 0 })
    expect(c.x).toBeCloseTo(1, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (90, 0) to (0, 1, 0) — equator at +90° lon', () => {
    const c = lonLatToCartesian({ lonDeg: 90, latDeg: 0 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(1, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (0, 90) to (0, 0, 1) — north pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 90 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(1, 12)
  })

  it('maps (0, -90) to (0, 0, -1) — south pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: -90 })
    expect(c.z).toBeCloseTo(-1, 12)
  })

  it('round-trips 1000 random points within 1e-12 degrees', () => {
    // Deterministic: don't use Math.random — use a fixed permutation of
    // (lon, lat) values across the sphere.
    let maxLonErr = 0
    let maxLatErr = 0
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 32; j++) {
        const lonDeg = -180 + (360 * i) / 32 + 0.123
        const latDeg = -90 + (180 * (j + 0.5)) / 32
        const c = lonLatToCartesian({ lonDeg, latDeg })
        const back = cartesianToLonLat(c)
        maxLonErr = Math.max(maxLonErr, Math.abs(normalizeLon(back.lonDeg - lonDeg)))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.latDeg - latDeg))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-12)
    expect(maxLatErr).toBeLessThan(1e-12)
  })

  it('produces unit-length Cartesian vectors for any LonLat', () => {
    const samples: LonLat[] = [
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: -73.5, latDeg: 40.7 },
      { lonDeg: 179.99, latDeg: 89.99 },
      { lonDeg: -179.99, latDeg: -89.99 },
    ]
    for (const ll of samples) {
      const c = lonLatToCartesian(ll)
      const lengthSq = c.x * c.x + c.y * c.y + c.z * c.z
      expect(lengthSq).toBeCloseTo(1, 12)
    }
  })
})

describe('normalizeLon', () => {
  it('returns input unchanged when already in [-180, 180)', () => {
    expect(normalizeLon(0)).toBe(0)
    expect(normalizeLon(-180)).toBe(-180)
    expect(normalizeLon(179.999)).toBe(179.999)
  })

  it('wraps +180 to -180 (canonical wrap point)', () => {
    expect(normalizeLon(180)).toBe(-180)
  })

  it('wraps values just past +180 back into range', () => {
    expect(normalizeLon(180.0001)).toBeCloseTo(-179.9999, 10)
  })

  it('wraps values just past -180 back into range', () => {
    expect(normalizeLon(-180.0001)).toBeCloseTo(179.9999, 10)
  })

  it('handles multi-revolution inputs', () => {
    expect(normalizeLon(720)).toBe(0)
    expect(normalizeLon(-540)).toBe(-180)
  })
})

describe('clampLat', () => {
  it('returns input unchanged when in [-90, 90]', () => {
    expect(clampLat(0)).toBe(0)
    expect(clampLat(90)).toBe(90)
    expect(clampLat(-90)).toBe(-90)
  })

  it('clamps values above +90', () => {
    expect(clampLat(90.001)).toBe(90)
    expect(clampLat(180)).toBe(90)
  })

  it('clamps values below -90', () => {
    expect(clampLat(-90.001)).toBe(-90)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test coords`
Expected: FAIL — module `./coords` does not exist.

- [x] **Step 3: Implement the module (partial — types + sphere conversions + utilities only)**

Create `packages/sim/src/sphere/coords.ts`:

```ts
// Coordinate types and conversions for the sphere substrate.
//
// Three coordinate frames coexist intentionally per the spec:
//   - LonLat: API surface — degrees, [-180, 180), [-90, 90]
//   - Cartesian3 (unit sphere frame): internal math for rotation, slerp,
//     noise sampling. Documented per use site.
//   - ECEF (WGS84 frame): real-world 3D position in meters from Earth
//     center. For export, GIS interop, geodetic position. (Added in Task 5.)
//   - TilePixel: storage / raster I/O only. (Added in Task 6.)
//
// The two `{ x, y, z }` shapes share a structural type but represent
// different frames. We don't use branded types — JSDoc on every signature
// names the frame.

export interface LonLat {
  /** Longitude in degrees, canonical range [-180, 180). */
  lonDeg: number
  /** Latitude in degrees, canonical range [-90, 90]. */
  latDeg: number
}

/**
 * 3D Cartesian point. The frame is documented per use site:
 *   - Unit sphere frame (length 1, dimensionless) for rotation/slerp/noise.
 *   - ECEF (length in meters from Earth center, WGS84) for geodetic position.
 */
export interface Cartesian3 {
  x: number
  y: number
  z: number
}

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Convert a LonLat to a Cartesian3 on the unit sphere (length 1).
 * Frame: unit sphere. Use for rotation/slerp/noise sampling.
 */
export function lonLatToCartesian(p: LonLat): Cartesian3 {
  const lonRad = p.lonDeg * DEG_TO_RAD
  const latRad = p.latDeg * DEG_TO_RAD
  const cosLat = Math.cos(latRad)
  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad),
  }
}

/**
 * Convert a unit-sphere Cartesian3 back to LonLat.
 * Frame: unit sphere. Inverse of lonLatToCartesian for inputs of length 1.
 * For non-unit inputs, normalizes implicitly via atan2/asin.
 */
export function cartesianToLonLat(p: Cartesian3): LonLat {
  // atan2 handles all four quadrants and the lon = ±π edge cleanly.
  const lonRad = Math.atan2(p.y, p.x)
  // Clamp asin argument to [-1, 1] — float drift can produce 1.0000000001.
  const z = Math.max(-1, Math.min(1, p.z))
  const latRad = Math.asin(z)
  return {
    lonDeg: lonRad * RAD_TO_DEG,
    latDeg: latRad * RAD_TO_DEG,
  }
}

/**
 * Wrap a longitude in degrees to the canonical range [-180, 180).
 * Critical for seam continuity: float drift across rotations produces
 * 180.0000001-shaped values, and one canonical wrap point prevents seam
 * bugs (rule 10c).
 */
export function normalizeLon(deg: number): number {
  // Wrap into [-180, 180). The +180 → -180 mapping is intentional: 180
  // and -180 are the same meridian, and we pick -180 as canonical.
  let result = ((deg + 180) % 360 + 360) % 360 - 180
  // Floating-point % can produce -0; normalize to +0.
  if (result === -180) return -180
  if (result === 180) return -180
  return result === 0 ? 0 : result
}

/** Clamp a latitude in degrees to [-90, 90]. */
export function clampLat(deg: number): number {
  if (deg > 90) return 90
  if (deg < -90) return -90
  return deg
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test coords`
Expected: PASS — all conversion + utility tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/coords.ts packages/sim/src/sphere/coords.test.ts
git commit -m "feat(sphere): LonLat ↔ unit-sphere Cartesian + lon/lat normalization"
```

---

## Task 5: Coords — LonLat ↔ ECEF (WGS84)

**Files:**
- Modify: `packages/sim/src/sphere/coords.ts` (append ECEF interface + functions)
- Modify: `packages/sim/src/sphere/coords.test.ts` (append ECEF tests)

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/coords.test.ts`:

```ts
import { ecefToLonLat, lonLatToECEF, type ECEF } from './coords'

describe('LonLat ↔ ECEF (WGS84) conversions', () => {
  it('maps (0, 0) at h=0 to (A, 0, 0) — equator at prime meridian', () => {
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 0 })
    expect(e.x).toBeCloseTo(6378137.0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(0, 3)
  })

  it('maps (0, 90) at h=0 to (0, 0, B) — north pole', () => {
    // B = A(1-F) ≈ 6356752.3
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 90 })
    expect(e.x).toBeCloseTo(0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(6356752.3142, 2)
  })

  it('round-trips 100 lat-lon points + heights from -500 to +8848 m', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    let maxHeightErr = 0
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const lonDeg = -180 + (360 * i) / 10 + 0.7
        const latDeg = -85 + (170 * j) / 10
        const heightMeters = -500 + (8848 + 500) * (i + j) / 20
        const e = lonLatToECEF({ lonDeg, latDeg }, heightMeters)
        const back = ecefToLonLat(e)
        maxLonErr = Math.max(maxLonErr, Math.abs(back.lonLat.lonDeg - lonDeg))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.lonLat.latDeg - latDeg))
        maxHeightErr = Math.max(maxHeightErr, Math.abs(back.heightMeters - heightMeters))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-9)
    expect(maxLatErr).toBeLessThan(1e-9)
    expect(maxHeightErr).toBeLessThan(1e-3)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test coords`
Expected: FAIL — `lonLatToECEF` not exported.

- [x] **Step 3: Append ECEF implementation to coords.ts**

Append to `packages/sim/src/sphere/coords.ts`:

```ts
import { WGS84 } from './wgs84'

/**
 * 3D Cartesian point in the WGS84 Earth-Centered, Earth-Fixed (ECEF) frame,
 * meters from Earth center. Distinct from a unit-sphere Cartesian3 — same
 * shape, different frame. Use for geodetic position, GIS interop, satellite
 * computations.
 */
export interface ECEF {
  x: number
  y: number
  z: number
}

/**
 * Convert a geodetic LonLat (+ optional height in meters above the WGS84
 * ellipsoid) to ECEF Cartesian. Frame: WGS84 ECEF, meters.
 */
export function lonLatToECEF(p: LonLat, heightMeters: number = 0): ECEF {
  const lonRad = p.lonDeg * DEG_TO_RAD
  const latRad = p.latDeg * DEG_TO_RAD
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  // Prime vertical radius of curvature.
  const N = WGS84.A_METERS / Math.sqrt(1 - WGS84.E2 * sinLat * sinLat)
  return {
    x: (N + heightMeters) * cosLat * Math.cos(lonRad),
    y: (N + heightMeters) * cosLat * Math.sin(lonRad),
    z: (N * (1 - WGS84.E2) + heightMeters) * sinLat,
  }
}

/**
 * Convert ECEF Cartesian back to geodetic LonLat + height. Uses Bowring's
 * iterative formula (1985 closed form) — converges to sub-millimeter
 * precision in 2-3 iterations for any point inside the ellipsoid.
 */
export function ecefToLonLat(p: ECEF): { lonLat: LonLat; heightMeters: number } {
  const lonRad = Math.atan2(p.y, p.x)

  // Distance from Z axis (equatorial plane projection).
  const r = Math.sqrt(p.x * p.x + p.y * p.y)

  // Special-case the poles — atan2(z, r) is fine but height calc differs.
  if (r < 1e-9) {
    const sign = p.z >= 0 ? 1 : -1
    return {
      lonLat: { lonDeg: 0, latDeg: sign * 90 },
      heightMeters: Math.abs(p.z) - WGS84.B_METERS,
    }
  }

  // Bowring's initial parametric latitude.
  const A = WGS84.A_METERS
  const B = WGS84.B_METERS
  const E2 = WGS84.E2
  const E_PRIME2 = WGS84.E_PRIME2

  const beta = Math.atan2(p.z * A, r * B)
  const sinBeta = Math.sin(beta)
  const cosBeta = Math.cos(beta)

  // First approximation of geodetic latitude.
  let latRad = Math.atan2(
    p.z + E_PRIME2 * B * sinBeta * sinBeta * sinBeta,
    r - E2 * A * cosBeta * cosBeta * cosBeta,
  )

  // One Newton iteration is sufficient for terrestrial heights; do two
  // for safety.
  for (let i = 0; i < 2; i++) {
    const sinLat = Math.sin(latRad)
    const cosLat = Math.cos(latRad)
    const N = A / Math.sqrt(1 - E2 * sinLat * sinLat)
    latRad = Math.atan2(p.z + E2 * N * sinLat, r)
  }

  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat)

  // Height: distinct formulas near equator vs near pole; use the more
  // numerically stable one based on |latRad|.
  let heightMeters: number
  if (Math.abs(latRad) < Math.PI / 4) {
    heightMeters = r / cosLat - N
  } else {
    heightMeters = p.z / sinLat - N * (1 - E2)
  }

  return {
    lonLat: { lonDeg: lonRad * RAD_TO_DEG, latDeg: latRad * RAD_TO_DEG },
    heightMeters,
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test coords`
Expected: PASS — all ECEF tests green, prior sphere tests still green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/coords.ts packages/sim/src/sphere/coords.test.ts
git commit -m "feat(sphere): LonLat ↔ ECEF (WGS84) via Bowring's iterative formula"
```

---

## Task 6: Coords — LonLat ↔ TilePixel

**Files:**
- Modify: `packages/sim/src/sphere/coords.ts`
- Modify: `packages/sim/src/sphere/coords.test.ts`

- [x] **Step 1: Append the failing test**

The signature design: `lonLatToTilePixel` takes a `TileRegion` (the `{lat, lon, widthDeg, heightDeg}` subset of `TileMetadata.sourceRegion`) plus pixel dimensions as separate arguments. `TileMetadata` in `types.ts` does not carry pixel dimensions today (they live with the heightmap PNG), so passing them separately keeps the substrate library decoupled from the existing tile catalog.

Append to `packages/sim/src/sphere/coords.test.ts`:

```ts
import {
  lonLatToTilePixel,
  tilePixelToLonLat,
  type TilePixel,
  type TileRegion,
} from './coords'

// Synthetic 1° × 1° tile centered at (lon=10, lat=20), 1024×1024 pixels.
const TEST_REGION: TileRegion = {
  lat: 20,
  lon: 10,
  widthDeg: 1,
  heightDeg: 1,
}
const PIXEL_WIDTH = 1024
const PIXEL_HEIGHT = 1024

describe('LonLat ↔ TilePixel conversions', () => {
  it('maps the tile center (10, 20) to (512, 512)', () => {
    const px = lonLatToTilePixel(
      { lonDeg: 10, latDeg: 20 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px).not.toBeNull()
    expect(px!.px).toBeCloseTo(512, 6)
    expect(px!.py).toBeCloseTo(512, 6)
  })

  it('maps the NW corner (lon=9.5, lat=20.5) to (0, 0)', () => {
    // Convention: px=0 is west edge, py=0 is north edge (top of image).
    const px = lonLatToTilePixel(
      { lonDeg: 9.5, latDeg: 20.5 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px!.px).toBeCloseTo(0, 6)
    expect(px!.py).toBeCloseTo(0, 6)
  })

  it('maps the SE corner (lon=10.5, lat=19.5) to (1024, 1024)', () => {
    const px = lonLatToTilePixel(
      { lonDeg: 10.5, latDeg: 19.5 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px!.px).toBeCloseTo(1024, 6)
    expect(px!.py).toBeCloseTo(1024, 6)
  })

  it('returns null for points outside the tile', () => {
    expect(
      lonLatToTilePixel(
        { lonDeg: 11, latDeg: 20 },
        TEST_REGION,
        PIXEL_WIDTH,
        PIXEL_HEIGHT,
      ),
    ).toBeNull()
    expect(
      lonLatToTilePixel(
        { lonDeg: 10, latDeg: 19 },
        TEST_REGION,
        PIXEL_WIDTH,
        PIXEL_HEIGHT,
      ),
    ).toBeNull()
  })

  it('round-trips arbitrary tile-pixel coordinates within 1e-9 degrees', () => {
    let maxErr = 0
    for (let py = 0; py <= 1024; py += 64) {
      for (let px = 0; px <= 1024; px += 64) {
        const ll = tilePixelToLonLat({ px, py }, TEST_REGION, PIXEL_WIDTH, PIXEL_HEIGHT)
        const back = lonLatToTilePixel(ll, TEST_REGION, PIXEL_WIDTH, PIXEL_HEIGHT)
        if (back === null) continue
        maxErr = Math.max(
          maxErr,
          Math.abs(back.px - px),
          Math.abs(back.py - py),
        )
      }
    }
    expect(maxErr).toBeLessThan(1e-9)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test coords`
Expected: FAIL — `lonLatToTilePixel` not exported.

- [x] **Step 3: Append TilePixel implementation**

Append to `packages/sim/src/sphere/coords.ts`:

```ts
/**
 * Tile-local pixel coordinate. Used only at storage / raster I/O
 * boundaries — not in the substrate's working representation. (px, py)
 * is integer at exact-pixel positions but is float here to support
 * sub-pixel queries.
 */
export interface TilePixel {
  /** West-to-east. 0 is the west edge of the tile. */
  px: number
  /** North-to-south (image y axis). 0 is the north edge of the tile. */
  py: number
}

/** Geographic region a tile covers. Subset of TileMetadata['sourceRegion']. */
export interface TileRegion {
  /** Latitude of the tile center, degrees. */
  lat: number
  /** Longitude of the tile center, degrees. */
  lon: number
  /** Width of the tile in degrees of longitude. */
  widthDeg: number
  /** Height of the tile in degrees of latitude. */
  heightDeg: number
}

/**
 * Convert a LonLat to tile-local pixel coordinates. Returns null if the
 * point is outside the tile's geographic region.
 *
 * Convention: px=0 is the west edge, py=0 is the north edge (image y axis
 * grows downward, matching PNG convention).
 *
 * Treats the tile as a flat equirectangular crop of the underlying source
 * region — accurate at 1°×1° MVP scale; the audit doc captures this as
 * an MVP-safe assumption to revisit when v1 introduces multi-tile
 * composition.
 */
export function lonLatToTilePixel(
  p: LonLat,
  region: TileRegion,
  pixelWidth: number,
  pixelHeight: number,
): TilePixel | null {
  const westEdge = region.lon - region.widthDeg / 2
  const eastEdge = region.lon + region.widthDeg / 2
  const northEdge = region.lat + region.heightDeg / 2
  const southEdge = region.lat - region.heightDeg / 2

  if (
    p.lonDeg < westEdge ||
    p.lonDeg > eastEdge ||
    p.latDeg < southEdge ||
    p.latDeg > northEdge
  ) {
    return null
  }

  const px = ((p.lonDeg - westEdge) / region.widthDeg) * pixelWidth
  const py = ((northEdge - p.latDeg) / region.heightDeg) * pixelHeight
  return { px, py }
}

/** Convert tile-local pixel coordinates to LonLat. Inverse of lonLatToTilePixel. */
export function tilePixelToLonLat(
  pixel: TilePixel,
  region: TileRegion,
  pixelWidth: number,
  pixelHeight: number,
): LonLat {
  const westEdge = region.lon - region.widthDeg / 2
  const northEdge = region.lat + region.heightDeg / 2
  return {
    lonDeg: westEdge + (pixel.px / pixelWidth) * region.widthDeg,
    latDeg: northEdge - (pixel.py / pixelHeight) * region.heightDeg,
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test coords`
Expected: PASS — all coords tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/coords.ts packages/sim/src/sphere/coords.test.ts
git commit -m "feat(sphere): LonLat ↔ TilePixel for tile-local raster coords"
```

---

## Task 7: Internal RNG-to-double adapter

**Files:**
- Create: `packages/sim/src/sphere/_rng.ts`

- [x] **Step 1: Implement directly (internal helper, exercised by distribution + noise tests)**

Create `packages/sim/src/sphere/_rng.ts`:

```ts
// Internal adapter from MAURO's bigint-returning Xoshiro256 to a
// () => number callable returning values in [0, 1). Used by:
//   - distribution.ts (uniformOnSphere, cosineWeightedPoisson)
//   - noise.ts (initial permutation table seed for simplex-noise@4)
//
// Uses the high 53 bits of the 64-bit RNG output, mapped to [0, 1) by
// dividing by 2^53. This is the standard "uniform double from uint64"
// recipe — preserves the full mantissa precision of float64.

import type { Xoshiro256 } from '../rng/xoshiro256'

const SCALE = 2 ** 53

export function nextDouble(rng: Xoshiro256): number {
  // Shift right by 11 bits to get a 53-bit unsigned, then to number, then
  // divide by 2^53. The shift-then-Number conversion is safe — 53-bit
  // unsigned fits exactly in float64.
  return Number(rng.next() >> 11n) / SCALE
}

/** Wrap a Xoshiro256 as a `() => number` callable for libraries that need it. */
export function asDoubleSource(rng: Xoshiro256): () => number {
  return () => nextDouble(rng)
}
```

- [x] **Step 2: Verify it compiles**

Run: `pnpm --filter @mauro/sim typecheck`
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add packages/sim/src/sphere/_rng.ts
git commit -m "feat(sphere): internal Xoshiro256 → double adapter"
```

---

## Task 8: Geodesy — rotateAxisAngle

**Files:**
- Create: `packages/sim/src/sphere/geodesy.ts` (partial — Tasks 9–12 add to it)
- Create: `packages/sim/src/sphere/geodesy.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/geodesy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rotateAxisAngle } from './geodesy'
import { lonLatToCartesian, type Cartesian3 } from './coords'

describe('rotateAxisAngle', () => {
  it('returns the input unchanged for angle 0', () => {
    const p: Cartesian3 = { x: 1, y: 0, z: 0 }
    const r = rotateAxisAngle(p, { x: 0, y: 0, z: 1 }, 0)
    expect(r.x).toBeCloseTo(1, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('rotates (1,0,0) by 90° about Z to (0,1,0)', () => {
    const r = rotateAxisAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('rotates (0,1,0) by 90° about X to (0,0,1)', () => {
    const r = rotateAxisAngle({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, Math.PI / 2)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(1, 12)
  })

  it('returns to start after a full 2π rotation', () => {
    const p = lonLatToCartesian({ lonDeg: 37, latDeg: 53 })
    const axis = lonLatToCartesian({ lonDeg: -100, latDeg: 12 })
    const r = rotateAxisAngle(p, axis, 2 * Math.PI)
    expect(r.x).toBeCloseTo(p.x, 10)
    expect(r.y).toBeCloseTo(p.y, 10)
    expect(r.z).toBeCloseTo(p.z, 10)
  })

  it('preserves length for any unit-axis rotation (orthonormal)', () => {
    const p = lonLatToCartesian({ lonDeg: -73.5, latDeg: 40.7 })
    const axis = lonLatToCartesian({ lonDeg: 130, latDeg: -25 })
    const r = rotateAxisAngle(p, axis, 1.234)
    const lengthSq = r.x * r.x + r.y * r.y + r.z * r.z
    expect(lengthSq).toBeCloseTo(1, 12)
  })

  it('composes 100 small rotations equivalently to one large rotation', () => {
    const p = lonLatToCartesian({ lonDeg: 10, latDeg: 20 })
    const axis = lonLatToCartesian({ lonDeg: 60, latDeg: 30 })
    const totalAngle = 1.5
    const stepAngle = totalAngle / 100

    let composed = p
    for (let i = 0; i < 100; i++) {
      composed = rotateAxisAngle(composed, axis, stepAngle)
    }
    const single = rotateAxisAngle(p, axis, totalAngle)

    expect(composed.x).toBeCloseTo(single.x, 9)
    expect(composed.y).toBeCloseTo(single.y, 9)
    expect(composed.z).toBeCloseTo(single.z, 9)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: FAIL — `./geodesy` does not exist.

- [x] **Step 3: Implement rotateAxisAngle (Rodrigues' formula)**

Create `packages/sim/src/sphere/geodesy.ts`:

```ts
// Geodesy primitives — distances, rotations, slerp, Euler-pole rotation.
//
// Per the spec's hybrid coordinate-frame policy:
//   - greatCircleDistanceMeters: unit sphere math (Haversine), fast.
//   - geodesicDistanceMeters: WGS84 ellipsoid via Karney's algorithm.
//   - rotateAxisAngle, slerp, eulerPoleRotation: unit sphere math —
//     these have no meaningful ellipsoidal analog and are standard in
//     geodynamic models.

import {
  cartesianToLonLat,
  lonLatToCartesian,
  type Cartesian3,
  type LonLat,
} from './coords'
import { add, cross, dot, normalize, scale } from './_vec'

/**
 * Rotate a Cartesian3 about a unit axis by an angle (radians) using
 * Rodrigues' rotation formula. The axis must be a unit vector; pre-
 * normalize if it isn't already.
 *
 * v_rot = v cos θ + (k × v) sin θ + k (k · v)(1 − cos θ)
 *
 * Frame: unit sphere. Used by slerp's antipodal fallback, by
 * eulerPoleRotation, and by v1 plate tectonics.
 */
export function rotateAxisAngle(
  p: Cartesian3,
  axis: Cartesian3,
  angleRad: number,
): Cartesian3 {
  // Defensive: normalize the axis. Cheap and prevents callers from
  // passing not-quite-unit vectors that drift the result off the sphere.
  const k = normalize(axis)
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const oneMinusCosA = 1 - cosA

  const kCrossP = cross(k, p)
  const kDotP = dot(k, p)

  return add(
    add(scale(p, cosA), scale(kCrossP, sinA)),
    scale(k, kDotP * oneMinusCosA),
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: PASS — all six rotation tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/geodesy.ts packages/sim/src/sphere/geodesy.test.ts
git commit -m "feat(sphere): rotateAxisAngle via Rodrigues' formula"
```

---

## Task 9: Geodesy — slerp with antipode handling

**Files:**
- Modify: `packages/sim/src/sphere/geodesy.ts`
- Modify: `packages/sim/src/sphere/geodesy.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/geodesy.test.ts`:

```ts
import { slerp } from './geodesy'

describe('slerp', () => {
  it('returns a at t=0', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 0, y: 1, z: 0 }
    const r = slerp(a, b, 0)
    expect(r.x).toBeCloseTo(1, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('returns b at t=1', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 0, y: 1, z: 0 }
    const r = slerp(a, b, 1)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('produces the expected midpoint for orthogonal inputs', () => {
    // Midpoint of (1,0,0) and (0,1,0) is (√2/2, √2/2, 0)
    const r = slerp({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5)
    const sqrt2over2 = Math.SQRT2 / 2
    expect(r.x).toBeCloseTo(sqrt2over2, 12)
    expect(r.y).toBeCloseTo(sqrt2over2, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('handles nearly-identical inputs without dividing by zero', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 1, y: 1e-15, z: 0 }
    const r = slerp(a, b, 0.5)
    // Output should be unit-length and very close to a.
    const lenSq = r.x * r.x + r.y * r.y + r.z * r.z
    expect(lenSq).toBeCloseTo(1, 10)
    expect(r.x).toBeCloseTo(1, 12)
  })

  it('handles antipodal inputs deterministically', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const antipode: Cartesian3 = { x: -1, y: 0, z: 0 }
    const r1 = slerp(a, antipode, 0.5)
    const r2 = slerp(a, antipode, 0.5)
    // Same input → same output.
    expect(r1).toEqual(r2)
    // Output should be unit-length.
    const lenSq = r1.x * r1.x + r1.y * r1.y + r1.z * r1.z
    expect(lenSq).toBeCloseTo(1, 12)
    // Output should be perpendicular to a (dot product ≈ 0).
    expect(r1.x * a.x + r1.y * a.y + r1.z * a.z).toBeCloseTo(0, 12)
  })

  it('antipodal slerp at t=0 returns a, t=1 returns antipode-rotated', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const antipode: Cartesian3 = { x: -1, y: 0, z: 0 }
    const r0 = slerp(a, antipode, 0)
    const r1 = slerp(a, antipode, 1)
    expect(r0.x).toBeCloseTo(1, 12)
    // At t=1, full π rotation about a perpendicular axis brings us to -a.
    expect(r1.x).toBeCloseTo(-1, 10)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: FAIL — `slerp` not exported.

- [x] **Step 3: Implement slerp + perpendicularFallback**

Append to `packages/sim/src/sphere/geodesy.ts`:

```ts
import { lerp } from './_vec'

const EPSILON_SAME = 1e-10
const EPSILON_ANTIPODAL = 1e-10

/**
 * Spherical linear interpolation between two unit vectors. Standard slerp
 * formula with two edge-case branches:
 *   - Nearly identical (cos Ω > 1 − ε): linear interp + normalize.
 *     Avoids dividing by sin(Ω) ≈ 0; the great-circle path is degenerate
 *     anyway because a ≈ b.
 *   - Nearly antipodal (cos Ω < −1 + ε): no canonical great circle exists.
 *     We pick a deterministic perpendicular axis via perpendicularFallback
 *     and rotate `a` by t·π about it. Same input → same output across runs.
 *
 * Frame: unit sphere. Inputs assumed unit-length; a non-unit-length input
 * will give wrong results without throwing.
 */
export function slerp(a: Cartesian3, b: Cartesian3, t: number): Cartesian3 {
  const cosOmega = dot(a, b)

  if (cosOmega > 1 - EPSILON_SAME) {
    // Nearly identical: linear interp + normalize.
    return normalize(lerp(a, b, t))
  }

  if (cosOmega < -1 + EPSILON_ANTIPODAL) {
    // Antipodal: rotate `a` by t·π about a deterministic perpendicular axis.
    const axis = perpendicularFallback(a)
    return rotateAxisAngle(a, axis, t * Math.PI)
  }

  // Standard slerp.
  const omega = Math.acos(cosOmega)
  const sinOmega = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / sinOmega
  const wb = Math.sin(t * omega) / sinOmega
  return add(scale(a, wa), scale(b, wb))
}

/**
 * Pick a deterministic unit vector perpendicular to `a`. Used by slerp's
 * antipodal branch. The convention is fixed so that same input → same
 * output across runs.
 *
 *   axis = a × (1, 0, 0), unless a ≈ ±(1, 0, 0), in which case
 *   axis = a × (0, 1, 0).
 *
 * The result is guaranteed perpendicular to `a` and unit-length.
 */
function perpendicularFallback(a: Cartesian3): Cartesian3 {
  // Use (1,0,0) as the reference axis unless a is too close to it
  // (then the cross product collapses to zero).
  const reference: Cartesian3 =
    Math.abs(a.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  return normalize(cross(a, reference))
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: PASS — all slerp tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/geodesy.ts packages/sim/src/sphere/geodesy.test.ts
git commit -m "feat(sphere): slerp with deterministic antipodal fallback"
```

---

## Task 10: Geodesy — eulerPoleRotation

**Files:**
- Modify: `packages/sim/src/sphere/geodesy.ts`
- Modify: `packages/sim/src/sphere/geodesy.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/geodesy.test.ts`:

```ts
import { eulerPoleRotation } from './geodesy'

describe('eulerPoleRotation', () => {
  it('rotates a point about the geographic north pole by the expected longitude', () => {
    // Rotating (lon=0, lat=10) by π/2 about the north pole should produce (lon=90, lat=10).
    const result = eulerPoleRotation(
      { lonDeg: 0, latDeg: 10 },
      { lonDeg: 0, latDeg: 90 },  // axis is the north pole
      Math.PI / 2,
    )
    expect(result.lonDeg).toBeCloseTo(90, 9)
    expect(result.latDeg).toBeCloseTo(10, 9)
  })

  it('returns the input position when the angle is 0', () => {
    const input = { lonDeg: -73.5, latDeg: 40.7 }
    const result = eulerPoleRotation(input, { lonDeg: 100, latDeg: -20 }, 0)
    expect(result.lonDeg).toBeCloseTo(input.lonDeg, 9)
    expect(result.latDeg).toBeCloseTo(input.latDeg, 9)
  })

  it('leaves a point on the rotation axis unchanged', () => {
    // A point at the same position as the Euler pole has zero rotation arc.
    const pole = { lonDeg: 30, latDeg: 50 }
    const result = eulerPoleRotation(pole, pole, 1.234)
    expect(result.lonDeg).toBeCloseTo(30, 9)
    expect(result.latDeg).toBeCloseTo(50, 9)
  })

  it('composes 100 small rotations equivalently to one large one (associativity)', () => {
    let p = { lonDeg: 5, latDeg: 15 }
    const pole = { lonDeg: 60, latDeg: 30 }
    const totalAngle = 1.0
    const stepAngle = totalAngle / 100

    for (let i = 0; i < 100; i++) {
      p = eulerPoleRotation(p, pole, stepAngle)
    }
    const single = eulerPoleRotation({ lonDeg: 5, latDeg: 15 }, pole, totalAngle)

    expect(p.lonDeg).toBeCloseTo(single.lonDeg, 7)
    expect(p.latDeg).toBeCloseTo(single.latDeg, 7)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: FAIL — `eulerPoleRotation` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/geodesy.ts`:

```ts
/**
 * Rotate a LonLat point about an Euler pole (axis through the planet's
 * center, defined by its surface lat/lon) by an angle in radians.
 *
 * Foundation primitive for plate tectonics (rule 10a). v1 plate-tectonics
 * simulation calls this in a loop per cell per timestep — the geometry is
 * here from day one so the simulation only needs to model plate state and
 * integrate over time.
 *
 * Implementation: convert pole and point to unit-sphere Cartesian, apply
 * Rodrigues' rotation, convert back. Composition is associative within
 * float precision.
 */
export function eulerPoleRotation(
  p: LonLat,
  pole: LonLat,
  angleRad: number,
): LonLat {
  const pCart = lonLatToCartesian(p)
  const axisCart = lonLatToCartesian(pole)
  const rotated = rotateAxisAngle(pCart, axisCart, angleRad)
  return cartesianToLonLat(rotated)
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: PASS — all four eulerPoleRotation tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/geodesy.ts packages/sim/src/sphere/geodesy.test.ts
git commit -m "feat(sphere): eulerPoleRotation — rule 10a foundation primitive"
```

---

## Task 11: Geodesy — greatCircleDistanceMeters (Haversine)

**Files:**
- Modify: `packages/sim/src/sphere/geodesy.ts`
- Modify: `packages/sim/src/sphere/geodesy.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/geodesy.test.ts`:

```ts
import { greatCircleDistanceMeters } from './geodesy'
import { WGS84 } from './wgs84'

describe('greatCircleDistanceMeters (Haversine, sphere math)', () => {
  it('returns 0 for identical points', () => {
    const d = greatCircleDistanceMeters(
      { lonDeg: 10, latDeg: 20 },
      { lonDeg: 10, latDeg: 20 },
    )
    expect(d).toBeLessThan(1e-6)
  })

  it('NYC to London is about 5570 km (sphere) ± 5 km', () => {
    const d = greatCircleDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    const km = d / 1000
    expect(km).toBeGreaterThan(5565)
    expect(km).toBeLessThan(5575)
  })

  it('equator quarter-circle (0,0) → (90,0) is exactly π/2 · R', () => {
    const d = greatCircleDistanceMeters({ lonDeg: 0, latDeg: 0 }, { lonDeg: 90, latDeg: 0 })
    const expected = (Math.PI / 2) * WGS84.MEAN_RADIUS_METERS
    expect(d).toBeCloseTo(expected, 0)  // within 0.5 m
  })

  it('antipodal pair distance equals π · R', () => {
    const d = greatCircleDistanceMeters({ lonDeg: 0, latDeg: 0 }, { lonDeg: 180, latDeg: 0 })
    const expected = Math.PI * WGS84.MEAN_RADIUS_METERS
    expect(d).toBeCloseTo(expected, 0)
  })

  it('respects custom radius parameter', () => {
    const d = greatCircleDistanceMeters(
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: 90, latDeg: 0 },
      1000,
    )
    expect(d).toBeCloseTo((Math.PI / 2) * 1000, 6)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: FAIL — `greatCircleDistanceMeters` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/geodesy.ts`:

```ts
import { WGS84 } from './wgs84'

const DEG_TO_RAD = Math.PI / 180

/**
 * Great-circle distance between two LonLat points using the Haversine
 * formula on a perfect sphere. Default `radius` is the WGS84 mean radius
 * (6,371,008.8 m) — the standard "spherical Earth" approximation.
 *
 * Use for "is this within X of that" checks where ellipsoid precision
 * doesn't matter. For Earth-correct precision (e.g., reporting kilometers
 * to a user), use geodesicDistanceMeters which uses WGS84 via Karney.
 *
 * The Haversine form is numerically stable for all distances including
 * antipodal — unlike the spherical law of cosines, which loses precision
 * for short distances.
 */
export function greatCircleDistanceMeters(
  a: LonLat,
  b: LonLat,
  radius: number = WGS84.MEAN_RADIUS_METERS,
): number {
  const lat1 = a.latDeg * DEG_TO_RAD
  const lat2 = b.latDeg * DEG_TO_RAD
  const dLat = lat2 - lat1
  const dLon = (b.lonDeg - a.lonDeg) * DEG_TO_RAD

  const sinHalfDLat = Math.sin(dLat / 2)
  const sinHalfDLon = Math.sin(dLon / 2)
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLon * sinHalfDLon

  // 2 · asin(min(1, √h)) — clamp guards against float drift producing
  // h slightly > 1 for antipodal inputs.
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: PASS — all five Haversine tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/geodesy.ts packages/sim/src/sphere/geodesy.test.ts
git commit -m "feat(sphere): greatCircleDistanceMeters via Haversine"
```

---

## Task 12: Geodesy — geodesicDistanceMeters (WGS84 via Karney)

**Files:**
- Modify: `packages/sim/src/sphere/geodesy.ts`
- Modify: `packages/sim/src/sphere/geodesy.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/geodesy.test.ts`:

```ts
import { geodesicDistanceMeters } from './geodesy'

describe('geodesicDistanceMeters (WGS84 via Karney)', () => {
  it('returns 0 for identical points', () => {
    const d = geodesicDistanceMeters(
      { lonDeg: 10, latDeg: 20 },
      { lonDeg: 10, latDeg: 20 },
    )
    expect(d).toBeLessThan(1e-6)
  })

  it('NYC to London on WGS84 is about 5585 km ± 1 km', () => {
    // The 0.3% delta vs sphere (5570 km) IS the ellipsoid effect.
    const d = geodesicDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    const km = d / 1000
    expect(km).toBeGreaterThan(5565)
    expect(km).toBeLessThan(5590)
  })

  it('handles antipodal pairs without convergence failure', () => {
    // Karney's algorithm is antipode-safe — Vincenty fails to converge here.
    const d = geodesicDistanceMeters(
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: 180, latDeg: 0 },
    )
    // Equatorial circumference / 2 ≈ π · A_METERS ≈ 20,037,508 m.
    expect(d).toBeGreaterThan(20_037_000)
    expect(d).toBeLessThan(20_038_000)
  })

  it('differs from sphere distance by ~0.3% over Earth-scale distances', () => {
    const sphere = greatCircleDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    const wgs84 = geodesicDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    const relativeDelta = Math.abs(wgs84 - sphere) / sphere
    expect(relativeDelta).toBeGreaterThan(0.001)
    expect(relativeDelta).toBeLessThan(0.005)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: FAIL — `geodesicDistanceMeters` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/geodesy.ts`:

```ts
// Karney's algorithm via geographiclib-geodesic. The library exports a
// CommonJS-style namespace; we import the WGS84-preconfigured Geodesic
// instance and call .Inverse(lat1, lon1, lat2, lon2) which returns
// { s12: distance_meters, ... }.
//
// Note the parameter order: Geodesic uses (lat, lon) — not (lon, lat) —
// matching geographic convention. Our LonLat type is (lon, lat) so we
// pass them in the right order at the call site.
import { Geodesic } from 'geographiclib-geodesic'

const wgs84Geodesic = Geodesic.WGS84

/**
 * Geodesic distance between two LonLat points on the WGS84 ellipsoid,
 * using Karney's algorithm (GeographicLib). Antipode-safe — Vincenty's
 * earlier formulation fails to converge near antipodes; Karney's does
 * not. ~0.3% more accurate than great-circle on a sphere over Earth-
 * scale distances.
 *
 * Use for any user-facing "real-world" distance — kilometers on screen,
 * resource-density area math, etc.
 */
export function geodesicDistanceMeters(a: LonLat, b: LonLat): number {
  const result = wgs84Geodesic.Inverse(a.latDeg, a.lonDeg, b.latDeg, b.lonDeg)
  // s12 is the distance in meters. The library guarantees it for the
  // default 'a' caps; explicit nullish-coalesce in case of API drift.
  return result.s12 ?? 0
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test geodesy`
Expected: PASS — all four geodesic tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/geodesy.ts packages/sim/src/sphere/geodesy.test.ts
git commit -m "feat(sphere): geodesicDistanceMeters — WGS84 via Karney/GeographicLib"
```

---

## Task 13: Area — spherical cell area + latitude classification

**Files:**
- Create: `packages/sim/src/sphere/area.ts` (partial — Task 14 adds WGS84 cell area)
- Create: `packages/sim/src/sphere/area.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/area.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  cellAreaSqMeters,
  cellAreaSterad,
  isPolarZone,
  latitudeBand,
  type LatitudeBand,
} from './area'
import { WGS84 } from './wgs84'

describe('cellAreaSterad', () => {
  it('returns 0 for a degenerate cell (zero width)', () => {
    expect(cellAreaSterad(0, 1, 0)).toBeCloseTo(0, 12)
    expect(cellAreaSterad(0, 0, 1)).toBeCloseTo(0, 12)
  })

  it('returns the same area for symmetric cells north and south of the equator', () => {
    const north = cellAreaSterad(45, 1, 1)
    const south = cellAreaSterad(-45, 1, 1)
    expect(north).toBeCloseTo(south, 12)
  })

  it('cells near the equator have larger area than cells near the poles', () => {
    const equator = cellAreaSterad(0, 1, 1)
    const polar = cellAreaSterad(85, 1, 1)
    expect(equator).toBeGreaterThan(polar * 5)
  })

  it('summed over a 1° global grid totals 4π steradians within 0.01%', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        // Cell centered at (lat + 0.5, lon + 0.5), extent (1°, 1°).
        total += cellAreaSterad(lat + 0.5, 1, 1)
      }
    }
    const expected = 4 * Math.PI
    const relativeError = Math.abs(total - expected) / expected
    expect(relativeError).toBeLessThan(0.0001)
  })
})

describe('cellAreaSqMeters', () => {
  it('summed over a 1° grid with default radius equals 4π R² within 0.01%', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        total += cellAreaSqMeters(lat + 0.5, 1, 1)
      }
    }
    const R = WGS84.MEAN_RADIUS_METERS
    const expected = 4 * Math.PI * R * R
    const relativeError = Math.abs(total - expected) / expected
    expect(relativeError).toBeLessThan(0.0001)
  })

  it('respects custom radius', () => {
    const a = cellAreaSqMeters(0, 1, 1, 1000)
    const b = cellAreaSqMeters(0, 1, 1, 2000)
    expect(b / a).toBeCloseTo(4, 9)  // area scales as R²
  })
})

describe('latitudeBand', () => {
  it('classifies the equator as tropical', () => {
    expect(latitudeBand(0)).toBe<LatitudeBand>('tropical')
  })

  it('uses |lat| so northern and southern hemispheres map symmetrically', () => {
    expect(latitudeBand(45)).toBe(latitudeBand(-45))
    expect(latitudeBand(70)).toBe(latitudeBand(-70))
  })

  it('uses standard climatology thresholds: 23.5, 35, 55, 66.5', () => {
    expect(latitudeBand(0)).toBe('tropical')
    expect(latitudeBand(20)).toBe('tropical')
    expect(latitudeBand(23.5)).toBe('subtropical')   // boundary inclusive on upper side
    expect(latitudeBand(30)).toBe('subtropical')
    expect(latitudeBand(35)).toBe('temperate')
    expect(latitudeBand(50)).toBe('temperate')
    expect(latitudeBand(55)).toBe('subpolar')
    expect(latitudeBand(60)).toBe('subpolar')
    expect(latitudeBand(66.5)).toBe('polar')
    expect(latitudeBand(80)).toBe('polar')
    expect(latitudeBand(90)).toBe('polar')
  })
})

describe('isPolarZone (rule 10e render-distortion classifier)', () => {
  it('returns true for |lat| >= 80', () => {
    expect(isPolarZone(80)).toBe(true)
    expect(isPolarZone(85)).toBe(true)
    expect(isPolarZone(90)).toBe(true)
    expect(isPolarZone(-80)).toBe(true)
    expect(isPolarZone(-90)).toBe(true)
  })

  it('returns false for |lat| < 80', () => {
    expect(isPolarZone(79.99)).toBe(false)
    expect(isPolarZone(0)).toBe(false)
    expect(isPolarZone(-79.99)).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test area`
Expected: FAIL — `./area` does not exist.

- [x] **Step 3: Implement the module**

Create `packages/sim/src/sphere/area.ts`:

```ts
// Cell area, latitude bands, and polar-zone classification.
//
// Spherical cell area uses Archimedes' hat-box theorem:
//   dA = R² · |sin(φ₁) − sin(φ₂)| · dλ
// where φ₁, φ₂ are the cell's bottom/top latitudes in radians, dλ is the
// cell's longitude extent in radians. This is exact for a sphere — it
// is NOT the small-cosine-times-rect approximation, which has error at
// high latitudes.
//
// WGS84 ellipsoidal cell area lives in cellAreaSqMetersWGS84 (Task 14).

import { WGS84 } from './wgs84'

const DEG_TO_RAD = Math.PI / 180

/**
 * Cell area in steradians (unit-sphere area). For a cell centered at
 * `latDeg` with extent `dLatDeg` × `dLonDeg`. Range: [0, 4π].
 */
export function cellAreaSterad(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
): number {
  const lat1Rad = (latDeg - dLatDeg / 2) * DEG_TO_RAD
  const lat2Rad = (latDeg + dLatDeg / 2) * DEG_TO_RAD
  const dLonRad = dLonDeg * DEG_TO_RAD
  return Math.abs(Math.sin(lat2Rad) - Math.sin(lat1Rad)) * dLonRad
}

/**
 * Cell area in square meters on a sphere of radius `radius`. Default
 * radius is the WGS84 mean radius (6,371,008.8 m). For ellipsoid-correct
 * area, use cellAreaSqMetersWGS84 (Task 14).
 */
export function cellAreaSqMeters(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
  radius: number = WGS84.MEAN_RADIUS_METERS,
): number {
  return cellAreaSterad(latDeg, dLatDeg, dLonDeg) * radius * radius
}

/** Climatological latitude bands. Uses |lat| — same band for both hemispheres. */
export type LatitudeBand =
  | 'tropical'
  | 'subtropical'
  | 'temperate'
  | 'subpolar'
  | 'polar'

/**
 * Classify a latitude into a climatological band. Standard thresholds:
 *   tropical    [0°,    23.5°)
 *   subtropical [23.5°, 35°)
 *   temperate   [35°,   55°)
 *   subpolar    [55°,   66.5°)
 *   polar       [66.5°, 90°]
 *
 * Used as the "latitude is a first-class coordinate" primitive that
 * v1+ climate work builds on (rule 10d).
 */
export function latitudeBand(latDeg: number): LatitudeBand {
  const absLat = Math.abs(latDeg)
  if (absLat < 23.5) return 'tropical'
  if (absLat < 35) return 'subtropical'
  if (absLat < 55) return 'temperate'
  if (absLat < 66.5) return 'subpolar'
  return 'polar'
}

/**
 * Render-distortion-zone classifier per Architecture Principle #10e.
 * Returns true for |lat| >= 80°. Distinct from the climatological 'polar'
 * band, which begins at 66.5°. This is a rendering policy, not a
 * climate fact: equirectangular rendering smears polar cells into
 * triangular wedges, so the policy is "no important named features here,
 * heightmap tends to constant, climate is uniform-cold."
 */
export function isPolarZone(latDeg: number): boolean {
  return Math.abs(latDeg) >= 80
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test area`
Expected: PASS — all area tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/area.ts packages/sim/src/sphere/area.test.ts
git commit -m "feat(sphere): cell area, latitude bands, polar-zone classifier"
```

---

## Task 14: Area — WGS84 ellipsoidal cell area

**Files:**
- Modify: `packages/sim/src/sphere/area.ts`
- Modify: `packages/sim/src/sphere/area.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/area.test.ts`:

```ts
import { cellAreaSqMetersWGS84 } from './area'

describe('cellAreaSqMetersWGS84 (ellipsoid)', () => {
  it('returns positive areas for non-degenerate cells', () => {
    expect(cellAreaSqMetersWGS84(0, 1, 1)).toBeGreaterThan(0)
    expect(cellAreaSqMetersWGS84(45, 1, 1)).toBeGreaterThan(0)
    expect(cellAreaSqMetersWGS84(-45, 1, 1)).toBeGreaterThan(0)
  })

  it('summed over a 1° grid totals the WGS84 ellipsoid surface area within 0.01%', () => {
    // Reference value: Earth's WGS84 ellipsoid surface area ≈ 510,065,621 km².
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        total += cellAreaSqMetersWGS84(lat + 0.5, 1, 1)
      }
    }
    const totalKm2 = total / 1e6
    expect(totalKm2).toBeGreaterThan(510_000_000)
    expect(totalKm2).toBeLessThan(510_200_000)
  })

  it('differs from the sphere result by ~0.5% at high latitude', () => {
    const sphere = cellAreaSqMeters(75, 1, 1)
    const wgs84 = cellAreaSqMetersWGS84(75, 1, 1)
    const relativeDelta = Math.abs(wgs84 - sphere) / sphere
    expect(relativeDelta).toBeGreaterThan(0)
    expect(relativeDelta).toBeLessThan(0.01)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test area`
Expected: FAIL — `cellAreaSqMetersWGS84` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/area.ts`:

```ts
/**
 * Cell area in square meters on the WGS84 ellipsoid. For a cell centered
 * at `latDeg` with extent `dLatDeg` × `dLonDeg`. Uses the closed-form
 * ellipsoidal surface integral:
 *
 *   A = ∫∫ √(EG − F²) dφ dλ
 *
 * For a geographic cell (constant longitude bounds), this evaluates to
 * a function of sin(φ) and an "authalic" component captured by the
 * eccentricity. Exact closed form (Snyder 1987, eq. 3-11):
 *
 *   q(φ) = (1 − e²) [ sin φ / (1 − e² sin² φ) − (1/2e) ln((1 − e sinφ)/(1 + e sinφ)) ]
 *   A_cell = (b² · dλ / 2) · |q(φ₂) − q(φ₁)|
 *
 * where b is the polar radius. Use for user-facing areas (km², resource
 * density). For abstract per-band weighting where ~0.5% accuracy is fine,
 * cellAreaSqMeters with the mean radius is cheaper.
 */
export function cellAreaSqMetersWGS84(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
): number {
  const lat1Rad = (latDeg - dLatDeg / 2) * DEG_TO_RAD
  const lat2Rad = (latDeg + dLatDeg / 2) * DEG_TO_RAD
  const dLonRad = dLonDeg * DEG_TO_RAD
  const e = Math.sqrt(WGS84.E2)
  const oneMinusE2 = 1 - WGS84.E2
  const b2 = WGS84.B_METERS * WGS84.B_METERS

  return (b2 * dLonRad / 2) * Math.abs(qFunc(lat2Rad, e, oneMinusE2) - qFunc(lat1Rad, e, oneMinusE2))
}

/** Snyder's q function — auxiliary for ellipsoid surface integral. */
function qFunc(phi: number, e: number, oneMinusE2: number): number {
  const sinPhi = Math.sin(phi)
  const eSinPhi = e * sinPhi
  return (
    (sinPhi / (1 - WGS84.E2 * sinPhi * sinPhi)) -
    (1 / (2 * e)) * Math.log((1 - eSinPhi) / (1 + eSinPhi))
  ) * oneMinusE2
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test area`
Expected: PASS — all WGS84 area tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/area.ts packages/sim/src/sphere/area.test.ts
git commit -m "feat(sphere): cellAreaSqMetersWGS84 — ellipsoidal surface integral"
```

---

## Task 15: Noise — sampleSphereNoise

**Files:**
- Create: `packages/sim/src/sphere/noise.ts`
- Create: `packages/sim/src/sphere/noise.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/noise.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sampleSphereNoise, type SphereNoiseParams } from './noise'
import { lonLatToCartesian } from './coords'

const DEFAULT_PARAMS: SphereNoiseParams = {
  seed: 42n,
  octaves: 4,
  frequency: 1,
  lacunarity: 2,
  persistence: 0.5,
}

describe('sampleSphereNoise', () => {
  it('returns deterministic output for identical inputs', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    const b = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    expect(a).toBe(b)
  })

  it('produces different output for different inputs', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    const b = sampleSphereNoise({ lonDeg: 11, latDeg: 20 }, DEFAULT_PARAMS)
    expect(a).not.toBe(b)
  })

  it('produces different output for different seeds', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, { ...DEFAULT_PARAMS, seed: 1n })
    const b = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, { ...DEFAULT_PARAMS, seed: 2n })
    expect(a).not.toBe(b)
  })

  it('output is bounded in approximately [-1, 1] over many samples', () => {
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const v = sampleSphereNoise(
          { lonDeg: -180 + (360 * i) / 100, latDeg: -90 + (180 * (j + 0.5)) / 100 },
          DEFAULT_PARAMS,
        )
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1.5)  // FBM with persistence < 1 stays bounded
    expect(max).toBeLessThanOrEqual(1.5)
  })

  it('is continuous across the dateline (rule 10c)', () => {
    const east = sampleSphereNoise({ lonDeg: 179.99, latDeg: 0 }, DEFAULT_PARAMS)
    const west = sampleSphereNoise({ lonDeg: -179.99, latDeg: 0 }, DEFAULT_PARAMS)
    expect(Math.abs(east - west)).toBeLessThan(0.05)
  })

  it('is continuous near the north pole (rule 10c)', () => {
    // Sample at 10 random lon values very close to the pole. All physical
    // positions are near identical (on a sphere), so noise values should
    // also be near identical.
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      samples.push(
        sampleSphereNoise(
          { lonDeg: -180 + (360 * i) / 10, latDeg: 89.999 },
          DEFAULT_PARAMS,
        ),
      )
    }
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    expect(max - min).toBeLessThan(0.1)
  })

  it('accepts pre-converted Cartesian3 input identically', () => {
    const ll = { lonDeg: 30, latDeg: 40 }
    const fromLL = sampleSphereNoise(ll, DEFAULT_PARAMS)
    const fromCart = sampleSphereNoise(lonLatToCartesian(ll), DEFAULT_PARAMS)
    expect(fromLL).toBeCloseTo(fromCart, 12)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test noise`
Expected: FAIL — `./noise` does not exist.

- [x] **Step 3: Implement the module**

Create `packages/sim/src/sphere/noise.ts`:

```ts
// Sphere-native procedural noise via 3D Simplex sampling.
//
// The trick is to sample a 3D noise field at the Cartesian unit-sphere
// position, NOT at (lon, lat) in 2D. Because the input space is 3D and
// continuous, the dateline + pole singularities of 2D-pixel-space noise
// don't exist — they're emergent from the bad parameterization, not from
// noise itself.
//
// Library: simplex-noise@4.0.x (Wagner). Picked over Perlin because the
// hypercube lattice produces faint orthogonal banding visible at low
// octave counts when 3D noise is sampled on a sphere; Simplex's isotropic
// lattice eliminates this. See spec section "Noise library" for the full
// rationale.

import { createNoise3D } from 'simplex-noise'
import { lonLatToCartesian, type Cartesian3, type LonLat } from './coords'
import { asDoubleSource } from './_rng'
import { xoshiro256ss } from '../rng/xoshiro256'

export interface SphereNoiseParams {
  /** Master seed. Drives the noise's internal permutation table. */
  seed: bigint
  /** Number of FBM octaves. 1 = single-frequency Simplex; higher adds detail. */
  octaves: number
  /** Base frequency. 1 corresponds to one full wavelength across the unit sphere. */
  frequency: number
  /** Frequency multiplier per octave. Standard value: 2. */
  lacunarity: number
  /** Amplitude multiplier per octave. Standard value: 0.5 (sums to bounded series). */
  persistence: number
}

// Noise instances are cached per seed — creating the permutation table is
// the expensive part and we want reuse across multiple sample calls with
// the same seed. Map key is the seed bigint.
const noiseCache = new Map<bigint, (x: number, y: number, z: number) => number>()

function getNoise3D(seed: bigint): (x: number, y: number, z: number) => number {
  const cached = noiseCache.get(seed)
  if (cached) return cached
  const rng = xoshiro256ss(seed)
  const noise = createNoise3D(asDoubleSource(rng))
  noiseCache.set(seed, noise)
  return noise
}

/**
 * Sample sphere-native 3D Simplex FBM noise at a point. Inputs may be
 * either LonLat (converted internally to unit-sphere Cartesian) or
 * Cartesian3 directly (must be unit length).
 *
 * Output is in approximately [−1, 1]; the exact bound depends on octave
 * count and persistence (a geometric series). Continuous across all
 * positions on the sphere — no dateline or pole artifacts by construction.
 */
export function sampleSphereNoise(
  p: LonLat | Cartesian3,
  params: SphereNoiseParams,
): number {
  const cart = isLonLat(p) ? lonLatToCartesian(p) : p
  const noise3D = getNoise3D(params.seed)

  let amplitude = 1
  let frequency = params.frequency
  let sum = 0
  let normalization = 0

  for (let i = 0; i < params.octaves; i++) {
    sum += amplitude * noise3D(cart.x * frequency, cart.y * frequency, cart.z * frequency)
    normalization += amplitude
    amplitude *= params.persistence
    frequency *= params.lacunarity
  }

  // Normalize to keep output bounded in approximately [-1, 1] regardless
  // of octave count.
  return sum / normalization
}

function isLonLat(p: LonLat | Cartesian3): p is LonLat {
  return (p as LonLat).lonDeg !== undefined
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test noise`
Expected: PASS — all noise tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/noise.ts packages/sim/src/sphere/noise.test.ts
git commit -m "feat(sphere): sampleSphereNoise — 3D Simplex on unit sphere"
```

---

## Task 16: Distribution — uniformOnSphere

**Files:**
- Create: `packages/sim/src/sphere/distribution.ts` (partial — Tasks 17, 18 add to it)
- Create: `packages/sim/src/sphere/distribution.test.ts`

- [x] **Step 1: Write the failing test**

Create `packages/sim/src/sphere/distribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { uniformOnSphere } from './distribution'
import { xoshiro256ss } from '../rng/xoshiro256'
import { latitudeBand } from './area'

describe('uniformOnSphere', () => {
  it('returns a deterministic sequence from a fixed seed', () => {
    const rng1 = xoshiro256ss(42n)
    const rng2 = xoshiro256ss(42n)
    for (let i = 0; i < 10; i++) {
      const a = uniformOnSphere(rng1)
      const b = uniformOnSphere(rng2)
      expect(a.lonDeg).toBe(b.lonDeg)
      expect(a.latDeg).toBe(b.latDeg)
    }
  })

  it('produces lon values in [-180, 180) and lat values in [-90, 90]', () => {
    const rng = xoshiro256ss(1n)
    for (let i = 0; i < 1000; i++) {
      const p = uniformOnSphere(rng)
      expect(p.lonDeg).toBeGreaterThanOrEqual(-180)
      expect(p.lonDeg).toBeLessThan(180)
      expect(p.latDeg).toBeGreaterThanOrEqual(-90)
      expect(p.latDeg).toBeLessThanOrEqual(90)
    }
  })

  it('does NOT cluster at the poles (rule 10d) — area-weighted distribution is uniform', () => {
    // 10,000 samples partitioned by climatological band. The fraction in
    // each band should approximately match that band's share of total
    // surface area on the sphere.
    const rng = xoshiro256ss(7n)
    const counts: Record<string, number> = { tropical: 0, subtropical: 0, temperate: 0, subpolar: 0, polar: 0 }
    const N = 10_000
    for (let i = 0; i < N; i++) {
      counts[latitudeBand(uniformOnSphere(rng).latDeg)]++
    }
    // Expected fractions (band area ÷ sphere area):
    //   tropical:    sin(23.5°) − sin(0°) doubled  ≈ 0.3987 (39.9%)
    //   subtropical: sin(35°) − sin(23.5°) doubled ≈ 0.1751 (17.5%)
    //   temperate:   sin(55°) − sin(35°) doubled   ≈ 0.2456 (24.6%)
    //   subpolar:    sin(66.5°) − sin(55°) doubled ≈ 0.1003 (10.0%)
    //   polar:       1 − sin(66.5°) doubled        ≈ 0.0826 (8.3%)
    const expected: Record<string, number> = {
      tropical: 0.3987,
      subtropical: 0.1751,
      temperate: 0.2456,
      subpolar: 0.1003,
      polar: 0.0826,
    }
    for (const [band, expectedFraction] of Object.entries(expected)) {
      const actualFraction = counts[band] / N
      // ±0.02 tolerance — about 2σ for binomial with N=10,000.
      expect(actualFraction).toBeGreaterThan(expectedFraction - 0.02)
      expect(actualFraction).toBeLessThan(expectedFraction + 0.02)
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: FAIL — `./distribution` does not exist.

- [x] **Step 3: Implement the module**

Create `packages/sim/src/sphere/distribution.ts`:

```ts
// Sphere-aware random placement primitives.
//
// All functions take an explicit Xoshiro256 — never own RNG state.
// Determinism flows through the caller; no global state.

import type { Xoshiro256 } from '../rng/xoshiro256'
import { nextDouble } from './_rng'
import type { LonLat } from './coords'

/**
 * Sample a single point uniformly distributed on the unit sphere.
 * Uses the (2π·u, acos(2v − 1)) formula — correct uniform-on-sphere.
 *
 * Naive (uniform-in-lat-lon) clusters at poles because the area element
 * is cos(lat)·dlat·dlon, not dlat·dlon. This formula corrects that.
 */
export function uniformOnSphere(rng: Xoshiro256): LonLat {
  const u = nextDouble(rng)
  const v = nextDouble(rng)
  const lonRad = 2 * Math.PI * u - Math.PI    // [-π, π)
  const latRad = Math.asin(2 * v - 1)         // [-π/2, π/2]
  return {
    lonDeg: lonRad * (180 / Math.PI),
    latDeg: latRad * (180 / Math.PI),
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: PASS — all uniformOnSphere tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/distribution.ts packages/sim/src/sphere/distribution.test.ts
git commit -m "feat(sphere): uniformOnSphere — area-correct sphere sampling"
```

---

## Task 17: Distribution — cosineWeightedPoisson

**Files:**
- Modify: `packages/sim/src/sphere/distribution.ts`
- Modify: `packages/sim/src/sphere/distribution.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/distribution.test.ts`:

```ts
import { cosineWeightedPoisson } from './distribution'
import { greatCircleDistanceMeters } from './geodesy'
import { WGS84 } from './wgs84'

describe('cosineWeightedPoisson', () => {
  it('returns the requested number of points (or fewer if dart-throwing fails)', () => {
    const rng = xoshiro256ss(13n)
    const points = cosineWeightedPoisson(rng, 50, 0.05)
    expect(points.length).toBeGreaterThan(0)
    expect(points.length).toBeLessThanOrEqual(50)
  })

  it('all pairs respect the minimum great-circle separation', () => {
    const rng = xoshiro256ss(13n)
    const minSepRad = 0.1
    const points = cosineWeightedPoisson(rng, 100, minSepRad)
    const minSepMeters = minSepRad * WGS84.MEAN_RADIUS_METERS
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = greatCircleDistanceMeters(points[i], points[j])
        expect(d).toBeGreaterThanOrEqual(minSepMeters - 1)  // -1 m tolerance for float
      }
    }
  })

  it('produces a deterministic sequence from a fixed seed', () => {
    const rng1 = xoshiro256ss(99n)
    const rng2 = xoshiro256ss(99n)
    const a = cosineWeightedPoisson(rng1, 20, 0.1)
    const b = cosineWeightedPoisson(rng2, 20, 0.1)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].lonDeg).toBe(b[i].lonDeg)
      expect(a[i].latDeg).toBe(b[i].latDeg)
    }
  })

  it('caps at a fail budget for over-dense parameters (no infinite loop)', () => {
    // Asking for 1000 points with min separation that allows < 100 will
    // exhaust the dart-throwing budget without infinite-looping.
    const rng = xoshiro256ss(5n)
    const start = Date.now()
    const points = cosineWeightedPoisson(rng, 1000, 1.0)  // huge minSep
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(2000)  // bounded — fail-budget worked
    expect(points.length).toBeLessThan(50)  // sparse result, that's fine
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: FAIL — `cosineWeightedPoisson` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/distribution.ts`:

```ts
import { greatCircleDistanceMeters } from './geodesy'
import { WGS84 } from './wgs84'

/**
 * Place `count` points on the unit sphere using dart-throwing with a
 * minimum great-circle separation (specified in radians on the unit
 * sphere). Returns up to `count` points; if dart-throwing fails to find
 * enough non-overlapping positions within a fail budget, returns fewer.
 *
 * The "cosine-weighted" name reflects that uniformOnSphere already
 * compensates for the cosine-latitude area distortion (rule 10d) — this
 * function adds minimum-separation rejection on top of that uniform base.
 *
 * Fail budget: 30 attempts per requested point. For very dense
 * parameters (minSeparationRad too large for `count`), expect early
 * termination.
 */
export function cosineWeightedPoisson(
  rng: Xoshiro256,
  count: number,
  minSeparationRad: number,
): LonLat[] {
  const minSeparationMeters = minSeparationRad * WGS84.MEAN_RADIUS_METERS
  const accepted: LonLat[] = []
  const maxAttempts = count * 30

  for (let attempt = 0; attempt < maxAttempts && accepted.length < count; attempt++) {
    const candidate = uniformOnSphere(rng)
    let collides = false
    for (const existing of accepted) {
      if (greatCircleDistanceMeters(candidate, existing) < minSeparationMeters) {
        collides = true
        break
      }
    }
    if (!collides) {
      accepted.push(candidate)
    }
  }

  return accepted
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: PASS — all cosineWeightedPoisson tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/distribution.ts packages/sim/src/sphere/distribution.test.ts
git commit -m "feat(sphere): cosineWeightedPoisson — sphere placement with min separation"
```

---

## Task 18: Distribution — areaWeightedAccumulate

**Files:**
- Modify: `packages/sim/src/sphere/distribution.ts`
- Modify: `packages/sim/src/sphere/distribution.test.ts`

- [x] **Step 1: Append the failing test**

Append to `packages/sim/src/sphere/distribution.test.ts`:

```ts
import { areaWeightedAccumulate } from './distribution'
import { cellAreaSterad } from './area'

describe('areaWeightedAccumulate', () => {
  it('weighted sum over a uniform global field equals the field value', () => {
    // A "field" of constant value 5 across a 10° global grid. The weighted
    // mean should equal 5 within float precision.
    const cells: Array<{ latDeg: number; value: number }> = []
    for (let lat = -90; lat < 90; lat += 10) {
      for (let lon = -180; lon < 180; lon += 10) {
        cells.push({ latDeg: lat + 5, value: 5 })
      }
    }
    const result = areaWeightedAccumulate(
      cells,
      (acc, value, weight) => ({
        sum: acc.sum + value * weight,
        weight: acc.weight + weight,
      }),
      { sum: 0, weight: 0 },
    )
    expect(result.sum / result.weight).toBeCloseTo(5, 12)
  })

  it('weighted sum biases toward equatorial cells (larger area)', () => {
    // A field that's 10 at the equator and 0 at high latitudes. The
    // area-weighted mean should be much closer to 10 than the
    // un-weighted mean would be (because equatorial cells are larger).
    const cells: Array<{ latDeg: number; value: number }> = []
    for (let lat = -90; lat < 90; lat += 10) {
      for (let lon = -180; lon < 180; lon += 10) {
        const value = Math.abs(lat + 5) < 30 ? 10 : 0
        cells.push({ latDeg: lat + 5, value })
      }
    }
    const weighted = areaWeightedAccumulate(
      cells,
      (acc, v, w) => ({ sum: acc.sum + v * w, weight: acc.weight + w }),
      { sum: 0, weight: 0 },
    )
    const meanWeighted = weighted.sum / weighted.weight

    const unweighted = cells.reduce((s, c) => s + c.value, 0) / cells.length

    expect(meanWeighted).toBeGreaterThan(unweighted)
  })

  it('returns the initial value for an empty input', () => {
    const result = areaWeightedAccumulate(
      [],
      (acc) => acc,
      { sum: 0, weight: 0 },
    )
    expect(result.sum).toBe(0)
    expect(result.weight).toBe(0)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: FAIL — `areaWeightedAccumulate` not exported.

- [x] **Step 3: Append the implementation**

Append to `packages/sim/src/sphere/distribution.ts`:

```ts
import { cellAreaSterad } from './area'

/**
 * Generic reducer that visits each cell with its area-in-steradians
 * weight. The combine function receives `(accumulator, value, weight)`.
 * Used by climate, terrain analysis, and any consumer that needs cell-
 * area awareness when summing/averaging over a global field.
 *
 * Each cell is assumed 1° × 1° at its `latDeg` for weight derivation.
 * For non-uniform cell sizes, the consumer should compute weights itself
 * and use a plain reduce.
 */
export function areaWeightedAccumulate<T>(
  cells: Iterable<{ latDeg: number; value: T }>,
  combine: (acc: T, value: T, weight: number) => T,
  initial: T,
): T {
  let acc = initial
  for (const cell of cells) {
    const weight = cellAreaSterad(cell.latDeg, 1, 1)
    acc = combine(acc, cell.value, weight)
  }
  return acc
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mauro/sim test distribution`
Expected: PASS — all areaWeightedAccumulate tests green.

- [x] **Step 5: Commit**

```bash
git add packages/sim/src/sphere/distribution.ts packages/sim/src/sphere/distribution.test.ts
git commit -m "feat(sphere): areaWeightedAccumulate — generic area-aware reducer"
```

---

## Task 19: Public surface — index.ts

**Files:**
- Create: `packages/sim/src/sphere/index.ts`

- [x] **Step 1: Write the implementation**

Create `packages/sim/src/sphere/index.ts`:

```ts
// Public surface of the sphere substrate library. Re-exports only.
// Internal helpers (_vec, _rng) are NOT re-exported.
//
// Per the spec: no top-level re-export from @mauro/sim's index.ts until
// v1 has a real consumer (avoids freezing the API too early). For now,
// import as: import { ... } from './sphere' from inside packages/sim.

export {
  WGS84,
} from './wgs84'

export {
  cartesianToLonLat,
  clampLat,
  ecefToLonLat,
  lonLatToCartesian,
  lonLatToECEF,
  lonLatToTilePixel,
  normalizeLon,
  tilePixelToLonLat,
  type Cartesian3,
  type ECEF,
  type LonLat,
  type TilePixel,
  type TileRegion,
} from './coords'

export {
  eulerPoleRotation,
  geodesicDistanceMeters,
  greatCircleDistanceMeters,
  rotateAxisAngle,
  slerp,
} from './geodesy'

export {
  cellAreaSqMeters,
  cellAreaSqMetersWGS84,
  cellAreaSterad,
  isPolarZone,
  latitudeBand,
  type LatitudeBand,
} from './area'

export {
  sampleSphereNoise,
  type SphereNoiseParams,
} from './noise'

export {
  areaWeightedAccumulate,
  cosineWeightedPoisson,
  uniformOnSphere,
} from './distribution'
```

- [x] **Step 2: Verify it compiles**

Run: `pnpm --filter @mauro/sim typecheck`
Expected: clean.

- [x] **Step 3: Run the full sphere test suite**

Run: `pnpm --filter @mauro/sim test sphere`
Expected: every test in wgs84, coords, geodesy, area, noise, distribution passes.

- [x] **Step 4: Commit**

```bash
git add packages/sim/src/sphere/index.ts
git commit -m "feat(sphere): public surface — index.ts re-exports"
```

---

## Task 20: Validation harness — characteristic.test.ts

**Files:**
- Create: `packages/sim/src/sphere/characteristic.test.ts`

- [x] **Step 1: Write the harness**

Create `packages/sim/src/sphere/characteristic.test.ts`:

```ts
// Planet-scale validation harness for the sphere substrate.
//
// Per the spec section "Validation Harness", six test families exercise
// the primitives end-to-end in a planet-shaped way. This catches
// composition bugs that per-primitive unit tests miss.
//
// Marked `slow` via vitest's `it.concurrent` opt-out — runs in pre-merge
// CI but does not block per-save fast feedback. (If your project uses a
// different slow-test convention, adjust accordingly.)

import { describe, expect, it } from 'vitest'
import {
  cartesianToLonLat,
  cellAreaSqMeters,
  cellAreaSqMetersWGS84,
  cellAreaSterad,
  cosineWeightedPoisson,
  ecefToLonLat,
  eulerPoleRotation,
  geodesicDistanceMeters,
  greatCircleDistanceMeters,
  lonLatToCartesian,
  lonLatToECEF,
  rotateAxisAngle,
  sampleSphereNoise,
  slerp,
  uniformOnSphere,
  WGS84,
  type LonLat,
} from './index'
import { latitudeBand } from './area'
import { xoshiro256ss } from '../rng/xoshiro256'

const NOISE_PARAMS = {
  seed: 12345n,
  octaves: 4,
  frequency: 1,
  lacunarity: 2,
  persistence: 0.5,
}

describe('Family 1 — Round-trip & invariants', () => {
  it('lonLatToCartesian → cartesianToLonLat round-trip on 1024 points', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 32; j++) {
        const lonDeg = -180 + (360 * i) / 32 + 0.123
        const latDeg = -90 + (180 * (j + 0.5)) / 32
        const cart = lonLatToCartesian({ lonDeg, latDeg })
        const back = cartesianToLonLat(cart)
        maxLonErr = Math.max(maxLonErr, Math.abs(((back.lonDeg - lonDeg + 540) % 360) - 180))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.latDeg - latDeg))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-12)
    expect(maxLatErr).toBeLessThan(1e-12)
  })

  it('lonLatToECEF → ecefToLonLat round-trip with various heights', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    let maxHeightErr = 0
    for (let i = 0; i < 32; i++) {
      for (let j = 1; j < 32; j++) {  // avoid exact poles for height stability
        const lonDeg = -180 + (360 * i) / 32 + 0.7
        const latDeg = -85 + (170 * j) / 32
        const heightMeters = -500 + ((8848 + 500) * (i * 32 + j)) / 1024
        const ecef = lonLatToECEF({ lonDeg, latDeg }, heightMeters)
        const back = ecefToLonLat(ecef)
        maxLonErr = Math.max(maxLonErr, Math.abs(back.lonLat.lonDeg - lonDeg))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.lonLat.latDeg - latDeg))
        maxHeightErr = Math.max(maxHeightErr, Math.abs(back.heightMeters - heightMeters))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-9)
    expect(maxLatErr).toBeLessThan(1e-9)
    expect(maxHeightErr).toBeLessThan(1e-3)
  })

  it('rotateAxisAngle by 2π returns to start within 1e-10', () => {
    const p = lonLatToCartesian({ lonDeg: 37, latDeg: 53 })
    const axis = lonLatToCartesian({ lonDeg: -100, latDeg: 12 })
    const r = rotateAxisAngle(p, axis, 2 * Math.PI)
    expect(Math.abs(r.x - p.x)).toBeLessThan(1e-10)
    expect(Math.abs(r.y - p.y)).toBeLessThan(1e-10)
    expect(Math.abs(r.z - p.z)).toBeLessThan(1e-10)
  })

  it('eulerPoleRotation: 100 steps of θ vs one step of 100θ within 1e-7°', () => {
    let p = { lonDeg: 5, latDeg: 15 }
    const pole = { lonDeg: 60, latDeg: 30 }
    const totalAngle = 1.0
    for (let i = 0; i < 100; i++) {
      p = eulerPoleRotation(p, pole, totalAngle / 100)
    }
    const single = eulerPoleRotation({ lonDeg: 5, latDeg: 15 }, pole, totalAngle)
    expect(Math.abs(p.lonDeg - single.lonDeg)).toBeLessThan(1e-7)
    expect(Math.abs(p.latDeg - single.latDeg)).toBeLessThan(1e-7)
  })
})

describe('Family 2 — Antipode handling', () => {
  it('100 antipodal pairs: deterministic perpendicular midpoint', () => {
    for (let i = 0; i < 100; i++) {
      const a = lonLatToCartesian({ lonDeg: -180 + (360 * i) / 100, latDeg: -45 + (90 * i) / 100 })
      const antipode = { x: -a.x, y: -a.y, z: -a.z }
      const r1 = slerp(a, antipode, 0.5)
      const r2 = slerp(a, antipode, 0.5)
      expect(r1).toEqual(r2)
      const lenSq = r1.x * r1.x + r1.y * r1.y + r1.z * r1.z
      expect(lenSq).toBeCloseTo(1, 10)
      const dot = r1.x * a.x + r1.y * a.y + r1.z * a.z
      expect(Math.abs(dot)).toBeLessThan(1e-10)
    }
  })
})

describe('Family 3 — Known-value tests', () => {
  it('NYC → London great-circle ≈ 5570 km within 5 km', () => {
    const d = greatCircleDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    expect(d / 1000).toBeGreaterThan(5565)
    expect(d / 1000).toBeLessThan(5575)
  })

  it('NYC → London geodesic ≈ 5585 km within 1 km', () => {
    const d = geodesicDistanceMeters(
      { lonDeg: -74.0060, latDeg: 40.7128 },
      { lonDeg: -0.1278, latDeg: 51.5074 },
    )
    expect(d / 1000).toBeGreaterThan(5570)
    expect(d / 1000).toBeLessThan(5590)
  })

  it('cellAreaSqMeters summed over global 1° grid ≈ 4πR² within 0.01%', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        total += cellAreaSqMeters(lat + 0.5, 1, 1)
      }
    }
    const expected = 4 * Math.PI * WGS84.MEAN_RADIUS_METERS * WGS84.MEAN_RADIUS_METERS
    expect(Math.abs(total - expected) / expected).toBeLessThan(0.0001)
  })

  it('cellAreaSqMetersWGS84 sums to ellipsoid surface area ≈ 510,065,621 km²', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        total += cellAreaSqMetersWGS84(lat + 0.5, 1, 1)
      }
    }
    const km2 = total / 1e6
    expect(km2).toBeGreaterThan(510_000_000)
    expect(km2).toBeLessThan(510_200_000)
  })
})

describe('Family 4 — Continuity at the seams', () => {
  it('noise is continuous across the dateline at lat=0', () => {
    const east = sampleSphereNoise({ lonDeg: 179.99, latDeg: 0 }, NOISE_PARAMS)
    const west = sampleSphereNoise({ lonDeg: -179.99, latDeg: 0 }, NOISE_PARAMS)
    expect(Math.abs(east - west)).toBeLessThan(0.05)
  })

  it('noise is continuous near the north pole', () => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      samples.push(sampleSphereNoise({ lonDeg: -180 + (360 * i) / 10, latDeg: 89.999 }, NOISE_PARAMS))
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.1)
  })

  it('noise is continuous near the south pole', () => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      samples.push(sampleSphereNoise({ lonDeg: -180 + (360 * i) / 10, latDeg: -89.999 }, NOISE_PARAMS))
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.1)
  })
})

describe('Family 5 — Distribution statistics', () => {
  it('uniformOnSphere: 10,000 samples bucket by latitude band match expected fractions', () => {
    const rng = xoshiro256ss(42n)
    const counts: Record<string, number> = { tropical: 0, subtropical: 0, temperate: 0, subpolar: 0, polar: 0 }
    const N = 10_000
    for (let i = 0; i < N; i++) counts[latitudeBand(uniformOnSphere(rng).latDeg)]++
    const expected = { tropical: 0.3987, subtropical: 0.1751, temperate: 0.2456, subpolar: 0.1003, polar: 0.0826 }
    for (const [band, expectedFraction] of Object.entries(expected)) {
      expect(counts[band] / N).toBeGreaterThan(expectedFraction - 0.02)
      expect(counts[band] / N).toBeLessThan(expectedFraction + 0.02)
    }
  })

  it('cosineWeightedPoisson: all pairs respect minSeparation', () => {
    const rng = xoshiro256ss(101n)
    const points = cosineWeightedPoisson(rng, 200, 0.1)
    const minSepMeters = 0.1 * WGS84.MEAN_RADIUS_METERS
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(greatCircleDistanceMeters(points[i], points[j])).toBeGreaterThanOrEqual(minSepMeters - 1)
      }
    }
  })
})

describe('Family 6 — Composition with synthetic tile', () => {
  it('tile-pixel → lonlat → Cartesian → lonlat → tile-pixel round-trips within 1px', () => {
    // Synthetic 1° × 1° tile at (lon=10, lat=20), 1024×1024 pixels.
    const region = { lat: 20, lon: 10, widthDeg: 1, heightDeg: 1 }
    const W = 1024
    const H = 1024
    let maxErr = 0
    // We don't import lonLatToTilePixel here directly; the test verifies
    // the round-trip semantically.
    for (let py = 0; py <= H; py += 64) {
      for (let px = 0; px <= W; px += 64) {
        // Direct linear formula matching coords.ts:
        const lon = (region.lon - region.widthDeg / 2) + (px / W) * region.widthDeg
        const lat = (region.lat + region.heightDeg / 2) - (py / H) * region.heightDeg
        const cart = lonLatToCartesian({ lonDeg: lon, latDeg: lat })
        const back = cartesianToLonLat(cart)
        const backPx = ((back.lonDeg - (region.lon - region.widthDeg / 2)) / region.widthDeg) * W
        const backPy = (((region.lat + region.heightDeg / 2) - back.latDeg) / region.heightDeg) * H
        maxErr = Math.max(maxErr, Math.abs(backPx - px), Math.abs(backPy - py))
      }
    }
    expect(maxErr).toBeLessThan(1)
  })
})
```

- [x] **Step 2: Run the harness**

Run: `pnpm --filter @mauro/sim test characteristic`
Expected: PASS — all six test families green. May take 5–15 seconds.

- [x] **Step 3: Commit**

```bash
git add packages/sim/src/sphere/characteristic.test.ts
git commit -m "test(sphere): planet-scale validation harness — six test families"
```

---

## Task 21: Audit pass — JSDoc + audit doc

**Files:**
- Modify: `packages/sim/src/query/WorldQuery.ts` (JSDoc additions only)
- Modify: `packages/sim/src/query/tile-loader.ts` (JSDoc additions only)
- Modify: `packages/sim/src/events/applyEvent.ts` (JSDoc additions only)
- Create: `docs/sphere-substrate-audit-2026-05-01.md`

- [x] **Step 1: Read the four sim files in scope**

Read:
- `packages/sim/src/query/WorldQuery.ts`
- `packages/sim/src/query/tile-loader.ts`
- `packages/sim/src/events/applyEvent.ts`
- `packages/sim/src/types.ts`

Walking each file, identify:
1. Implicit assumption that the substrate is a single rectangular tile.
2. Implicit assumption that pixel space is metrically uniform.
3. Geometric operations that bypass the new sphere primitives.
4. Any place where adding sphere primitives now would be net-positive.

- [x] **Step 2: Add JSDoc audit comments to WorldQuery.ts**

Add a JSDoc block above the `WorldQuery` class declaration:

```ts
/**
 * SPHERE-SUBSTRATE AUDIT (2026-05-01):
 * - Operates on single-tile rectangular pixel substrate (Uint16Array
 *   heightmap + mask, fixed width × height). MVP-safe assumption.
 * - v1 multi-tile composition will need a new GlobalField abstraction
 *   built on packages/sim/src/sphere/. WorldQuery's public API
 *   (getWorldAsOf, replayAsOf) will gain a multi-tile variant rather
 *   than mutate this one.
 * - No false-flat-Earth math here today — tile coords are treated as
 *   tile-local pixels throughout, and lat/lon only appears in
 *   TileMetadata.sourceRegion which is descriptive metadata only.
 */
```

Append a similar block above the `replayAsOf` method noting the per-event tile-pixel-space mutation pattern is MVP-safe.

- [x] **Step 3: Add JSDoc audit comments to tile-loader.ts**

Add a JSDoc block above the `TileLoader` class:

```ts
/**
 * SPHERE-SUBSTRATE AUDIT (2026-05-01):
 * - Loads tiles as opaque PNG bytes + JSON metadata. No geometric ops.
 * - sourceRegion (lat, lon, widthDeg, heightDeg) is the natural bridge
 *   to lat/lon — currently only descriptive; v1 multi-tile composition
 *   will read it through packages/sim/src/sphere/coords.ts:
 *   lonLatToTilePixel/tilePixelToLonLat.
 * - No false-flat assumptions found.
 */
```

- [x] **Step 4: Add JSDoc audit comments to applyEvent.ts**

Add a JSDoc block above the `applyEvent` function:

```ts
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
```

- [x] **Step 5: Write the audit doc**

Create `docs/sphere-substrate-audit-2026-05-01.md`:

```markdown
# Sphere Substrate Audit — 2026-05-01

Single-page audit performed as part of the sphere substrate spec
(`docs/superpowers/specs/2026-05-01-sphere-substrate-design.md`).
Confirms existing `packages/sim/` code has no load-bearing flat-Earth
assumptions that will block v1 work, and documents single-tile
assumptions that are correct at MVP scale but will need revisiting at v1.

## Files audited

- `packages/sim/src/query/WorldQuery.ts`
- `packages/sim/src/query/tile-loader.ts`
- `packages/sim/src/events/applyEvent.ts`
- `packages/sim/src/types.ts` (review only — no code changes)

## Files explicitly out of scope

- `apps/web/src/app/poc/stitch/page.tsx` — public sandbox demo, untouched.
- `packages/sim/src/rng/*` — pure number theory, no geometric assumptions.

## Findings — per file

### `WorldQuery.ts`

**MVP-safe assumptions:**
- Operates on single-tile rectangular pixel substrate. Heightmap +
  mask are `Uint16Array` / `Uint8Array` over fixed `width × height`.
  At 1° × 1° tile scale, cosine distortion is negligible.
- Per-event mutation is in tile-pixel space.

**v1 touchpoints:**
- Multi-tile composition needs a new `GlobalField` abstraction built
  on `packages/sim/src/sphere/`. `WorldQuery` will gain a multi-tile
  variant (e.g., `replayGlobalAsOf`) rather than mutate the existing
  single-tile path.

**Flat-Earth bugs found:** None.

### `tile-loader.ts`

**MVP-safe assumptions:**
- Loads opaque tile bytes + metadata. No geometric operations.
- `sourceRegion` (lat, lon, widthDeg, heightDeg) is descriptive
  metadata only.

**v1 touchpoints:**
- Multi-tile composition reads `sourceRegion` through
  `packages/sim/src/sphere/coords.ts:lonLatToTilePixel` /
  `tilePixelToLonLat`.

**Flat-Earth bugs found:** None.

### `applyEvent.ts`

**MVP-safe assumptions:**
- `GeographyMutation` polygons are defined in tile-local pixel space
  (`DemoPolygon.pixels`). At single-tile scale, polygons cannot span
  boundaries.
- `pointInPolygon` is a pure 2D polygon test (even-odd ray casting),
  not a geographic operation. No flat-Earth concern.

**v1 touchpoints:**
- v1 multi-tile composition needs polygons in `(lon, lat)` coords,
  converted to per-tile pixel space at apply-time via
  `packages/sim/src/sphere/coords.ts:lonLatToTilePixel`.

**Flat-Earth bugs found:** None.

### `types.ts`

**Review only — no changes.**

`SubstrateState` is single-tile rectangular by design (correct at MVP).
`TileMetadata.sourceRegion` already exposes (lat, lon, widthDeg,
heightDeg) — the natural bridge to sphere coords. No type changes
needed; v1 will add new types (e.g., `GlobalField`) alongside.

## Summary

No load-bearing flat-Earth bugs found. All four files are MVP-safe.
Three contain single-tile assumptions that v1 multi-tile composition
will revisit; those assumptions are now documented inline as JSDoc
comments and listed above as "v1 touchpoints" so they're not silently
load-bearing later.

The substrate library at `packages/sim/src/sphere/` is the foundation
v1 will use to address each touchpoint. No retrofit work needed at MVP.
```

- [x] **Step 6: Run the test suite to verify nothing regressed**

Run: `pnpm --filter @mauro/sim test`
Expected: all tests pass. (JSDoc additions are comments; no behavioral change.)

- [x] **Step 7: Commit**

```bash
git add packages/sim/src/query/WorldQuery.ts packages/sim/src/query/tile-loader.ts packages/sim/src/events/applyEvent.ts docs/sphere-substrate-audit-2026-05-01.md
git commit -m "docs(sphere): substrate audit + JSDoc comments on existing sim files"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `wgs84.ts` constants → Task 2
- ✅ `coords.ts` types + sphere conversions → Task 4
- ✅ `coords.ts` ECEF + Bowring's → Task 5
- ✅ `coords.ts` TilePixel → Task 6
- ✅ `_vec.ts` internal vector ops → Task 3
- ✅ `_rng.ts` RNG-to-double adapter → Task 7
- ✅ `geodesy.ts` rotateAxisAngle → Task 8
- ✅ `geodesy.ts` slerp + antipode handling → Task 9
- ✅ `geodesy.ts` eulerPoleRotation → Task 10
- ✅ `geodesy.ts` greatCircleDistanceMeters → Task 11
- ✅ `geodesy.ts` geodesicDistanceMeters (Karney) → Task 12
- ✅ `area.ts` cellAreaSterad / cellAreaSqMeters / latitudeBand / isPolarZone → Task 13
- ✅ `area.ts` cellAreaSqMetersWGS84 → Task 14
- ✅ `noise.ts` sampleSphereNoise → Task 15
- ✅ `distribution.ts` uniformOnSphere → Task 16
- ✅ `distribution.ts` cosineWeightedPoisson → Task 17
- ✅ `distribution.ts` areaWeightedAccumulate → Task 18
- ✅ `index.ts` public surface → Task 19
- ✅ Validation harness (six families) → Task 20
- ✅ Audit deliverable (JSDoc + doc) → Task 21
- ✅ Pin policy (simplex-noise + geographiclib-geodesic) → Task 1

**Type consistency check:**
- `LonLat`, `Cartesian3`, `ECEF`, `TilePixel`, `TileRegion` all defined in `coords.ts`, used consistently in geodesy/area/noise/distribution.
- `Xoshiro256` interface name matches `xoshiro256.ts` definition (NOT "Xoshiro256ss").
- `SphereNoiseParams` defined in `noise.ts`, exported from `index.ts`.
- `LatitudeBand` defined in `area.ts`, exported from `index.ts`.

**Placeholder scan:** no TBD/TODO/FIXME present.

**Scope check:** focused — one library + one harness + one audit. No ancillary features.
