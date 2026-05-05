import type { InterviewState } from '../types'
import { CIV_TIERS, ECONOMIC_TIER_LABELS } from './types'
import { deriveL, deriveF, deriveEffective } from './derived'

export interface Factbook {
  sectionI: string  // Sovereignty & Spirit
  sectionII: string // Power Projection (DIME+)
  sectionIII: string // Field Notes
}

/**
 * Render the GM-facing Intelligence Briefing factbook (sections I, II, III).
 * Sections IV (Anomalies) and V (Campaign Hooks) are deferred per design doc.
 * Pure function over (name, interview) — derived facets are computed inline
 * from InterviewState. Determinism contract: same input → byte-identical
 * output (no RNG, no time-dependent values).
 *
 * Voice register: CIA Factbook + Royal Geographical Society per DESIGN.md
 * Cartographic Intelligence direction. Editorial restraint, operational
 * density. Templates avoid emoji, AI-speak, and marketing copy.
 */
export function renderFactbook(name: string, interview: InterviewState): Factbook {
  const L = deriveL(interview.government, interview.religion)
  const F = deriveF(interview.E)
  const eff = deriveEffective({
    D: interview.D, C: interview.C, M: interview.M,
    E: interview.E, I: interview.I, I2: interview.I2,
  })

  const civDisplay = CIV_TIERS[interview.civTier].display
  const econLabel = ECONOMIC_TIER_LABELS[interview.E] ?? 'Mercantile'

  const sectionI = [
    `${name} — Strategic Assessment`,
    `${'═'.repeat(40)}`,
    ``,
    `I. Sovereignty & Spirit`,
    `   Identity        : ${civDisplay} ${interview.government} following ${interview.religion}`,
    `   Stability Index : L-${L} — ${lawProse(L)}`,
    `   Prestige        : C-${interview.C} — ${cultureProse(interview.C)}`,
    `   External Stance : D-${interview.D} — ${diplomacyProse(interview.D)}`,
  ].join('\n')

  const sectionII = [
    ``,
    `II. Power Projection (DIME+)`,
    `   Hard Power   : Military M_eff: ${eff.M_eff} · Magic M*_eff: ${eff.M_star_eff}`,
    `   Shadow Power : Intelligence I²: ${interview.I2} · Information I: ${interview.I}`,
    `   Sustenance   : Economic E_eff: ${eff.E_eff} · Financial F: ${F} (${econLabel})`,
    ``,
    `   (World-pool taps deferred to v0.1; effective values equal slider values for now.)`,
  ].join('\n')

  const sectionIII = [
    ``,
    `III. Field Notes`,
    `   Population is primarily ${interview.species}.`,
    `   Currency: ${interview.currency}.`,
    `   Magic levels are ${magicLevelProse(eff.M_star_eff)}.`,
  ].join('\n')

  return { sectionI, sectionII, sectionIII }
}

function lawProse(L: number): string {
  if (L <= 2) return 'enforcement is local and informal'
  if (L <= 4) return 'rule of law exists but is patchy outside major settlements'
  if (L <= 7) return 'consistent enforcement across the realm'
  return 'pervasive surveillance and control'
}

function cultureProse(C: number): string {
  if (C <= 2) return 'limited cultural cohesion'
  if (C <= 4) return 'regional traditions, modest soft power'
  if (C <= 7) return 'distinctive identity carries weight beyond borders'
  return 'a cultural lodestone for the surrounding region'
}

function diplomacyProse(D: number): string {
  if (D <= 1) return 'pariah; foreign embassies declined or expelled'
  if (D <= 4) return 'limited foreign engagement'
  if (D <= 7) return 'active diplomacy with most neighbors'
  return 'a regional power broker'
}

function magicLevelProse(mEff: number): string {
  if (mEff === 0) return 'available for cantrips and minor ritual use'
  if (mEff <= 3) return 'sufficient for first-level spells in trained hands'
  if (mEff <= 6) return 'sufficient for mid-tier spells; some institutional magic exists'
  return 'pervasive — high-tier ritual magic shapes daily life'
}
