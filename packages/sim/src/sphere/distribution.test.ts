import { describe, expect, it } from 'vitest'
import { uniformOnSphere, cosineWeightedPoisson } from './distribution'
import { xoshiro256ss } from '../rng/xoshiro256'
import { latitudeBand } from './area'
import { greatCircleDistanceMeters } from './geodesy'
import { WGS84 } from './wgs84'

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

describe('cosineWeightedPoisson', () => {
  it('returns the requested number of points (or fewer if dart-throwing fails)', () => {
    const rng = xoshiro256ss(13n)
    const points = cosineWeightedPoisson(rng, 50, 0.05)
    expect(points.length).toBeGreaterThan(0)
    expect(points.length).toBeLessThanOrEqual(50)
  })

  it('all pairs respect the minimum great-circle separation', () => {
    const rng = xoshiro256ss(13n)
    const minSepRad = 0.1
    const points = cosineWeightedPoisson(rng, 100, minSepRad)
    const minSepMeters = minSepRad * WGS84.MEAN_RADIUS_METERS
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = greatCircleDistanceMeters(points[i], points[j])
        expect(d).toBeGreaterThanOrEqual(minSepMeters - 1)  // -1 m tolerance for float
      }
    }
  })

  it('produces a deterministic sequence from a fixed seed', () => {
    const rng1 = xoshiro256ss(99n)
    const rng2 = xoshiro256ss(99n)
    const a = cosineWeightedPoisson(rng1, 20, 0.1)
    const b = cosineWeightedPoisson(rng2, 20, 0.1)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].lonDeg).toBe(b[i].lonDeg)
      expect(a[i].latDeg).toBe(b[i].latDeg)
    }
  })

  it('caps at a fail budget for over-dense parameters (no infinite loop)', () => {
    // Asking for 1000 points with min separation that allows < 100 will
    // exhaust the dart-throwing budget without infinite-looping.
    const rng = xoshiro256ss(5n)
    const start = Date.now()
    const points = cosineWeightedPoisson(rng, 1000, 1.0)  // huge minSep
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(2000)  // bounded — fail-budget worked
    expect(points.length).toBeLessThan(50)  // sparse result, that's fine
  })
})
