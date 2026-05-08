import type { Xoshiro256 } from '../rng/xoshiro256'

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
