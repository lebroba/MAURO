import { describe, expect, it } from 'vitest'
import { generateWorld } from './generate-world'

describe('generateWorld — determinism', () => {
  it('produces byte-identical output from same seed', () => {
    const a = generateWorld('test-seed-cafe-1234')
    const b = generateWorld('test-seed-cafe-1234')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces different output for different seeds', () => {
    const a = generateWorld('seed-one')
    const b = generateWorld('seed-two')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('generateWorld — characteristic stats', () => {
  it('continent count is in the expected distribution range [4, 7]', () => {
    const counts = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const w = generateWorld(`seed-${i}`)
      counts.add(w.continents.length)
    }
    counts.forEach((c) => {
      expect(c).toBeGreaterThanOrEqual(4)
      expect(c).toBeLessThanOrEqual(7)
    })
  })

  it('hemispheric distribution: across 50 worlds, ~68% of continent centroids are northern', () => {
    let northCount = 0
    let total = 0
    for (let i = 0; i < 50; i++) {
      const w = generateWorld(`seed-${i}`)
      for (const c of w.continents) {
        const ring = c.polygon.coordinates[0]!
        const centroidLat = ring.reduce((a, p) => a + p[1], 0) / ring.length
        if (centroidLat > 0) northCount += 1
        total += 1
      }
    }
    const fraction = northCount / total
    expect(fraction).toBeGreaterThan(0.55)
    expect(fraction).toBeLessThan(0.80)
  })

  it('every continent has a closed polygon with > 8 vertices (post-fractalization)', () => {
    const w = generateWorld('test-seed')
    for (const c of w.continents) {
      const ring = c.polygon.coordinates[0]!
      expect(ring.length).toBeGreaterThan(8)
      const first = ring[0]!
      const last = ring[ring.length - 1]!
      expect(first[0]).toBeCloseTo(last[0], 6)
      expect(first[1]).toBeCloseTo(last[1], 6)
    }
  })

  it('every continent has a 64-character hex seed and a name', () => {
    const w = generateWorld('test-seed')
    expect(w.seed).toMatch(/^[0-9a-f]{64}$/)
    for (const c of w.continents) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.id.length).toBeGreaterThan(0)
    }
  })
})

describe('generateWorld — performance', () => {
  it('generates a 7-continent world in under 500ms', () => {
    const start = Date.now()
    generateWorld('perf-seed')
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})
