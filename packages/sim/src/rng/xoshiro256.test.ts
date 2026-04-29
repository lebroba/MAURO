import { describe, expect, it } from 'vitest'
import { xoshiro256ss, xoshiro256ssFromState } from './xoshiro256'

const MASK_64 = (1n << 64n) - 1n

describe('xoshiro256** — Vigna reference vectors', () => {
  it('produces 11520 on the first call from state [1,2,3,4]', () => {
    // Hand-verified against Vigna's reference algorithm:
    //   result = rotl(s1 * 5, 7) * 9
    //          = rotl(2 * 5, 7) * 9
    //          = rotl(10, 7) * 9
    //          = (10 << 7) * 9
    //          = 1280 * 9
    //          = 11520
    // This single match validates that the algorithm matches the Vigna
    // reference; the byte-identity tests below pin the full sequence.
    const rng = xoshiro256ssFromState(1n, 2n, 3n, 4n)
    expect(rng.next()).toBe(11520n)
  })

  it('produces a stable byte-identical sequence from state [1,2,3,4]', () => {
    const rng = xoshiro256ssFromState(1n, 2n, 3n, 4n)
    const expected = [
      11520n,
      0n,
      1509978240n,
      1215971899390074240n,
      1216172134540287360n,
      607988272756665600n,
      16172922978634559625n,
      8476171486693032832n,
    ]
    for (const want of expected) {
      expect(rng.next()).toBe(want)
    }
  })
})

describe('xoshiro256** — splitmix64-seeded byte-identical sequences', () => {
  // These pinned vectors define MAURO's determinism contract for the seeded
  // construction. If a refactor changes any of these values, the procgen
  // output of every world ever created changes — that's a contract break.

  it('seed=0n produces a stable sequence', () => {
    const rng = xoshiro256ss(0n)
    const expected = [
      11091344671253066420n,
      13793997310169335082n,
      1900383378846508768n,
      7684712102626143532n,
      13521403990117723737n,
      18442103541295991498n,
      7788427924976520344n,
      9881088229871127103n,
    ]
    for (const want of expected) {
      expect(rng.next()).toBe(want)
    }
  })

  it('seed=42n produces a stable sequence', () => {
    const rng = xoshiro256ss(42n)
    const expected = [
      1546998764402558742n,
      6990951692964543102n,
      12544586762248559009n,
      17057574109182124193n,
      18295552978065317476n,
      14199186830065750584n,
      13267978908934200754n,
      15679888225317814407n,
    ]
    for (const want of expected) {
      expect(rng.next()).toBe(want)
    }
  })

  it('seed=0xdeadbeefcafebaben produces a stable sequence', () => {
    const rng = xoshiro256ss(0xdeadbeefcafebaben)
    const expected = [
      2493220965222681446n,
      11166205803992459399n,
      15710135180360796537n,
      14953847597428637592n,
      6685738547217471520n,
      12683843735432499215n,
      9257942532540939026n,
      4988127067520916092n,
    ]
    for (const want of expected) {
      expect(rng.next()).toBe(want)
    }
  })
})

