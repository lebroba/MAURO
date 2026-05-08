import { describe, expect, it } from 'vitest'
import {
  LAND_COVERAGE_FRACTION,
  CONTINENT_COUNT_DISTRIBUTION,
  HEMISPHERIC_BIAS_NORTH,
  LATITUDINAL_WEIGHTING,
  SIZE_DISTRIBUTION_ALPHA,
  COASTLINE_COMPLEXITY_RANGE,
} from './earth-stats'

describe('earth-stats — values are sane defaults', () => {
  it('LAND_COVERAGE_FRACTION matches Earth (~29%)', () => {
    expect(LAND_COVERAGE_FRACTION).toBeGreaterThan(0.27)
    expect(LAND_COVERAGE_FRACTION).toBeLessThan(0.31)
  })

  it('CONTINENT_COUNT_DISTRIBUTION sums to 1.0', () => {
    const sum = CONTINENT_COUNT_DISTRIBUTION.reduce((a, [, w]) => a + w, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('CONTINENT_COUNT_DISTRIBUTION is centered around 5–6', () => {
    const counts = CONTINENT_COUNT_DISTRIBUTION
    const five = counts.find(([n]) => n === 5)
    const six = counts.find(([n]) => n === 6)
    expect(five?.[1]).toBeGreaterThan(0.3)
    expect(six?.[1]).toBeGreaterThan(0.3)
  })

  it('HEMISPHERIC_BIAS_NORTH matches Earth (~68% N)', () => {
    expect(HEMISPHERIC_BIAS_NORTH).toBeGreaterThan(0.65)
    expect(HEMISPHERIC_BIAS_NORTH).toBeLessThan(0.72)
  })

  it('LATITUDINAL_WEIGHTING has 18 bands (10° each)', () => {
    expect(LATITUDINAL_WEIGHTING).toHaveLength(18)
  })

  it('LATITUDINAL_WEIGHTING sums to 1.0', () => {
    const sum = LATITUDINAL_WEIGHTING.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('SIZE_DISTRIBUTION_ALPHA is in plausible Pareto range', () => {
    expect(SIZE_DISTRIBUTION_ALPHA).toBeGreaterThan(1.0)
    expect(SIZE_DISTRIBUTION_ALPHA).toBeLessThan(2.5)
  })

  it('COASTLINE_COMPLEXITY_RANGE is [smoothMin, fractalMax]', () => {
    const [lo, hi] = COASTLINE_COMPLEXITY_RANGE
    expect(lo).toBeGreaterThanOrEqual(1.0)
    expect(hi).toBeLessThanOrEqual(2.0)
    expect(lo).toBeLessThan(hi)
  })
})
