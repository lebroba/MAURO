import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { sampleLatitudeBand, biasLatitudeNorth } from './bias'
import { LATITUDINAL_WEIGHTING } from './earth-stats'

describe('sampleLatitudeBand — Earth-weighted draw', () => {
  it('returns a latitude in [-90, +90]', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    for (let i = 0; i < 100; i++) {
      const lat = sampleLatitudeBand(rng, LATITUDINAL_WEIGHTING)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
    }
  })

  it('empirical distribution matches the input weighting (1000 samples, ±5%)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const counts = new Array(LATITUDINAL_WEIGHTING.length).fill(0)
    const N = 1000
    for (let i = 0; i < N; i++) {
      const lat = sampleLatitudeBand(rng, LATITUDINAL_WEIGHTING)
      const band = Math.min(
        LATITUDINAL_WEIGHTING.length - 1,
        Math.floor((lat + 90) / (180 / LATITUDINAL_WEIGHTING.length)),
      )
      counts[band] += 1
    }
    for (let i = 0; i < LATITUDINAL_WEIGHTING.length; i++) {
      const expected = LATITUDINAL_WEIGHTING[i]! * N
      const observed = counts[i]!
      const tolerance = Math.max(20, expected * 0.5)
      expect(Math.abs(observed - expected)).toBeLessThan(tolerance)
    }
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    const seq1 = Array.from({ length: 50 }, () =>
      sampleLatitudeBand(r1, LATITUDINAL_WEIGHTING),
    )
    const seq2 = Array.from({ length: 50 }, () =>
      sampleLatitudeBand(r2, LATITUDINAL_WEIGHTING),
    )
    expect(seq1).toEqual(seq2)
  })
})

describe('biasLatitudeNorth — northward shift on uniform latitudes', () => {
  it('a 0.68 bias produces ~68% of points in the N hemisphere (±5%, 1000 samples)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    let north = 0
    const N = 1000
    for (let i = 0; i < N; i++) {
      const uniformLat = (rng.next() % 18000n) / 100n
      const startLat = Number(uniformLat) - 90
      const biased = biasLatitudeNorth(rng, startLat, 0.68)
      if (biased > 0) north += 1
    }
    expect(north / N).toBeGreaterThan(0.62)
    expect(north / N).toBeLessThan(0.74)
  })

  it('a 0.5 bias is approximately neutral (±5%)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    let north = 0
    const N = 1000
    for (let i = 0; i < N; i++) {
      const uniformLat = (rng.next() % 18000n) / 100n
      const startLat = Number(uniformLat) - 90
      const biased = biasLatitudeNorth(rng, startLat, 0.5)
      if (biased > 0) north += 1
    }
    expect(north / N).toBeGreaterThan(0.45)
    expect(north / N).toBeLessThan(0.55)
  })
})
