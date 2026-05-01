// Cell area, latitude bands, and polar-zone classification.
//
// Spherical cell area uses Archimedes' hat-box theorem:
//   dA = R² · |sin(φ₁) − sin(φ₂)| · dλ
// where φ₁, φ₂ are the cell's bottom/top latitudes in radians, dλ is the
// cell's longitude extent in radians. This is exact for a sphere — it
// is NOT the small-cosine-times-rect approximation, which has error at
// high latitudes.
//
// WGS84 ellipsoidal cell area lives in cellAreaSqMetersWGS84 (Task 14).

import { WGS84 } from './wgs84'

const DEG_TO_RAD = Math.PI / 180

/**
 * Cell area in steradians (unit-sphere area). For a cell centered at
 * `latDeg` with extent `dLatDeg` × `dLonDeg`. Range: [0, 4π].
 */
export function cellAreaSterad(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
): number {
  const lat1Rad = (latDeg - dLatDeg / 2) * DEG_TO_RAD
  const lat2Rad = (latDeg + dLatDeg / 2) * DEG_TO_RAD
  const dLonRad = dLonDeg * DEG_TO_RAD
  return Math.abs(Math.sin(lat2Rad) - Math.sin(lat1Rad)) * dLonRad
}

/**
 * Cell area in square meters on a sphere of radius `radius`. Default
 * radius is the WGS84 mean radius (6,371,008.8 m). For ellipsoid-correct
 * area, use cellAreaSqMetersWGS84 (Task 14).
 */
export function cellAreaSqMeters(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
  radius: number = WGS84.MEAN_RADIUS_METERS,
): number {
  return cellAreaSterad(latDeg, dLatDeg, dLonDeg) * radius * radius
}

/** Climatological latitude bands. Uses |lat| — same band for both hemispheres. */
export type LatitudeBand =
  | 'tropical'
  | 'subtropical'
  | 'temperate'
  | 'subpolar'
  | 'polar'

/**
 * Classify a latitude into a climatological band. Standard thresholds:
 *   tropical    [0°,    23.5°)
 *   subtropical [23.5°, 35°)
 *   temperate   [35°,   55°)
 *   subpolar    [55°,   66.5°)
 *   polar       [66.5°, 90°]
 *
 * Used as the "latitude is a first-class coordinate" primitive that
 * v1+ climate work builds on (rule 10d).
 */
export function latitudeBand(latDeg: number): LatitudeBand {
  const absLat = Math.abs(latDeg)
  if (absLat < 23.5) return 'tropical'
  if (absLat < 35) return 'subtropical'
  if (absLat < 55) return 'temperate'
  if (absLat < 66.5) return 'subpolar'
  return 'polar'
}

/**
 * Render-distortion-zone classifier per Architecture Principle #10e.
 * Returns true for |lat| >= 80°. Distinct from the climatological 'polar'
 * band, which begins at 66.5°. This is a rendering policy, not a
 * climate fact: equirectangular rendering smears polar cells into
 * triangular wedges, so the policy is "no important named features here,
 * heightmap tends to constant, climate is uniform-cold."
 */
export function isPolarZone(latDeg: number): boolean {
  return Math.abs(latDeg) >= 80
}

/**
 * Cell area in square meters on the WGS84 ellipsoid. For a cell centered
 * at `latDeg` with extent `dLatDeg` × `dLonDeg`. Uses the closed-form
 * ellipsoidal surface integral:
 *
 *   A = ∫∫ √(EG − F²) dφ dλ
 *
 * For a geographic cell (constant longitude bounds), this evaluates to
 * a function of sin(φ) and an "authalic" component captured by the
 * eccentricity. Exact closed form (Snyder 1987, eq. 3-11):
 *
 *   q(φ) = (1 − e²) [ sin φ / (1 − e² sin² φ) − (1/2e) ln((1 − e sinφ)/(1 + e sinφ)) ]
 *   A_cell = (a² · dλ / 2) · |q(φ₂) − q(φ₁)|
 *
 * where a is the equatorial (semi-major) radius. (Spec doc originally
 * said b² but that was a bug — derivation: dA = a²(1−e²) cos(φ) /
 * (1 − e² sin²φ)² dφ dλ, and dq/dφ = 2(1−e²) cos(φ) / (1 − e² sin²φ)²,
 * so dA = (a²/2) dq dλ. The b² version under-reports surface area by
 * ~0.67%.) Use for user-facing areas (km², resource
 * density). For abstract per-band weighting where ~0.5% accuracy is fine,
 * cellAreaSqMeters with the mean radius is cheaper.
 */
export function cellAreaSqMetersWGS84(
  latDeg: number,
  dLatDeg: number,
  dLonDeg: number,
): number {
  const lat1Rad = (latDeg - dLatDeg / 2) * DEG_TO_RAD
  const lat2Rad = (latDeg + dLatDeg / 2) * DEG_TO_RAD
  const dLonRad = dLonDeg * DEG_TO_RAD
  const e = Math.sqrt(WGS84.E2)
  const oneMinusE2 = 1 - WGS84.E2
  const a2 = WGS84.A_METERS * WGS84.A_METERS

  // Area element = a²(1-e²)cos(φ)/(1-e²sin²φ)² = (a²/2) · dq/dφ
  // → A_cell = (a² · Δλ / 2) · |q(φ₂) − q(φ₁)|
  return (a2 * dLonRad / 2) * Math.abs(qFunc(lat2Rad, e, oneMinusE2) - qFunc(lat1Rad, e, oneMinusE2))
}

/** Snyder's q function — auxiliary for ellipsoid surface integral. */
function qFunc(phi: number, e: number, oneMinusE2: number): number {
  const sinPhi = Math.sin(phi)
  const eSinPhi = e * sinPhi
  return (
    (sinPhi / (1 - WGS84.E2 * sinPhi * sinPhi)) -
    (1 / (2 * e)) * Math.log((1 - eSinPhi) / (1 + eSinPhi))
  ) * oneMinusE2
}
