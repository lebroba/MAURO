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
