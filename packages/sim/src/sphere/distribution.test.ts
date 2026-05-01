import { describe, expect, it } from 'vitest'
import { uniformOnSphere } from './distribution'
import { xoshiro256ss } from '../rng/xoshiro256'
import { latitudeBand } from './area'

describe('uniformOnSphere', () => {
  it('returns a deterministic sequence from a fixed seed', () => {
    const rng1 = xoshiro256ss(42n)
    const rng2 = xoshiro256ss(42n)
    for (let i = 0; i < 10; i++) {
      const a = uniformOnSphere(rng1)
      const b = uniformOnSphere(rng2)
      expect(a.lonDeg).toBe(b.lonDeg)
      expect(a.latDeg).toBe(b.latDeg)
    }
  })

  it('produces lon values in [-180, 180) and lat values in [-90, 90]', () => {
    const rng = xoshiro256ss(1n)
    for (let i = 0; i < 1000; i++) {
      const p = uniformOnSphere(rng)
      expect(p.lonDeg).toBeGreaterThanOrEqual(-180)
      expect(p.lonDeg).toBeLessThan(180)
      expect(p.latDeg).toBeGreaterThanOrEqual(-90)
      expect(p.latDeg).toBeLessThanOrEqual(90)
    }
  })

  it('does NOT cluster at the poles (rule 10d) — area-weighted distribution is uniform', () => {
    // 10,000 samples partitioned by climatological band. The fraction in
    // each band should approximately match that band's share of total
    // surface area on the sphere.
    const rng = xoshiro256ss(7n)
    const counts: Record<string, number> = { tropical: 0, subtropical: 0, temperate: 0, subpolar: 0, polar: 0 }
    const N = 10_000
    for (let i = 0; i < N; i++) {
      counts[latitudeBand(uniformOnSphere(rng).latDeg)]++
    }
    // Expected fractions (band area ÷ sphere area):
    //   tropical:    sin(23.5°) − sin(0°) doubled  ≈ 0.3987 (39.9%)
    //   subtropical: sin(35°) − sin(23.5°) doubled ≈ 0.1751 (17.5%)
    //   temperate:   sin(55°) − sin(35°) doubled   ≈ 0.2456 (24.6%)
    //   subpolar:    sin(66.5°) − sin(55°) doubled ≈ 0.1003 (10.0%)
    //   polar:       1 − sin(66.5°) doubled        ≈ 0.0826 (8.3%)
    const expected: Record<string, number> = {
      tropical: 0.3987,
      subtropical: 0.1751,
      temperate: 0.2456,
      subpolar: 0.1003,
      polar: 0.0826,
    }
    for (const [band, expectedFraction] of Object.entries(expected)) {
      const actualFraction = counts[band] / N
      // ±0.02 tolerance — about 2σ for binomial with N=10,000.
      expect(actualFraction).toBeGreaterThan(expectedFraction - 0.02)
      expect(actualFraction).toBeLessThan(expectedFraction + 0.02)
    }
  })
})
