// Public surface of the sphere substrate library. Re-exports only.
// Internal helpers (_vec, _rng) are NOT re-exported.
//
// Per the spec: no top-level re-export from @mauro/sim's index.ts until
// v1 has a real consumer (avoids freezing the API too early). For now,
// import as: import { ... } from './sphere' from inside packages/sim.

export {
  WGS84,
} from './wgs84'

export {
  cartesianToLonLat,
  clampLat,
  ecefToLonLat,
  lonLatToCartesian,
  lonLatToECEF,
  lonLatToTilePixel,
  normalizeLon,
  tilePixelToLonLat,
  type Cartesian3,
  type ECEF,
  type LonLat,
  type TilePixel,
  type TileRegion,
} from './coords'

export {
  eulerPoleRotation,
  geodesicDistanceMeters,
  greatCircleDistanceMeters,
  rotateAxisAngle,
  slerp,
} from './geodesy'

export {
  cellAreaSqMeters,
  cellAreaSqMetersWGS84,
  cellAreaSterad,
  isPolarZone,
  latitudeBand,
  type LatitudeBand,
} from './area'

export {
  sampleSphereNoise,
  type SphereNoiseParams,
} from './noise'

export {
  areaWeightedAccumulate,
  cosineWeightedPoisson,
  uniformOnSphere,
} from './distribution'
