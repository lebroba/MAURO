// WGS84 ellipsoid constants — World Geodetic System 1984.
//
// All real-Earth source data MAURO consumes (NASA SRTM, GEBCO, ETOPO,
// COP30) is referenced to WGS84. These constants are the foundation for
// any computation that needs to produce real-world units (kilometers,
// square kilometers, ECEF positions).
//
// Per Architecture Principle #10's hybrid policy, the substrate uses
// WGS84 for distance/area/ECEF and unit-sphere math for rotation/slerp/
// noise/plate-tectonics.

const A = 6378137.0
const F = 1 / 298.257223563
const B = A * (1 - F)
const E2 = 2 * F - F * F
const E_PRIME2 = E2 / (1 - E2)

// WGS84 mean radius R1 = (2A + B) / 3 ≈ 6371008.8 m. This is the
// canonical "spherical Earth" approximation — used as the default radius
// for sphere-math distance and area where ellipsoid precision is not
// required.
const MEAN_RADIUS = (2 * A + B) / 3

export const WGS84 = {
  A_METERS: A,
  F,
  B_METERS: B,
  E2,
  E_PRIME2,
  MEAN_RADIUS_METERS: Math.round(MEAN_RADIUS * 10) / 10, // 6371008.8
} as const
