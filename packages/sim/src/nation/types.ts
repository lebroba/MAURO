// Lookup tables and supporting types for the DIME-Plus thin slice.
// Sourced from canonical project_aria spec §9 (Government/Religion/CivTier
// tables) and the MAURO design doc Appendix A.1 (elevation-distribution audit).

import type { GovernmentKey, ReligionKey, CivTierKey } from '../types'

// ---- Government table (spec §9.1) -----------------------------------------

export interface GovernmentDef {
  /** Lower bound for the derived L (Law Enforcement) facet. */
  lFloor: number
  /** Upper bound for the derived L facet. */
  lCap: number
}

export const GOVERNMENTS: Record<GovernmentKey, GovernmentDef> = {
  anarchic: { lFloor: 1, lCap: 3 },
  feudal: { lFloor: 3, lCap: 6 },
  magocracy: { lFloor: 4, lCap: 9 },
  theocracy: { lFloor: 5, lCap: 9 },
  totalitarian: { lFloor: 7, lCap: 10 },
}

// ---- Religion table (spec §9.2) -------------------------------------------

export interface ReligionDef {
  /** Additive bonus to the derived L value. */
  lBonus: number
  /** Additive bonus to the I² (Intelligence) primary slider. */
  intelBonus: number
}

export const RELIGIONS: Record<ReligionKey, ReligionDef> = {
  pantheon: { lBonus: 0, intelBonus: 0 },
  sovereign: { lBonus: 1, intelBonus: 0 },
  cult: { lBonus: -2, intelBonus: 1 },
  secular: { lBonus: 0, intelBonus: 0 },
}

// ---- Civ tier table (spec §9.4) -------------------------------------------

export interface CivTierDef {
  /** 0..10 score used in tap formulas (currently unused in thin slice). */
  score: number
  /** Display label for the factbook prose. */
  display: string
}

export const CIV_TIERS: Record<CivTierKey, CivTierDef> = {
  bone: { score: 2, display: 'Age of Bone (Tribal)' },
  iron: { score: 5, display: 'Age of Iron (Feudal-Early)' },
  stone: { score: 7, display: 'Age of Stone (Feudal-High)' },
  aether: { score: 10, display: 'Age of Aether (High Magic)' },
}

// ---- Economic tier labels (spec §9.3) -------------------------------------

export const ECONOMIC_TIER_LABELS: Record<number, string> = {
  1: 'Subsistence', 2: 'Subsistence',
  3: 'Agrarian / Extractive', 4: 'Agrarian / Extractive',
  5: 'Mercantile', 6: 'Mercantile',
  7: 'Monopoly', 8: 'Monopoly',
  9: 'Post-Scarcity', 10: 'Post-Scarcity',
}

// ---- Audit output ---------------------------------------------------------

export interface ElevationDistribution {
  deepWater: number       // fraction in [0..1]
  shallowWater: number
  lowland: number
  midland: number
  highland: number
}

export interface SliderSuggestion {
  /** Which primary slider this suggestion targets. */
  slider: 'D' | 'C' | 'M' | 'E' | 'I' | 'I2'
  /** Suggested value 1..10. */
  value: number
  /** Tooltip/prose fragment for the "Align to Audit" button. */
  prose: string
}

export interface AuditOutput {
  areaKm2: number
  elevationDistribution: ElevationDistribution
  suggestions: SliderSuggestion[]
}
