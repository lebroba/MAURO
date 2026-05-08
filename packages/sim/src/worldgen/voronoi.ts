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
 * 2D convex hull via Andrew's monotone chain (O(n log n)). Returns the hull
 * vertices in counter-clockwise order. Input may have duplicates; output
 * has none.
 */
function convexHull2D(points: Array<[number, number]>): Array<[number, number]> {
  // Sort lexicographically by x (then y).
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const n = sorted.length
  if (n < 2) return sorted

  // Cross product of vectors OA and OB. Positive = counter-clockwise turn.
  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number],
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  // Build lower hull.
  const lower: Array<[number, number]> = []
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }

  // Build upper hull.
  const upper: Array<[number, number]> = []
  for (let i = n - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }

  // Concatenate; drop the last point of each because it's the start of the other.
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/**
 * Compute Voronoi cells on the unit sphere for N seed points.
 *
 * Returns one closed polygon per seed (in input order). Polygon coordinates
 * are (lon, lat) pairs; the first vertex is repeated as the last.
 *
 * Algorithm: brute-force via dense Fibonacci-spiral test points. For each
 * test point, find its nearest seed → labels every test point with a cell id.
 * For each cell, take the 2D convex hull of the labeled (lon, lat) points
 * and return as a polygon ring.
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

  // Step 3: per cell, gather labeled test points and compute their 2D convex
  // hull. The hull is a clean, non-self-intersecting approximation of the cell
  // boundary. (Bearing-sort would zig-zag through interior points, producing
  // a self-intersecting star pattern that necessitated this rewrite.)
  const result: GeoJSONPolygon[] = []
  for (let cellId = 0; cellId < seeds.length; cellId++) {
    const seed = seeds[cellId]!
    const cellPoints: Array<[number, number]> = []
    for (let i = 0; i < testPoints.length; i++) {
      if (labels[i] !== cellId) continue
      const p = testPoints[i]!
      // Antimeridian unwrap: if seed is near +180 and point is near -180
      // (or vice versa), shift the point so cell is contiguous in (lon, lat).
      let lon = p.lonDeg
      const dLon = lon - seed.lonDeg
      if (dLon > 180) lon -= 360
      else if (dLon < -180) lon += 360
      cellPoints.push([lon, p.latDeg])
    }
    if (cellPoints.length < 3) {
      result.push({ type: 'Polygon', coordinates: [[]] })
      continue
    }
    const hull = convexHull2D(cellPoints)
    // Close the ring.
    hull.push([hull[0]![0], hull[0]![1]])
    result.push({ type: 'Polygon', coordinates: [hull] })
  }
  return result
}
