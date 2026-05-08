import type { Xoshiro256 } from '../rng/xoshiro256'
import { createNoise2D } from 'simplex-noise'

/** Top 53 bits → [0, 1). */
function nextDouble(rng: Xoshiro256): number {
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/** Multi-octave noise: sum of N octaves with halving amplitude / doubling frequency.
 *  Output range is roughly [-1, 1] after normalization. */
function fbm(noise2D: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let weight = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq)
    weight += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / weight
}

/**
 * One iteration of Chaikin's corner-cutting algorithm. Replaces every edge
 * with two points at 1/4 and 3/4 along the edge. Each pass roughly doubles
 * the vertex count while rounding sharp corners into organic curves.
 *
 * Input ring must be closed (first vertex repeated as last). Output is also
 * closed.
 *
 * Reference: Chaikin 1974, "An algorithm for high-speed curve generation".
 * Public-domain algorithm, written from scratch.
 */
function chaikinSmooth(
  ring: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  if (ring.length < 4) {
    return ring.map((p) => [p[0], p[1]] as [number, number])
  }
  const out: Array<[number, number]> = []
  // Iterate edges of the ring, excluding the closing duplicate.
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!
    const b = ring[i + 1]!
    // 1/4 point and 3/4 point along the edge.
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
  }
  // Close the ring.
  out.push([out[0]![0], out[0]![1]])
  return out
}

/**
 * Fractalize a closed polygon ring via recursive midpoint subdivision with
 * multi-octave simplex noise displacement.
 *
 * Each segment is recursively subdivided. At each step, the new midpoint is
 * the geometric midpoint plus a perpendicular displacement sampled from a
 * multi-octave noise field (4 octaves) at that midpoint's spatial coordinates.
 * A separate noise field domain-warps the midpoint's coordinates before the
 * displacement lookup, creating swirling fractal-like distortions.
 *
 * - fractalDimension = 1.0 → straight lines (no displacement)
 * - fractalDimension = 1.5 → moderately wiggly
 * - fractalDimension = 1.8 → highly fractal coast
 *
 * `subdivisions` is the recursion depth; each level doubles the vertex count
 * per segment.
 *
 * Input ring must be closed (first vertex repeated as last).
 */
export function brownianBridgeRing(
  rng: Xoshiro256,
  ring: ReadonlyArray<readonly [number, number]>,
  fractalDimension: number,
  subdivisions: number,
): Array<[number, number]> {
  if (subdivisions === 0) {
    return ring.map((p) => [p[0], p[1]] as [number, number])
  }
  // Roughness: 0 (straight) to 1+ (very wiggly). 1.5 → 0.5; 1.8 → 0.8.
  const roughness = Math.max(0, Math.min(1.5, fractalDimension - 1))

  // Two independent noise fields: one for displacement, one for domain warp.
  // Both seeded from the same RNG to preserve determinism.
  const dispNoise = createNoise2D(() => nextDouble(rng))
  const warpNoise = createNoise2D(() => nextDouble(rng))

  const refineOnce = (
    inputRing: ReadonlyArray<readonly [number, number]>,
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let i = 0; i < inputRing.length - 1; i++) {
      const a = inputRing[i]!
      const b = inputRing[i + 1]!
      out.push([a[0], a[1]])
      let mx = (a[0] + b[0]) / 2
      let my = (a[1] + b[1]) / 2
      // Domain warp: distort the lookup coordinate by another noise field.
      // Scale 0.05 keeps warp gentle relative to typical lon/lat extents.
      const warpScale = 1.0
      // First warp pass
      const warpX1 = fbm(warpNoise, mx * 0.05, my * 0.05, 2)
      const warpY1 = fbm(warpNoise, mx * 0.05 + 100, my * 0.05 + 100, 2)
      let warpedX = mx + warpX1 * warpScale
      let warpedY = my + warpY1 * warpScale
      // Second warp pass — sample warp at the already-displaced location.
      // Each pass is weaker than the last to avoid runaway distortion; together
      // they produce "whorls within whorls" rather than long parallel smears.
      const warpX2 = fbm(warpNoise, warpedX * 0.05 + 200, warpedY * 0.05 + 200, 2)
      const warpY2 = fbm(warpNoise, warpedX * 0.05 + 300, warpedY * 0.05 + 300, 2)
      warpedX += warpX2 * warpScale * 0.5
      warpedY += warpY2 * warpScale * 0.5
      mx = warpedX
      my = warpedY
      // Perpendicular vector (rotate (b - a) by 90°).
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const segLen = Math.hypot(dx, dy)
      const px = -dy / Math.max(segLen, 1e-9)
      const py = dx / Math.max(segLen, 1e-9)
      // Multi-octave noise displacement, scaled by segment length and roughness.
      const noiseValue = fbm(dispNoise, mx * 0.1, my * 0.1, 4)
      const displacement = noiseValue * (segLen * roughness * 0.25)
      // Use the original (un-warped) midpoint as the anchor; warp only affects
      // where we sample noise.
      const anchorX = (a[0] + b[0]) / 2
      const anchorY = (a[1] + b[1]) / 2
      out.push([anchorX + px * displacement, anchorY + py * displacement])
    }
    // Close the ring.
    out.push([out[0]![0], out[0]![1]])
    return out
  }

  let current: Array<[number, number]> = ring.map((p) => [p[0], p[1]])
  for (let s = 0; s < subdivisions; s++) {
    current = refineOnce(current)
  }
  // Chaikin smoothing pass — rounds the sharp corners that multi-octave
  // noise introduces, giving organic coastline curves instead of digital
  // scallops. One pass is enough; more would over-smooth and erase fractal
  // character.
  current = chaikinSmooth(current)
  return current
}