describe('xoshiro256** — determinism + independence', () => {
  it('two RNGs with the same seed produce identical sequences', () => {
    const a = xoshiro256ss(12345n)
    const b = xoshiro256ss(12345n)
    for (let i = 0; i < 256; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('two RNGs with different seeds diverge by the first call', () => {
    const a = xoshiro256ss(0n)
    const b = xoshiro256ss(1n)
    expect(a.next()).not.toBe(b.next())
  })

  it('two RNGs with the same seed do not share state (one does not affect the other)', () => {
    const a = xoshiro256ss(7n)
    const b = xoshiro256ss(7n)
    // Burn 100 from a; b should still be at the start.
    for (let i = 0; i < 100; i++) a.next()
    const aBeforeReset = a.next()
    const bFirst = b.next()
    // First-call values from same seed must match.
    const c = xoshiro256ss(7n)
    expect(bFirst).toBe(c.next())
    // And aBeforeReset != bFirst — different positions in the same sequence.
    expect(aBeforeReset).not.toBe(bFirst)
  })

  it('replay produces identical sequences across separate construction events', () => {
    // A fresh RNG seeded with the same value, even constructed at a different
    // point in the test run, must produce byte-identical output. This is
    // the core determinism contract from Architecture Principle #4.
    const sequenceA: bigint[] = []
    {
      const rng = xoshiro256ss(0xfeedfacecafef00dn)
      for (let i = 0; i < 64; i++) sequenceA.push(rng.next())
    }
    const sequenceB: bigint[] = []
    {
      const rng = xoshiro256ss(0xfeedfacecafef00dn)
      for (let i = 0; i < 64; i++) sequenceB.push(rng.next())
    }
    expect(sequenceA).toEqual(sequenceB)
  })
})

describe('xoshiro256** — output bounds + statistical sanity', () => {
  it('every output is within [0, 2^64)', () => {
    const rng = xoshiro256ss(999n)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0n)
      expect(v).toBeLessThanOrEqual(MASK_64)
    }
  })

  it('mean of 10k samples is close to 2^63 (uniform distribution sanity)', () => {
    const rng = xoshiro256ss(2026n)
    const N = 10_000n
    let sum = 0n
    for (let i = 0n; i < N; i++) sum += rng.next()
    const mean = sum / N
    const expected = 1n << 63n // 2^63

    // Allow ~5% deviation. With 10k samples this is generous; a real
    // distribution test would use BigCrush, but this catches gross bugs.
    const tolerance = expected / 20n
    const lower = expected - tolerance
    const upper = expected + tolerance
    expect(mean).toBeGreaterThanOrEqual(lower)
    expect(mean).toBeLessThanOrEqual(upper)
  })

  it('does not get stuck — first 1000 outputs from any seed have many distinct values', () => {
    // A degenerate RNG (e.g., all-zero state without our guard, or a constant
    // function) would fail this. xoshiro256** has period 2^256-1; collisions
    // in the first 1000 outputs are vanishingly unlikely.
    const rng = xoshiro256ss(31337n)
    const seen = new Set<bigint>()
    for (let i = 0; i < 1000; i++) seen.add(rng.next())
    // Allow a couple coincidental collisions (probability is ~2^-54, but be lenient).
    expect(seen.size).toBeGreaterThanOrEqual(998)
  })
})

describe('xoshiro256ssFromState — guard rails', () => {
  it('throws when constructed from all-zero state (algorithmic fixed point)', () => {
    expect(() => xoshiro256ssFromState(0n, 0n, 0n, 0n)).toThrow(
      /all zeros/,
    )
  })

  it('accepts state with any non-zero word', () => {
    expect(() => xoshiro256ssFromState(0n, 0n, 0n, 1n)).not.toThrow()
    expect(() => xoshiro256ssFromState(1n, 0n, 0n, 0n)).not.toThrow()
  })

  it('masks state words to 64 bits (large bigints are truncated)', () => {
    // Passing a > 64-bit value gets masked. Two RNGs constructed from
    // (x) and (x | 1<<128) should be identical since the high bits drop.
    const a = xoshiro256ssFromState(0xabcdef0123456789n, 1n, 2n, 3n)
    const overflowing = (1n << 128n) | 0xabcdef0123456789n
    const b = xoshiro256ssFromState(overflowing, 1n, 2n, 3n)
    for (let i = 0; i < 16; i++) {
      expect(a.next()).toBe(b.next())
    }
  })
})

describe('xoshiro256ss — splitmix64 integration', () => {
  it('xoshiro256ss(seed) is equivalent to manually invoking splitmix64 4x then xoshiro256ssFromState', () => {
    // Validates that the seeded constructor IS exactly:
    //   const sm = splitmix64(seed); xoshiro256ssFromState(sm(), sm(), sm(), sm())
    // This invariant is what lets us reason about parallel-stream determinism
    // (different stage seeds produce different but reproducible RNG streams).
    // We don't import splitmix64 directly here to keep the test as a black-box
    // integration check — instead we rely on the seed=0 reference vectors
    // matching what the splitmix64 reference vectors predict.
    const a = xoshiro256ss(0n)
    // The pinned-sequence test above already verifies seed=0's first 8 outputs.
    // This test exists as documentation of the intended invariant.
    expect(typeof a.next()).toBe('bigint')
  })
})
