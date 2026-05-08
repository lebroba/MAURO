import type { GeoJSONPolygon } from '../types'
import type { LonLat } from '../sphere/coords'
import { lonLatToCartesian } from '../sphere/coords'

const TEST_POINT_COUNT = 4000

/** Great-circle distance squared (chord length squared on the unit sphere). */
function chordDistSq(a: LonLat, b: LonLat): number {
  const ca = lonLatToCartesian(a)
  const cb = lonLatToCartesian(b)
  const dx = ca.x - cb.x
  const dy = ca.y - cb.y
  const dz = ca.z - cb.z
  return dx * dx + dy * dy + dz * dz
}

/** Fibonacci-spiral on the unit sphere — N points, evenly distributed. */
function fibonacciSphere(n: number): LonLat[] {
  const points: LonLat[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i) / (n - 1)
    const radius = Math.sqrt(1 - y * y)
    const theta = goldenAngle * i
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius
    const latDeg = Math.asin(y) * (180 / Math.PI)
    const lonDeg = Math.atan2(z, x) * (180 / Math.PI)
    points.push({ lonDeg, latDeg })
  }
  return points
}

/** Index of the nearest seed point to `p`, by great-circle distance. */
function nearestSeed(p: LonLat, seeds: LonLat[]): number {
  let bestIdx = 0
  let bestD = Infinity
  for (let i = 0; i < seeds.length; i++) {
    const d = chordDistSq(p, seeds[i]!)
    if (d < bestD) {
      bestD = d
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Compute Voronoi cells on the unit sphere for N seed points.
 *
 * Returns one closed polygon per seed (in input order). Polygon coordinates
 * are (lon, lat) pairs; the first vertex is repeated as the last.
 *
 * Algorithm: brute-force via dense Fibonacci-spiral test points. For each
 * test point, find its nearest seed → labels every test point with a cell id.
 * For each cell, extract the labeled test points, sort them around the seed
 * by bearing, and return as a polygon ring.
 *
 * Trade-off: boundaries are coarse (~3° resolution) — the fractalization
 * pass smooths and adds detail. For N ≤ 16 seeds this is sub-millisecond.
 */
export function sphericalVoronoi(seeds: LonLat[]): GeoJSONPolygon[] {
  if (seeds.length < 2) {
    throw new Error('sphericalVoronoi: requires at least 2 seed points')
  }

  // Step 1: dense test-point distribution.
  const testPoints = fibonacciSphere(TEST_POINT_COUNT)

  // Step 2: label every test point with its nearest-seed index.
  const labels = testPoints.map((p) => nearestSeed(p, seeds))

  // Step 3: per cell, gather labeled test points and sort by bearing from seed.
  const result: GeoJSONPolygon[] = []
  for (let cellId = 0; cellId < seeds.length; cellId++) {
    const cellPoints: Array<{ lonDeg: number; latDeg: number; bearing: number }> = []
    const seed = seeds[cellId]!
    for (let i = 0; i < testPoints.length; i++) {
      if (labels[i] !== cellId) continue
      const p = testPoints[i]!
      // Antimeridian unwrap: shift the test-point lon by ±360 if the seed is
      // closer that way. Keeps each cell's vertices contiguous in lon,lat
      // space (otherwise a cell straddling lon=±180 has half its vertices at
      // +180 and half at -180, breaking centroid- and bearing-based reasoning).
      let pLon = p.lonDeg
      const rawDLon = pLon - seed.lonDeg
      if (rawDLon > 180) pLon -= 360
      else if (rawDLon < -180) pLon += 360
      // Bearing from seed to p (radians). Naive 2D approximation OK at this
      // resolution — boundaries are coarse and refined in fractalization.
      const dLon = pLon - seed.lonDeg
      const dLat = p.latDeg - seed.latDeg
      const bearing = Math.atan2(dLat, dLon)
      cellPoints.push({ lonDeg: pLon, latDeg: p.latDeg, bearing })
    }
    cellPoints.sort((a, b) => a.bearing - b.bearing)
    const ring: Array<[number, number]> = cellPoints.map((c) => [c.lonDeg, c.latDeg])
    if (ring.length > 0) {
      ring.push([ring[0]![0], ring[0]![1]]) // close the ring
    }
    result.push({ type: 'Polygon', coordinates: [ring] })
  }
  return result
}
