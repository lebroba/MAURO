import { describe, expect, it } from 'vitest'
import { sampleSphereNoise, type SphereNoiseParams } from './noise'
import { lonLatToCartesian } from './coords'

const DEFAULT_PARAMS: SphereNoiseParams = {
  seed: 42n,
  octaves: 4,
  frequency: 1,
  lacunarity: 2,
  persistence: 0.5,
}

describe('sampleSphereNoise', () => {
  it('returns deterministic output for identical inputs', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    const b = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    expect(a).toBe(b)
  })

  it('produces different output for different inputs', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, DEFAULT_PARAMS)
    const b = sampleSphereNoise({ lonDeg: 11, latDeg: 20 }, DEFAULT_PARAMS)
    expect(a).not.toBe(b)
  })

  it('produces different output for different seeds', () => {
    const a = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, { ...DEFAULT_PARAMS, seed: 1n })
    const b = sampleSphereNoise({ lonDeg: 10, latDeg: 20 }, { ...DEFAULT_PARAMS, seed: 2n })
    expect(a).not.toBe(b)
  })

  it('output is bounded in approximately [-1, 1] over many samples', () => {
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const v = sampleSphereNoise(
          { lonDeg: -180 + (360 * i) / 100, latDeg: -90 + (180 * (j + 0.5)) / 100 },
          DEFAULT_PARAMS,
        )
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1.5) // FBM with persistence < 1 stays bounded
    expect(max).toBeLessThanOrEqual(1.5)
  })

  it('is continuous across the dateline (rule 10c)', () => {
    const east = sampleSphereNoise({ lonDeg: 179.99, latDeg: 0 }, DEFAULT_PARAMS)
    const west = sampleSphereNoise({ lonDeg: -179.99, latDeg: 0 }, DEFAULT_PARAMS)
    expect(Math.abs(east - west)).toBeLessThan(0.05)
  })

  it('is continuous near the north pole (rule 10c)', () => {
    // Sample at 10 random lon values very close to the pole. All physical
    // positions are near identical (on a sphere), so noise values should
    // also be near identical.
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      samples.push(
        sampleSphereNoise(
          { lonDeg: -180 + (360 * i) / 10, latDeg: 89.999 },
          DEFAULT_PARAMS,
        ),
      )
    }
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    expect(max - min).toBeLessThan(0.1)
  })

  it('accepts pre-converted Cartesian3 input identically', () => {
    const ll = { lonDeg: 30, latDeg: 40 }
    const fromLL = sampleSphereNoise(ll, DEFAULT_PARAMS)
    const fromCart = sampleSphereNoise(lonLatToCartesian(ll), DEFAULT_PARAMS)
    expect(fromLL).toBeCloseTo(fromCart, 12)
  })
})
