import { describe, expect, it } from 'vitest'
import { xoshiro256ssFromState } from '../rng/xoshiro256'
import { mixSeedString } from './seed'
import { generatePlaceholderName, pickContinentColor } from './naming'

describe('generatePlaceholderName', () => {
  it('returns a non-empty string', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    expect(generatePlaceholderName(rng).length).toBeGreaterThan(0)
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    expect(generatePlaceholderName(r1)).toBe(generatePlaceholderName(r2))
  })

  it('produces variety across a series', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const names = new Set<string>()
    for (let i = 0; i < 20; i++) {
      names.add(generatePlaceholderName(rng))
    }
    expect(names.size).toBeGreaterThan(15)
  })
})

describe('pickContinentColor', () => {
  it('returns a 7-character hex string starting with #', () => {
    const [s0, s1, s2, s3] = mixSeedString('test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    const c = pickContinentColor(rng)
    expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('never returns verdigris (#3B6B5A — reserved for ocean)', () => {
    const [s0, s1, s2, s3] = mixSeedString('palette-test')
    const rng = xoshiro256ssFromState(s0, s1, s2, s3)
    for (let i = 0; i < 100; i++) {
      const c = pickContinentColor(rng).toLowerCase()
      expect(c).not.toBe('#3b6b5a')
    }
  })

  it('is deterministic from same seed', () => {
    const [s0a, s1a, s2a, s3a] = mixSeedString('test')
    const r1 = xoshiro256ssFromState(s0a, s1a, s2a, s3a)
    const [s0b, s1b, s2b, s3b] = mixSeedString('test')
    const r2 = xoshiro256ssFromState(s0b, s1b, s2b, s3b)
    expect(pickContinentColor(r1)).toBe(pickContinentColor(r2))
  })
})
