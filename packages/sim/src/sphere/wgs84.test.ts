import { describe, expect, it } from 'vitest'
import { WGS84 } from './wgs84'

describe('WGS84 constants', () => {
  it('exposes the canonical equatorial radius in meters', () => {
    expect(WGS84.A_METERS).toBe(6378137.0)
  })

  it('exposes the canonical flattening', () => {
    expect(WGS84.F).toBe(1 / 298.257223563)
  })

  it('derives the polar radius B = A * (1 - F) within float precision', () => {
    const expected = 6378137.0 * (1 - 1 / 298.257223563)
    expect(WGS84.B_METERS).toBeCloseTo(expected, 6)
    // Sanity: about 6356752.3 m
    expect(WGS84.B_METERS).toBeGreaterThan(6356752)
    expect(WGS84.B_METERS).toBeLessThan(6356753)
  })

  it('derives first eccentricity squared E2 = 2F - F^2', () => {
    const f = 1 / 298.257223563
    expect(WGS84.E2).toBeCloseTo(2 * f - f * f, 12)
  })

  it('derives second eccentricity squared E_PRIME2 = E2 / (1 - E2)', () => {
    expect(WGS84.E_PRIME2).toBeCloseTo(WGS84.E2 / (1 - WGS84.E2), 12)
  })

  it('exposes the WGS84 mean radius (used as default for sphere math)', () => {
    expect(WGS84.MEAN_RADIUS_METERS).toBe(6371008.8)
  })
})
