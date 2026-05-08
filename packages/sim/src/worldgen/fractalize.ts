import type { Xoshiro256 } from '../rng/xoshiro256'

/** Top 53 bits → [0, 1). */
function nextDouble(rng: Xoshiro256): number {
  const top53 = Number(rng.next() >> 11n)
  return top53 / 2 ** 53
}

/** Gaussian via Box-Muller. */
function nextGaussian(rng: Xoshiro256): number {
  let u = 0
  let v = 0
  while (u === 0) u = nextDouble(rng)
  while (v === 0) v = nextDouble(rng)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Fractalize a closed polygon ring via Brownian-bridge midpoint refinement.
 *
 * Each segment is recursively subdivided. At each step, the new midpoint is
 * the geometric midpoint plus a perpendicular displacement drawn from a
 * Gaussian whose variance scales with segment length × (2 - fractalDimension).
 *
 * - fractalDimension = 1.0 → straight lines (no displacement)
 * - fractalDimension = 1.5 → highly fractal (large displacements)
 *
 * `subdivisions` is the recursion depth; each level doubles the vertex count
 * per segment. 3 levels → 8× vertices per segment; 4 levels → 16×.
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
  // Roughness factor: 1 = fully variable, 0 = no displacement.
  // For D in [1, 2), D - 1 ∈ [0, 1). Higher D → more wiggly.
  const roughness = Math.max(0, Math.min(1, fractalDimension - 1))

  const refineOnce = (
    inputRing: ReadonlyArray<readonly [number, number]>,
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let i = 0; i < inputRing.length - 1; i++) {
      const a = inputRing[i]!
      const b = inputRing[i + 1]!
      out.push([a[0], a[1]])
      const mx = (a[0] + b[0]) / 2
      const my = (a[1] + b[1]) / 2
      // Perpendicular vector (rotate (b - a) by 90°).
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const segLen = Math.hypot(dx, dy)
      const px = -dy / Math.max(segLen, 1e-9)
      const py = dx / Math.max(segLen, 1e-9)
      // Displacement variance ~ (segLen × roughness) / 10. Conservative scaling
      // preserves centroid while adding fractal detail.
      const displacement = nextGaussian(rng) * (segLen * roughness * 0.1)
      out.push([mx + px * displacement, my + py * displacement])
    }
    // Close the ring.
    out.push([out[0]![0], out[0]![1]])
    return out
  }

  let current: Array<[number, number]> = ring.map((p) => [p[0], p[1]])
  for (let s = 0; s < subdivisions; s++) {
    current = refineOnce(current)
  }
  return current
}
