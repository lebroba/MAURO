import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { brownianBridgeRing } from './fractalize'

describe('brownianBridgeRing', () => {
  const square: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  it('returns a closed polygon (first vertex repeats as last)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    const first = out[0]!
    const last = out[out.length - 1]!
    expect(last[0]).toBeCloseTo(first[0], 9)
    expect(last[1]).toBeCloseTo(first[1], 9)
  })

  it('produces 2^subdivisions × original segments', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const original = square.length - 1 // 4 segments
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    // After 3 subdivisions, each segment becomes 8 segments → 32 total + closing = 33
    expect(out.length).toBe(original * Math.pow(2, 3) + 1)
  })

  it('output ring still encloses the original (centroid preserved)', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const out = brownianBridgeRing(rng, square, 1.2, 3)
    const cx = out.slice(0, -1).reduce((a, p) => a + p[0], 0) / (out.length - 1)
    const cy = out.slice(0, -1).reduce((a, p) => a + p[1], 0) / (out.length - 1)
    // Square's centroid is (5, 5).
    expect(cx).toBeCloseTo(5, 0)
    expect(cy).toBeCloseTo(5, 0)
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    const a = brownianBridgeRing(r1, square, 1.2, 3)
    const b = brownianBridgeRing(r2, square, 1.2, 3)
    expect(a).toEqual(b)
  })

  it('higher fractalDimension produces longer perimeter (more wiggly)', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    const smooth = brownianBridgeRing(r1, square, 1.05, 4)
    const wiggly = brownianBridgeRing(r2, square, 1.5, 4)

    const perim = (ring: Array<[number, number]>) => {
      let p = 0
      for (let i = 1; i < ring.length; i++) {
        const dx = ring[i]![0] - ring[i - 1]![0]
        const dy = ring[i]![1] - ring[i - 1]![1]
        p += Math.hypot(dx, dy)
      }
      return p
    }
    expect(perim(wiggly)).toBeGreaterThan(perim(smooth))
  })
})
