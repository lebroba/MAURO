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
