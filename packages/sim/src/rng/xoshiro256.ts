import { splitmix64 } from './splitmix64'

// xoshiro256** — Sebastiano Vigna's algorithm, public-domain reference at
// https://prng.di.unimi.it/xoshiro256starstar.c.
//
// 256-bit internal state, period 2^256-1, passes BigCrush. The "starstar"
// scrambler (rotl(s1*5, 7) * 9) gives high-bit and low-bit equidistribution.
//
// MAURO uses xoshiro256** as the per-stage RNG for procgen and the rules
// engine reducer. Stage-seed derivation comes from splitmix64 (the canonical
// Vigna pairing). The determinism contract (Architecture Principle #4) requires
// byte-identical output across runs and architectures — the BigInt arithmetic
// here doesn't depend on platform word size, so the contract is preserved.
//
// Carry-forward note: the original project_aria implementation was Rust;
// this is a clean TypeScript port matching the same Vigna reference algorithm.

const MASK_64 = (1n << 64n) - 1n

function rotl64(x: bigint, k: bigint): bigint {
  // Rotate-left for 64-bit unsigned. BigInt arithmetic doesn't overflow on its
  // own; we mask both halves explicitly.
  return (((x << k) & MASK_64) | (x >> (64n - k))) & MASK_64
}

export interface Xoshiro256 {
  /** Returns the next 64-bit pseudo-random unsigned integer. */
  next(): bigint
}

function makeRng(s0: bigint, s1: bigint, s2: bigint, s3: bigint): Xoshiro256 {
  // Closure-captured state. Each instance owns its own state — no shared
  // global state, so two RNGs constructed from the same seed are byte-identical
  // and a sequence pulled from one cannot affect another.
  let _s0 = s0 & MASK_64
  let _s1 = s1 & MASK_64
  let _s2 = s2 & MASK_64
  let _s3 = s3 & MASK_64

  return {
    next(): bigint {
      const result = (rotl64((_s1 * 5n) & MASK_64, 7n) * 9n) & MASK_64
      const t = (_s1 << 17n) & MASK_64

      _s2 ^= _s0
      _s3 ^= _s1
      _s1 ^= _s2
      _s0 ^= _s3

      _s2 ^= t

      _s3 = rotl64(_s3, 45n)

      return result
    },
  }
}

/**
 * Construct a xoshiro256** RNG seeded from a single 64-bit value.
 *
 * The seed is expanded into the full 256-bit state via four consecutive calls
 * to splitmix64. This is the recommended pairing per Vigna — splitmix64's
 * mixing avalanches sparse seeds (e.g., seed=1) into well-distributed state.
 */
export function xoshiro256ss(seed: bigint): Xoshiro256 {
  const sm = splitmix64(seed)
  return makeRng(sm(), sm(), sm(), sm())
}

/**
 * Construct a xoshiro256** RNG from explicit 256-bit state.
 *
 * Useful for:
 *   - Validating against published reference vectors that fix initial state.
 *   - Resuming an RNG from a serialized state snapshot.
 *   - Parallel-stream determinism (jump-ahead patterns derive new states).
 *
 * Throws if all four state words are zero — that is a known degenerate
 * fixed-point of the algorithm that would produce zeros forever.
 */
export function xoshiro256ssFromState(
  s0: bigint,
  s1: bigint,
  s2: bigint,
  s3: bigint,
): Xoshiro256 {
  const m0 = s0 & MASK_64
  const m1 = s1 & MASK_64
  const m2 = s2 & MASK_64
  const m3 = s3 & MASK_64
  if (m0 === 0n && m1 === 0n && m2 === 0n && m3 === 0n) {
    throw new Error(
      'xoshiro256ssFromState: state cannot be all zeros (algorithmic fixed point)',
    )
  }
  return makeRng(m0, m1, m2, m3)
}
