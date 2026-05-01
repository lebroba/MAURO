// Coordinate types and conversions for the sphere substrate.
//
// Three coordinate frames coexist intentionally per the spec:
//   - LonLat: API surface — degrees, [-180, 180), [-90, 90]
//   - Cartesian3 (unit sphere frame): internal math for rotation, slerp,
//     noise sampling. Documented per use site.
//   - ECEF (WGS84 frame): real-world 3D position in meters from Earth
//     center. For export, GIS interop, geodetic position. (Added in Task 5.)
//   - TilePixel: storage / raster I/O only. (Added in Task 6.)
//
// The two `{ x, y, z }` shapes share a structural type but represent
// different frames. We don't use branded types — JSDoc on every signature
// names the frame.

export interface LonLat {
  /** Longitude in degrees, canonical range [-180, 180). */
  lonDeg: number
  /** Latitude in degrees, canonical range [-90, 90]. */
  latDeg: number
}

/**
 * 3D Cartesian point. The frame is documented per use site:
 *   - Unit sphere frame (length 1, dimensionless) for rotation/slerp/noise.
 *   - ECEF (length in meters from Earth center, WGS84) for geodetic position.
 */
export interface Cartesian3 {
  x: number
  y: number
  z: number
}

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Convert a LonLat to a Cartesian3 on the unit sphere (length 1).
 * Frame: unit sphere. Use for rotation/slerp/noise sampling.
 */
export function lonLatToCartesian(p: LonLat): Cartesian3 {
  const lonRad = p.lonDeg * DEG_TO_RAD
  const latRad = p.latDeg * DEG_TO_RAD
  const cosLat = Math.cos(latRad)
  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad),
  }
}

/**
 * Convert a unit-sphere Cartesian3 back to LonLat.
 * Frame: unit sphere. Inverse of lonLatToCartesian for inputs of length 1.
 * For non-unit inputs, normalizes implicitly via atan2/asin.
 */
export function cartesianToLonLat(p: Cartesian3): LonLat {
  // atan2 handles all four quadrants and the lon = ±π edge cleanly.
  const lonRad = Math.atan2(p.y, p.x)
  // Clamp asin argument to [-1, 1] — float drift can produce 1.0000000001.
  const z = Math.max(-1, Math.min(1, p.z))
  const latRad = Math.asin(z)
  return {
    lonDeg: lonRad * RAD_TO_DEG,
    latDeg: latRad * RAD_TO_DEG,
  }
}

/**
 * Wrap a longitude in degrees to the canonical range [-180, 180).
 * Critical for seam continuity: float drift across rotations produces
 * 180.0000001-shaped values, and one canonical wrap point prevents seam
 * bugs (rule 10c).
 */
export function normalizeLon(deg: number): number {
  // Fast path: already canonical. Avoids float drift from modulo on
  // in-range values (e.g., 179.999 stays exactly 179.999 instead of
  // drifting to 179.99900000000002).
  if (deg >= -180 && deg < 180) return deg === 0 ? 0 : deg
  // Wrap into [-180, 180). The +180 → -180 mapping is intentional: 180
  // and -180 are the same meridian, and we pick -180 as canonical.
  let result = ((deg + 180) % 360 + 360) % 360 - 180
  if (result === 180) return -180
  return result === 0 ? 0 : result
}

/** Clamp a latitude in degrees to [-90, 90]. */
export function clampLat(deg: number): number {
  if (deg > 90) return 90
  if (deg < -90) return -90
  return deg
}
