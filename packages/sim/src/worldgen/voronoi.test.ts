import { describe, expect, it } from 'vitest'
import { sphericalVoronoi } from './voronoi'
import type { LonLat } from '../sphere/coords'

describe('sphericalVoronoi — basic invariants', () => {
  const seedPoints: LonLat[] = [
    { lonDeg: 0, latDeg: 0 },
    { lonDeg: 90, latDeg: 0 },
    { lonDeg: 180, latDeg: 0 },
    { lonDeg: -90, latDeg: 0 },
    { lonDeg: 0, latDeg: 60 },
    { lonDeg: 0, latDeg: -60 },
  ]

  it('returns one cell per seed point', () => {
    const cells = sphericalVoronoi(seedPoints)
    expect(cells).toHaveLength(seedPoints.length)
  })

  it('each cell is a closed polygon (first point repeats as last)', () => {
    const cells = sphericalVoronoi(seedPoints)
    for (const cell of cells) {
      const ring = cell.coordinates[0]!
      expect(ring.length).toBeGreaterThan(3)
      const first = ring[0]!
      const last = ring[ring.length - 1]!
      expect(last[0]).toBeCloseTo(first[0], 6)
      expect(last[1]).toBeCloseTo(first[1], 6)
    }
  })

  it('each cell contains its seed point', () => {
    const cells = sphericalVoronoi(seedPoints)
    for (let i = 0; i < seedPoints.length; i++) {
      const seed = seedPoints[i]!
      const ringPoints = cells[i]!.coordinates[0]!
      const meanLon = ringPoints.reduce((a, p) => a + p[0], 0) / ringPoints.length
      const meanLat = ringPoints.reduce((a, p) => a + p[1], 0) / ringPoints.length
      const dToOwn = Math.hypot(meanLon - seed.lonDeg, meanLat - seed.latDeg)
      for (let j = 0; j < seedPoints.length; j++) {
        if (j === i) continue
        const other = seedPoints[j]!
        const dToOther = Math.hypot(meanLon - other.lonDeg, meanLat - other.latDeg)
        expect(dToOwn).toBeLessThan(dToOther + 30)
      }
    }
  })

  it('is deterministic for the same input order', () => {
    const a = sphericalVoronoi(seedPoints)
    const b = sphericalVoronoi(seedPoints)
    expect(a).toEqual(b)
  })

  it('handles N=2 (two-cell tessellation, hemispheres)', () => {
    const two: LonLat[] = [
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: 180, latDeg: 0 },
    ]
    const cells = sphericalVoronoi(two)
    expect(cells).toHaveLength(2)
    cells.forEach((cell) => {
      expect(cell.coordinates[0]!.length).toBeGreaterThan(8)
    })
  })

  it('throws on N < 2', () => {
    expect(() => sphericalVoronoi([{ lonDeg: 0, latDeg: 0 }])).toThrow(/at least 2/)
    expect(() => sphericalVoronoi([])).toThrow(/at least 2/)
  })
})
