import { describe, expect, it } from 'vitest'
import {
  cellAreaSqMeters,
  cellAreaSterad,
  isPolarZone,
  latitudeBand,
  type LatitudeBand,
} from './area'
import { WGS84 } from './wgs84'

describe('cellAreaSterad', () => {
  it('returns 0 for a degenerate cell (zero width)', () => {
    expect(cellAreaSterad(0, 1, 0)).toBeCloseTo(0, 12)
    expect(cellAreaSterad(0, 0, 1)).toBeCloseTo(0, 12)
  })

  it('returns the same area for symmetric cells north and south of the equator', () => {
    const north = cellAreaSterad(45, 1, 1)
    const south = cellAreaSterad(-45, 1, 1)
    expect(north).toBeCloseTo(south, 12)
  })

  it('cells near the equator have larger area than cells near the poles', () => {
    const equator = cellAreaSterad(0, 1, 1)
    const polar = cellAreaSterad(85, 1, 1)
    expect(equator).toBeGreaterThan(polar * 5)
  })

  it('summed over a 1° global grid totals 4π steradians within 0.01%', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        // Cell centered at (lat + 0.5, lon + 0.5), extent (1°, 1°).
        total += cellAreaSterad(lat + 0.5, 1, 1)
      }
    }
    const expected = 4 * Math.PI
    const relativeError = Math.abs(total - expected) / expected
    expect(relativeError).toBeLessThan(0.0001)
  })
})

describe('cellAreaSqMeters', () => {
  it('summed over a 1° grid with default radius equals 4π R² within 0.01%', () => {
    let total = 0
    for (let lat = -90; lat < 90; lat++) {
      for (let lon = -180; lon < 180; lon++) {
        total += cellAreaSqMeters(lat + 0.5, 1, 1)
      }
    }
    const R = WGS84.MEAN_RADIUS_METERS
    const expected = 4 * Math.PI * R * R
    const relativeError = Math.abs(total - expected) / expected
    expect(relativeError).toBeLessThan(0.0001)
  })

  it('respects custom radius', () => {
    const a = cellAreaSqMeters(0, 1, 1, 1000)
    const b = cellAreaSqMeters(0, 1, 1, 2000)
    expect(b / a).toBeCloseTo(4, 9)  // area scales as R²
  })
})

describe('latitudeBand', () => {
  it('classifies the equator as tropical', () => {
    expect(latitudeBand(0)).toBe<LatitudeBand>('tropical')
  })

  it('uses |lat| so northern and southern hemispheres map symmetrically', () => {
    expect(latitudeBand(45)).toBe(latitudeBand(-45))
    expect(latitudeBand(70)).toBe(latitudeBand(-70))
  })

  it('uses standard climatology thresholds: 23.5, 35, 55, 66.5', () => {
    expect(latitudeBand(0)).toBe('tropical')
    expect(latitudeBand(20)).toBe('tropical')
    expect(latitudeBand(23.5)).toBe('subtropical')   // boundary inclusive on upper side
    expect(latitudeBand(30)).toBe('subtropical')
    expect(latitudeBand(35)).toBe('temperate')
    expect(latitudeBand(50)).toBe('temperate')
    expect(latitudeBand(55)).toBe('subpolar')
    expect(latitudeBand(60)).toBe('subpolar')
    expect(latitudeBand(66.5)).toBe('polar')
    expect(latitudeBand(80)).toBe('polar')
    expect(latitudeBand(90)).toBe('polar')
  })
})

describe('isPolarZone (rule 10e render-distortion classifier)', () => {
  it('returns true for |lat| >= 80', () => {
    expect(isPolarZone(80)).toBe(true)
    expect(isPolarZone(85)).toBe(true)
    expect(isPolarZone(90)).toBe(true)
    expect(isPolarZone(-80)).toBe(true)
    expect(isPolarZone(-90)).toBe(true)
  })

  it('returns false for |lat| < 80', () => {
    expect(isPolarZone(79.99)).toBe(false)
    expect(isPolarZone(0)).toBe(false)
    expect(isPolarZone(-79.99)).toBe(false)
  })
})
