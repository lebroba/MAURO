import type { Continent, WorldGeneratedPayload } from '../types'
import type { Xoshiro256 } from '../rng/xoshiro256'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { uniformOnSphere } from '../sphere/distribution'
import type { LonLat } from '../sphere/coords'
import {
  CONTINENT_COUNT_DISTRIBUTION,
  HEMISPHERIC_BIAS_NORTH,
  LAND_COVERAGE_FRACTION,
  SIZE_DISTRIBUTION_ALPHA,
  COASTLINE_COMPLEXITY_RANGE,
} from './earth-stats'
import { mixSeedString, encodeSeedHex } from './seed'
import { biasLatitudeNorth } from './bias'
import { sphericalVoronoi, cellCentroids } from './voronoi'
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
  ring: ReadonlyArray<readonly [number, number]>,
  shrinkFactor: number,
): Array<[number, number]> {
  const n = ring.length - 1 // closed
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    cx += ring[i]![0]
    cy += ring[i]![1]
  }
  cx /= n
  cy /= n
  return ring.map(([x, y]) => [cx + (x - cx) * shrinkFactor, cy + (y - cy) * shrinkFactor] as [number, number])
}

/**
 * Lloyd Relaxation: iteratively move each seed to the centroid of its cell.
 * After ~3 iterations, seed points are uniformly distributed (blue noise),
 * producing more even-sized continents and more regular cell shapes
 * (fewer pathological slivers). Per `docs/Creating SVG Continent Shapes.md`.
 *
 * Uses the lightweight cellCentroids path (skips K-NN boundary extraction)
 * since each Lloyd iteration only needs centroids — boundaries are wasted
 * work as we re-tessellate next iteration.
 */
function relaxSeeds(seeds: LonLat[], iterations: number): LonLat[] {
  let current = seeds
  for (let iter = 0; iter < iterations; iter++) {
    current = cellCentroids(current)
  }
  return current
}

/** Approximate (lon, lat) polygon area in deg² (planar approximation —
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
  const seedPoints: LonLat[] = []
  for (let i = 0; i < count; i++) {
    const p = uniformOnSphere(placeRng)
    seedPoints.push({
      lonDeg: p.lonDeg,
      latDeg: biasLatitudeNorth(placeRng, p.latDeg, HEMISPHERIC_BIAS_NORTH),
    })
  }

  // 3. Lloyd Relaxation: 3 iterations for blue-noise distribution before
  // the final Voronoi tessellation. Produces more even-sized continents.
  // Lloyd uniformizes globally; we re-apply the N-hemisphere bias afterward
  // so blue-noise spacing is preserved while seeds keep the Earth-derived
  // northern skew.
  const biasRng = stage(0x250n)
  const relaxedSeeds = relaxSeeds(seedPoints, 3).map((s) => ({
    lonDeg: s.lonDeg,
    latDeg: biasLatitudeNorth(biasRng, s.latDeg, HEMISPHERIC_BIAS_NORTH),
  }))

  // Voronoi tessellation — one polygon per seed.
  const cells = sphericalVoronoi(relaxedSeeds)

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
  const continents: Continent[] = fractalized.map((ring) => ({
    id: encodeSeedHex([idRng.next(), idRng.next(), idRng.next(), idRng.next()]).slice(0, 36),
    name: generatePlaceholderName(labelRng),
    color: pickContinentColor(labelRng),
    polygon: { type: 'Polygon', coordinates: [ring] },
  }))

  return { seed: seedHex, continents }
}
