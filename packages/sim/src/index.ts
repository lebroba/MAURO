// Pure surface — safe to import from client components.
// Server-only WorldQuery + factories live in '@mauro/sim/server'.

export * from './types'
export { splitmix64 } from './rng/splitmix64'
export {
  xoshiro256ss,
  xoshiro256ssFromState,
  type Xoshiro256,
} from './rng/xoshiro256'
export { applyEvent, pointInPolygon } from './events/applyEvent'
export {
  type AuditOutput,
  type ElevationDistribution,
  type SliderSuggestion,
} from './nation/types'

export { applyCascadeRules, explainRule, type CascadeResult } from './nation/cascade'

export { auditPolygon, ELEVATION_THRESHOLDS } from './nation/audit'

export { renderFactbook, type Factbook } from './nation/factbook'

export const PACKAGE_NAME = '@mauro/sim'
