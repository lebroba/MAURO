import type { GovernmentKey, ReligionKey } from '../types'
import { GOVERNMENTS, RELIGIONS } from './types'

/**
 * Derive the L (Law Enforcement) facet from government type + religion bonus.
 * Per canonical spec §8.2:
 *   L_min = government.lFloor
 *   L_max = government.lCap
 *   L_raw = round((L_min + L_max) / 2) + religion.lBonus
 *   L_display = clamp(L_raw, L_min, L_max)
 */
export function deriveL(government: GovernmentKey, religion: ReligionKey): number {
  const gov = GOVERNMENTS[government]
  const rel = RELIGIONS[religion]
  const midpoint = Math.round((gov.lFloor + gov.lCap) / 2)
  const raw = midpoint + rel.lBonus
  return Math.max(gov.lFloor, Math.min(gov.lCap, raw))
}

/**
 * Derive the F (Finance) facet from the E (Economic) primary slider.
 * Thin slice: F_suggested(E) = E (per design doc Appendix A.3).
 * Then clamped to [max(1, E-2), min(10, E+2)] per spec §8.2.
 */
export function deriveF(E: number): number {
  const fSuggested = E
  const fMin = Math.max(1, E - 2)
  const fMax = Math.min(10, E + 2)
  return Math.max(fMin, Math.min(fMax, fSuggested))
}

interface PrimaryFacets {
  D: number; C: number; M: number; E: number; I: number; I2: number
}

interface EffectiveFacets {
  M_eff: number
  E_eff: number
  M_star_eff: number
}

/**
 * Derive effective facets. Thin slice stubs all three world-granted pools
 * (Geography, Resources, Magic) at zero contribution — effective values equal
 * primary values for M and E, and M*_eff is always 0. See design doc Appendix
 * A.3 for the rationale.
 */
export function deriveEffective(p: PrimaryFacets): EffectiveFacets {
  const clamp = (v: number) => Math.max(1, Math.min(10, v))
  return {
    M_eff: clamp(p.M),
    E_eff: clamp(p.E),
    M_star_eff: 0,
  }
}
