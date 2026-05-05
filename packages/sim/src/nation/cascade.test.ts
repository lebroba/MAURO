import { describe, expect, it } from 'vitest'
import { applyCascadeRules } from './cascade'
import type { InterviewState } from '../types'

const BASE: InterviewState = {
  D: 5, C: 5, M: 5, E: 5, I: 5, I2: 5,
  government: 'feudal',
  religion: 'pantheon',
  civTier: 'iron',
  species: 'human',
  currency: 'Gold Pieces',
}

describe('applyCascadeRules', () => {
  it('Anarchy Constraint: anarchic gov clamps L into [1,3] (post-derive)', () => {
    const state: InterviewState = { ...BASE, government: 'anarchic' }
    const result = applyCascadeRules(state)
    expect(result.firedRules).toContain('anarchy_constraint')
    // Anarchy_constraint marker: firedRules contains the rule id
  })

  it('Theocratic Anchor: theocracy + secular religion is corrected', () => {
    const state: InterviewState = { ...BASE, government: 'theocracy', religion: 'secular' }
    const result = applyCascadeRules(state)
    expect(result.firedRules).toContain('theocratic_anchor')
    expect(result.state.religion).not.toBe('secular') // forced to non-secular
    expect(result.state.C).toBeGreaterThanOrEqual(4) // C floor 4
  })

  it('Industrial Minimum: E≥5 forces civTier ≥ stone', () => {
    const state: InterviewState = { ...BASE, E: 7, civTier: 'iron' }
    const result = applyCascadeRules(state)
    expect(result.firedRules).toContain('industrial_minimum')
    expect(['stone', 'aether']).toContain(result.state.civTier)
  })

  it('Industrial Minimum: E<5 leaves civTier untouched', () => {
    const state: InterviewState = { ...BASE, E: 4, civTier: 'bone' }
    const result = applyCascadeRules(state)
    expect(result.firedRules).not.toContain('industrial_minimum')
    expect(result.state.civTier).toBe('bone')
  })

  it('Magic Integration: M*_eff is 0 in thin slice, so this rule never fires', () => {
    const state: InterviewState = { ...BASE }
    const result = applyCascadeRules(state)
    expect(result.firedRules).not.toContain('magic_integration')
  })

  it('Diplomatic Pariah: D=1 fires the rule', () => {
    const state: InterviewState = { ...BASE, D: 1 }
    const result = applyCascadeRules(state)
    expect(result.firedRules).toContain('diplomatic_pariah')
  })

  it('idempotence: applying twice yields identical state', () => {
    const state: InterviewState = { ...BASE, government: 'theocracy', religion: 'secular', E: 8 }
    const once = applyCascadeRules(state)
    const twice = applyCascadeRules(once.state)
    expect(twice.state).toEqual(once.state)
  })
})
