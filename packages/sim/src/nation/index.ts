// Public surface of the nation library. Re-exports only.
// See docs/superpowers/specs/2026-05-04-dime-thin-slice-design.md for context.

export {
  GOVERNMENTS,
  RELIGIONS,
  CIV_TIERS,
  ECONOMIC_TIER_LABELS,
  type AuditOutput,
  type ElevationDistribution,
  type GovernmentDef,
  type ReligionDef,
  type CivTierDef,
  type SliderSuggestion,
} from './types'

export { deriveL, deriveF, deriveEffective } from './derived'

export { applyCascadeRules, explainRule, type CascadeResult } from './cascade'

export { auditPolygon, ELEVATION_THRESHOLDS } from './audit'

export { renderFactbook, type Factbook } from './factbook'
