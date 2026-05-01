import { describe, expect, it } from 'vitest'
import {
  cartesianToLonLat,
  clampLat,
  ecefToLonLat,
  lonLatToCartesian,
  lonLatToECEF,
  normalizeLon,
  type Cartesian3,
  type ECEF,
  type LonLat,
} from './coords'

describe('LonLat ↔ unit-sphere Cartesian conversions', () => {
  it('maps (0, 0) to (1, 0, 0) — equator at prime meridian', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 0 })
    expect(c.x).toBeCloseTo(1, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (90, 0) to (0, 1, 0) — equator at +90° lon', () => {
    const c = lonLatToCartesian({ lonDeg: 90, latDeg: 0 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(1, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (0, 90) to (0, 0, 1) — north pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 90 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(1, 12)
  })

  it('maps (0, -90) to (0, 0, -1) — south pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: -90 })
    expect(c.z).toBeCloseTo(-1, 12)
  })

  it('round-trips 1000 random points within 1e-12 degrees', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 32; j++) {
        const lonDeg = -180 + (360 * i) / 32 + 0.123
        const latDeg = -90 + (180 * (j + 0.5)) / 32
        const c = lonLatToCartesian({ lonDeg, latDeg })
        const back = cartesianToLonLat(c)
        maxLonErr = Math.max(maxLonErr, Math.abs(normalizeLon(back.lonDeg - lonDeg)))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.latDeg - latDeg))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-12)
    expect(maxLatErr).toBeLessThan(1e-12)
  })

  it('produces unit-length Cartesian vectors for any LonLat', () => {
    const samples: LonLat[] = [
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: -73.5, latDeg: 40.7 },
      { lonDeg: 179.99, latDeg: 89.99 },
      { lonDeg: -179.99, latDeg: -89.99 },
    ]
    for (const ll of samples) {
      const c = lonLatToCartesian(ll)
      const lengthSq = c.x * c.x + c.y * c.y + c.z * c.z
      expect(lengthSq).toBeCloseTo(1, 12)
    }
  })
})

describe('normalizeLon', () => {
  it('returns input unchanged when already in [-180, 180)', () => {
    expect(normalizeLon(0)).toBe(0)
    expect(normalizeLon(-180)).toBe(-180)
    expect(normalizeLon(179.999)).toBe(179.999)
  })

  it('wraps +180 to -180 (canonical wrap point)', () => {
    expect(normalizeLon(180)).toBe(-180)
  })

  it('wraps values just past +180 back into range', () => {
    expect(normalizeLon(180.0001)).toBeCloseTo(-179.9999, 10)
  })

  it('wraps values just past -180 back into range', () => {
    expect(normalizeLon(-180.0001)).toBeCloseTo(179.9999, 10)
  })

  it('handles multi-revolution inputs', () => {
    expect(normalizeLon(720)).toBe(0)
    expect(normalizeLon(-540)).toBe(-180)
  })
})

describe('clampLat', () => {
  it('returns input unchanged when in [-90, 90]', () => {
    expect(clampLat(0)).toBe(0)
    expect(clampLat(90)).toBe(90)
    expect(clampLat(-90)).toBe(-90)
  })

  it('clamps values above +90', () => {
    expect(clampLat(90.001)).toBe(90)
    expect(clampLat(180)).toBe(90)
  })

  it('clamps values below -90', () => {
    expect(clampLat(-90.001)).toBe(-90)
  })
})

describe('LonLat ↔ ECEF (WGS84) conversions', () => {
  it('maps (0, 0) at h=0 to (A, 0, 0) — equator at prime meridian', () => {
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 0 })
    expect(e.x).toBeCloseTo(6378137.0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(0, 3)
  })

  it('maps (0, 90) at h=0 to (0, 0, B) — north pole', () => {
    // B = A(1-F) ≈ 6356752.3
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 90 })
    expect(e.x).toBeCloseTo(0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(6356752.3142, 2)
  })

  it('round-trips 100 lat-lon points + heights from -500 to +8848 m', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    let maxHeightErr = 0
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const lonDeg = -180 + (360 * i) / 10 + 0.7
        const latDeg = -85 + (170 * j) / 10
        const heightMeters = -500 + (8848 + 500) * (i + j) / 20
        const e = lonLatToECEF({ lonDeg, latDeg }, heightMeters)
        const back = ecefToLonLat(e)
        maxLonErr = Math.max(maxLonErr, Math.abs(back.lonLat.lonDeg - lonDeg))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.lonLat.latDeg - latDeg))
        maxHeightErr = Math.max(maxHeightErr, Math.abs(back.heightMeters - heightMeters))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-9)
    expect(maxLatErr).toBeLessThan(1e-9)
    expect(maxHeightErr).toBeLessThan(1e-3)
  })
})
