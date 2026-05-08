import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { samplePareto, allocateLandShares } from './pareto'

describe('samplePareto', () => {
  it('returns values >= 1 (Pareto support is [x_min, ∞), x_min=1)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    for (let i = 0; i < 100; i++) {
      const v = samplePareto(rng, 1.4)
      expect(v).toBeGreaterThanOrEqual(1.0)
    }
  })

  it('larger α produces less skewed distributions (median lower)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const samplesAlpha1 = Array.from({ length: 1000 }, () => samplePareto(rng, 1.0))
    const samplesAlpha3 = Array.from({ length: 1000 }, () => samplePareto(rng, 3.0))
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    expect(median(samplesAlpha3)).toBeLessThan(median(samplesAlpha1))
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    const a = Array.from({ length: 50 }, () => samplePareto(r1, 1.4))
    const b = Array.from({ length: 50 }, () => samplePareto(r2, 1.4))
    expect(a).toEqual(b)
  })
})

describe('allocateLandShares', () => {
  it('returns N values that sum to totalLand (within float epsilon)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const shares = allocateLandShares(rng, 6, 0.29 * 4 * Math.PI, 1.4)
    expect(shares).toHaveLength(6)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(0.29 * 4 * Math.PI, 6)
  })

  it('produces a Pareto-shaped distribution: max is several times median', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const shares = allocateLandShares(rng, 7, 1.0, 1.4).sort((a, b) => b - a)
    expect(shares[0]!).toBeGreaterThan(2 * shares[Math.floor(shares.length / 2)]!)
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    const a = allocateLandShares(r1, 6, 1.0, 1.4)
    const b = allocateLandShares(r2, 6, 1.0, 1.4)
    expect(a).toEqual(b)
  })
})
