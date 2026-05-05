import type { InterviewState, ReligionKey, CivTierKey } from '../types'

export interface CascadeResult {
  state: InterviewState
  /** Rule ids that fired during this pass. UI uses these to surface tooltips. */
  firedRules: string[]
}

const RULE_EXPLANATIONS: Record<string, string> = {
  anarchy_constraint: "You can't have a police state without a state.",
  theocratic_anchor: 'A theocracy by definition has an organized state religion.',
  industrial_minimum: 'Refined goods and trade guilds require at least Feudal-High organization.',
  magic_integration: 'High-ritual magic enables thought-level communication infrastructure.',
  diplomatic_pariah: 'No one sends embassies to pariahs.',
}

export function explainRule(ruleId: string): string {
  return RULE_EXPLANATIONS[ruleId] ?? ''
}

/**
 * Apply 5 cascading rules to the interview state. Pure function — input is
 * not mutated; returns a new state plus the list of rule ids that fired.
 *
 * Hardcoded rules (NOT pluggable) per /plan-eng-review issue 2A. When the
 * count grows past ~5, refactor to spec §10's pluggable engine.
 */
export function applyCascadeRules(input: InterviewState): CascadeResult {
  const state: InterviewState = { ...input }
  const firedRules: string[] = []

  // Rule 1 — Anarchy Constraint: government=anarchic → flag (L is derived,
  // so the clamp happens in deriveL; this rule's role is to fire the tooltip).
  if (state.government === 'anarchic') {
    firedRules.push('anarchy_constraint')
  }

  // Rule 2 — Theocratic Anchor: theocracy → religion ≠ secular, C floor 4.
  if (state.government === 'theocracy') {
    if (state.religion === 'secular') {
      // Force the most "non-secular" default: pantheon.
      const forced: ReligionKey = 'pantheon'
      state.religion = forced
      firedRules.push('theocratic_anchor')
    }
    if (state.C < 4) {
      state.C = 4
      if (!firedRules.includes('theocratic_anchor')) {
        firedRules.push('theocratic_anchor')
      }
    }
  }

  // Rule 3 — Industrial Minimum: E≥5 → civTier ≥ stone.
  if (state.E >= 5) {
    if (state.civTier === 'bone' || state.civTier === 'iron') {
      const forced: CivTierKey = 'stone'
      state.civTier = forced
      firedRules.push('industrial_minimum')
    }
  }

  // Rule 4 — Magic Integration: M*_eff ≥ 7 enables Telepathic Consensus.
  // M*_eff is 0 in thin slice (Magic pool stubbed), so this rule never fires.
  // Rule definition kept for spec parity; will fire once Magic pool ships.

  // Rule 5 — Diplomatic Pariah: D=1.
  if (state.D === 1) {
    firedRules.push('diplomatic_pariah')
  }

  return { state, firedRules }
}
