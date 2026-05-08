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
 * Find the K nearest neighbors of test point at index i, by 3D cartesian
 * distance. Uses a fixed-size top-K maintained inline (O(N*K)) rather than
 * full sort (O(N log N)). For N=4000, K=6 this is ~6× faster than sort.
 */
function kNearestNeighbors(
  i: number,
  cartesians: Array<{ x: number; y: number; z: number }>,
  k: number,
): number[] {
  const center = cartesians[i]!
  const cx = center.x
  const cy = center.y
  const cz = center.z
  // Top-K: parallel arrays of indices and distances, kept sorted ascending.
  const idxs: number[] = new Array(k).fill(-1)
  const ds: number[] = new Array(k).fill(Infinity)
  let worst = Infinity
  const N = cartesians.length
  for (let j = 0; j < N; j++) {
    if (j === i) continue
    const c = cartesians[j]!
    const dx = c.x - cx
    const dy = c.y - cy
    const dz = c.z - cz
    const d = dx * dx + dy * dy + dz * dz
    if (d >= worst) continue
    // Insert into sorted top-K.
    let p = k - 1
    while (p > 0 && ds[p - 1]! > d) {
      ds[p] = ds[p - 1]!
      idxs[p] = idxs[p - 1]!
      p--
    }
    ds[p] = d
    idxs[p] = j
    worst = ds[k - 1]!
  }
  return idxs
}

/**
 * Lightweight cell-centroid computation for use during Lloyd relaxation.
 * Returns the (lon, lat) centroid of all test points labeled to each seed,
 * skipping the expensive K-NN boundary extraction.
 *
 * For relaxation we only need the centroid — boundary extraction would be
 * wasted work since we re-tessellate after moving the seeds anyway.
 */
export function cellCentroids(seeds: LonLat[]): LonLat[] {
  if (seeds.length < 2) {
    throw new Error('cellCentroids: requires at least 2 seed points')
  }
  const testPoints = fibonacciSphere(TEST_POINT_COUNT)
  const sumX = new Float64Array(seeds.length)
  const sumY = new Float64Array(seeds.length)
  const sumZ = new Float64Array(seeds.length)
  const counts = new Uint32Array(seeds.length)
  for (let i = 0; i < testPoints.length; i++) {
    const cellId = nearestSeed(testPoints[i]!, seeds)
    const c = lonLatToCartesian(testPoints[i]!)
    sumX[cellId] = (sumX[cellId] ?? 0) + c.x
    sumY[cellId] = (sumY[cellId] ?? 0) + c.y
    sumZ[cellId] = (sumZ[cellId] ?? 0) + c.z
    counts[cellId] = (counts[cellId] ?? 0) + 1
  }
  const result: LonLat[] = []
  for (let s = 0; s < seeds.length; s++) {
    const n = counts[s]!
    if (n === 0) {
      result.push(seeds[s]!)
      continue
    }
    // Mean cartesian, normalized back to unit sphere → (lon, lat).
    let x = sumX[s]! / n
    let y = sumY[s]! / n
    let z = sumZ[s]! / n
    const len = Math.sqrt(x * x + y * y + z * z)
    if (len < 1e-9) {
      result.push(seeds[s]!)
      continue
    }
    x /= len
    y /= len
    z /= len
    const latDeg = Math.asin(y) * (180 / Math.PI)
    const lonDeg = Math.atan2(z, x) * (180 / Math.PI)
    result.push({ lonDeg, latDeg })
  }
  return result
}

/**
 * Compute Voronoi cells on the unit sphere for N seed points.
 *
 * Returns one closed polygon per seed (in input order). Polygon coordinates
 * are (lon, lat) pairs; the first vertex is repeated as the last.
 *
 * Algorithm: brute-force via dense Fibonacci-spiral test points. Each test
 * point is labeled by nearest seed. Then for each test point we check its
 * K=6 nearest test-point neighbors (Fibonacci packing is approximately
 * hexagonal); if any neighbor has a different label, this point is on the
 * boundary of its cell. Per cell, boundary points are sorted by bearing
 * from the seed to form the polygon ring.
 *
 * Boundary extraction (vs. convex hull) preserves natural non-convex shapes
 * — inlets, peninsulas, irregular coastlines.
 */
export function sphericalVoronoi(seeds: LonLat[]): GeoJSONPolygon[] {
  if (seeds.length < 2) {
    throw new Error('sphericalVoronoi: requires at least 2 seed points')
  }

  // Step 1: dense test-point distribution.
  const testPoints = fibonacciSphere(TEST_POINT_COUNT)

  // Step 2: label every test point with its nearest-seed index.
  const labels = testPoints.map((p) => nearestSeed(p, seeds))

  // Step 3: find boundary points via K-NN on test points.
  const cartesians = testPoints.map(lonLatToCartesian)
  const isBoundary: boolean[] = new Array(testPoints.length).fill(false)
  for (let i = 0; i < testPoints.length; i++) {
    const neighbors = kNearestNeighbors(i, cartesians, 6)
    for (const j of neighbors) {
      if (labels[j] !== labels[i]) {
        isBoundary[i] = true
        break
      }
    }
  }

  // Step 4: per cell, gather boundary points and bearing-sort around seed.
  const result: GeoJSONPolygon[] = []
  for (let cellId = 0; cellId < seeds.length; cellId++) {
    const seed = seeds[cellId]!
    const boundaryPoints: Array<{ lon: number; lat: number; bearing: number }> = []
    for (let i = 0; i < testPoints.length; i++) {
      if (labels[i] !== cellId) continue
      if (!isBoundary[i]) continue
      const p = testPoints[i]!
      // Antimeridian unwrap: if seed is near +180 and point is near -180
      // (or vice versa), shift the point so cell is contiguous in (lon, lat).
      let lon = p.lonDeg
      const dLon = lon - seed.lonDeg
      if (dLon > 180) lon -= 360
      else if (dLon < -180) lon += 360
      const bearing = Math.atan2(p.latDeg - seed.latDeg, lon - seed.lonDeg)
      boundaryPoints.push({ lon, lat: p.latDeg, bearing })
    }
    boundaryPoints.sort((a, b) => a.bearing - b.bearing)
    if (boundaryPoints.length < 3) {
      result.push({ type: 'Polygon', coordinates: [[]] })
      continue
    }
    const ring: Array<[number, number]> = boundaryPoints.map((p) => [p.lon, p.lat])
    ring.push([ring[0]![0], ring[0]![1]]) // close
    result.push({ type: 'Polygon', coordinates: [ring] })
  }
  return result
}
