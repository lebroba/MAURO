// Sphere-aware random placement primitives.
//
// All functions take an explicit Xoshiro256 — never own RNG state.
// Determinism flows through the caller; no global state.

import type { Xoshiro256 } from '../rng/xoshiro256'
import { nextDouble } from './_rng'
import type { LonLat } from './coords'
import { greatCircleDistanceMeters } from './geodesy'
import { WGS84 } from './wgs84'

/**
 * Sample a single point uniformly distributed on the unit sphere.
 * Uses the (2π·u, asin(2v − 1)) formula — correct uniform-on-sphere.
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
