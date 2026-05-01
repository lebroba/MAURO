// Sphere-native procedural noise via 3D Simplex sampling.
//
// The trick is to sample a 3D noise field at the Cartesian unit-sphere
// position, NOT at (lon, lat) in 2D. Because the input space is 3D and
// continuous, the dateline + pole singularities of 2D-pixel-space noise
// don't exist — they're emergent from the bad parameterization, not from
// noise itself.
//
// Library: simplex-noise@4.0.x (Wagner). Picked over Perlin because the
// hypercube lattice produces faint orthogonal banding visible at low
// octave counts when 3D noise is sampled on a sphere; Simplex's isotropic
// lattice eliminates this. See spec section "Noise library" for the full
// rationale.

import { createNoise3D } from 'simplex-noise'
import { lonLatToCartesian, type Cartesian3, type LonLat } from './coords'
import { asDoubleSource } from './_rng'
import { xoshiro256ss } from '../rng/xoshiro256'

export interface SphereNoiseParams {
  /** Master seed. Drives the noise's internal permutation table. */
  seed: bigint
  /** Number of FBM octaves. 1 = single-frequency Simplex; higher adds detail. */
  octaves: number
  /** Base frequency. 1 corresponds to one full wavelength across the unit sphere. */
  frequency: number
  /** Frequency multiplier per octave. Standard value: 2. */
  lacunarity: number
  /** Amplitude multiplier per octave. Standard value: 0.5 (sums to bounded series). */
  persistence: number
}

// Noise instances are cached per seed — creating the permutation table is
// the expensive part and we want reuse across multiple sample calls with
// the same seed. Map key is the seed bigint.
const noiseCache = new Map<bigint, (x: number, y: number, z: number) => number>()

function getNoise3D(seed: bigint): (x: number, y: number, z: number) => number {
  const cached = noiseCache.get(seed)
  if (cached) return cached
  const rng = xoshiro256ss(seed)
  const noise = createNoise3D(asDoubleSource(rng))
  noiseCache.set(seed, noise)
  return noise
}

/**
 * Sample sphere-native 3D Simplex FBM noise at a point. Inputs may be
 * either LonLat (converted internally to unit-sphere Cartesian) or
 * Cartesian3 directly (must be unit length).
 *
 * Output is in approximately [−1, 1]; the exact bound depends on octave
 * count and persistence (a geometric series). Continuous across all
 * positions on the sphere — no dateline or pole artifacts by construction.
 */
export function sampleSphereNoise(
  p: LonLat | Cartesian3,
  params: SphereNoiseParams,
): number {
  const cart = isLonLat(p) ? lonLatToCartesian(p) : p
  const noise3D = getNoise3D(params.seed)

  let amplitude = 1
  let frequency = params.frequency
  let sum = 0
  let normalization = 0

  for (let i = 0; i < params.octaves; i++) {
    sum += amplitude * noise3D(cart.x * frequency, cart.y * frequency, cart.z * frequency)
    normalization += amplitude
    amplitude *= params.persistence
    frequency *= params.lacunarity
  }

  // Normalize to keep output bounded in approximately [-1, 1] regardless
  // of octave count.
  return sum / normalization
}

function isLonLat(p: LonLat | Cartesian3): p is LonLat {
  return (p as LonLat).lonDeg !== undefined
}
