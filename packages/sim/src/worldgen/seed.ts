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
