// Geodesy primitives — distances, rotations, slerp, Euler-pole rotation.
//
// Per the spec's hybrid coordinate-frame policy:
//   - greatCircleDistanceMeters: unit sphere math (Haversine), fast.
//   - geodesicDistanceMeters: WGS84 ellipsoid via Karney's algorithm.
//   - rotateAxisAngle, slerp, eulerPoleRotation: unit sphere math —
//     these have no meaningful ellipsoidal analog and are standard in
//     geodynamic models.

import {
  cartesianToLonLat,
  lonLatToCartesian,
  type Cartesian3,
  type LonLat,
} from './coords'
import { add, cross, dot, lerp, normalize, scale } from './_vec'
import { WGS84 } from './wgs84'

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

const DEG_TO_RAD = Math.PI / 180
const EPSILON_SAME = 1e-10
const EPSILON_ANTIPODAL = 1e-10

/**
 * Spherical linear interpolation between two unit vectors. Standard slerp
 * formula with two edge-case branches:
 *   - Nearly identical (cos Ω > 1 − ε): linear interp + normalize.
 *     Avoids dividing by sin(Ω) ≈ 0; the great-circle path is degenerate
 *     anyway because a ≈ b.
 *   - Nearly antipodal (cos Ω < −1 + ε): no canonical great circle exists.
 *     We pick a deterministic perpendicular axis via perpendicularFallback
 *     and rotate `a` by t·π about it. Same input → same output across runs.
 *
 * Frame: unit sphere. Inputs assumed unit-length; a non-unit-length input
 * will give wrong results without throwing.
 */
export function slerp(a: Cartesian3, b: Cartesian3, t: number): Cartesian3 {
  const cosOmega = dot(a, b)

  if (cosOmega > 1 - EPSILON_SAME) {
    // Nearly identical: linear interp + normalize.
    return normalize(lerp(a, b, t))
  }

  if (cosOmega < -1 + EPSILON_ANTIPODAL) {
    // Antipodal: rotate `a` by t·π about a deterministic perpendicular axis.
    const axis = perpendicularFallback(a)
    return rotateAxisAngle(a, axis, t * Math.PI)
  }

  // Standard slerp.
  const omega = Math.acos(cosOmega)
  const sinOmega = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / sinOmega
  const wb = Math.sin(t * omega) / sinOmega
  return add(scale(a, wa), scale(b, wb))
}

/**
 * Pick a deterministic unit vector perpendicular to `a`. Used by slerp's
 * antipodal branch. The convention is fixed so that same input → same
 * output across runs.
 *
 *   axis = a × (1, 0, 0), unless a ≈ ±(1, 0, 0), in which case
 *   axis = a × (0, 1, 0).
 *
 * The result is guaranteed perpendicular to `a` and unit-length.
 */
function perpendicularFallback(a: Cartesian3): Cartesian3 {
  // Use (1,0,0) as the reference axis unless a is too close to it
  // (then the cross product collapses to zero).
  const reference: Cartesian3 =
    Math.abs(a.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  return normalize(cross(a, reference))
}

/**
 * Rotate a LonLat point about an Euler pole (axis through the planet's
 * center, defined by its surface lat/lon) by an angle in radians.
 *
 * Foundation primitive for plate tectonics (rule 10a). v1 plate-tectonics
 * simulation calls this in a loop per cell per timestep — the geometry is
 * here from day one so the simulation only needs to model plate state and
 * integrate over time.
 *
 * Implementation: convert pole and point to unit-sphere Cartesian, apply
 * Rodrigues' rotation, convert back. Composition is associative within
 * float precision.
 */
export function eulerPoleRotation(
  p: LonLat,
  pole: LonLat,
  angleRad: number,
): LonLat {
  const pCart = lonLatToCartesian(p)
  const axisCart = lonLatToCartesian(pole)
  const rotated = rotateAxisAngle(pCart, axisCart, angleRad)
  return cartesianToLonLat(rotated)
}

/**
 * Great-circle distance between two LonLat points using the Haversine
 * formula on a perfect sphere. Default `radius` is the WGS84 mean radius
 * (6,371,008.8 m) — the standard "spherical Earth" approximation.
 *
 * Use for "is this within X of that" checks where ellipsoid precision
 * doesn't matter. For Earth-correct precision (e.g., reporting kilometers
 * to a user), use geodesicDistanceMeters which uses WGS84 via Karney.
 *
 * The Haversine form is numerically stable for all distances including
 * antipodal — unlike the spherical law of cosines, which loses precision
 * for short distances.
 */
export function greatCircleDistanceMeters(
  a: LonLat,
  b: LonLat,
  radius: number = WGS84.MEAN_RADIUS_METERS,
): number {
  const lat1 = a.latDeg * DEG_TO_RAD
  const lat2 = b.latDeg * DEG_TO_RAD
  const dLat = lat2 - lat1
  const dLon = (b.lonDeg - a.lonDeg) * DEG_TO_RAD

  const sinHalfDLat = Math.sin(dLat / 2)
  const sinHalfDLon = Math.sin(dLon / 2)
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLon * sinHalfDLon

  // 2 · asin(min(1, √h)) — clamp guards against float drift producing
  // h slightly > 1 for antipodal inputs.
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}
