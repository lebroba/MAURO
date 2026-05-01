// Geodesy primitives — distances, rotations, slerp, Euler-pole rotation.
//
// Per the spec's hybrid coordinate-frame policy:
//   - greatCircleDistanceMeters: unit sphere math (Haversine), fast.
//   - geodesicDistanceMeters: WGS84 ellipsoid via Karney's algorithm.
//   - rotateAxisAngle, slerp, eulerPoleRotation: unit sphere math —
//     these have no meaningful ellipsoidal analog and are standard in
//     geodynamic models.

import type { Cartesian3 } from './coords'
import { add, cross, dot, normalize, scale } from './_vec'

/**
 * Rotate a Cartesian3 about a unit axis by an angle (radians) using
 * Rodrigues' rotation formula. The axis must be a unit vector; pre-
 * normalize if it isn't already.
 *
 * v_rot = v cos θ + (k × v) sin θ + k (k · v)(1 − cos θ)
 *
 * Frame: unit sphere. Used by slerp's antipodal fallback, by
 * eulerPoleRotation, and by v1 plate tectonics.
 */
export function rotateAxisAngle(
  p: Cartesian3,
  axis: Cartesian3,
  angleRad: number,
): Cartesian3 {
  // Defensive: normalize the axis. Cheap and prevents callers from
  // passing not-quite-unit vectors that drift the result off the sphere.
  const k = normalize(axis)
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const oneMinusCosA = 1 - cosA

  const kCrossP = cross(k, p)
  const kDotP = dot(k, p)

  return add(
    add(scale(p, cosA), scale(kCrossP, sinA)),
    scale(k, kDotP * oneMinusCosA),
  )
}
