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
