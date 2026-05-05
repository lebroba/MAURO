import { describe, expect, it } from 'vitest'
import {
  GOVERNMENTS,
  RELIGIONS,
  CIV_TIERS,
  ECONOMIC_TIER_LABELS,
  type AuditOutput,
  type SliderSuggestion,
} from './types'

describe('nation lookup tables', () => {
  it('GOVERNMENTS has exactly 5 entries with lFloor/lCap', () => {
    expect(Object.keys(GOVERNMENTS)).toHaveLength(5)
    expect(GOVERNMENTS.anarchic).toEqual({ lFloor: 1, lCap: 3 })
    expect(GOVERNMENTS.feudal).toEqual({ lFloor: 3, lCap: 6 })
    expect(GOVERNMENTS.magocracy).toEqual({ lFloor: 4, lCap: 9 })
    expect(GOVERNMENTS.theocracy).toEqual({ lFloor: 5, lCap: 9 })
    expect(GOVERNMENTS.totalitarian).toEqual({ lFloor: 7, lCap: 10 })
  })

  it('RELIGIONS has exactly 4 entries with lBonus', () => {
    expect(Object.keys(RELIGIONS)).toHaveLength(4)
    expect(RELIGIONS.pantheon.lBonus).toBe(0)
    expect(RELIGIONS.sovereign.lBonus).toBe(1)
    expect(RELIGIONS.cult.lBonus).toBe(-2)
    expect(RELIGIONS.secular.lBonus).toBe(0)
  })

  it('CIV_TIERS has 4 entries with score', () => {
    expect(CIV_TIERS.bone.score).toBe(2)
    expect(CIV_TIERS.iron.score).toBe(5)
    expect(CIV_TIERS.stone.score).toBe(7)
    expect(CIV_TIERS.aether.score).toBe(10)
  })

  it('ECONOMIC_TIER_LABELS maps each E value to a tier label', () => {
    expect(ECONOMIC_TIER_LABELS[1]).toBe('Subsistence')
    expect(ECONOMIC_TIER_LABELS[5]).toBe('Mercantile')
    expect(ECONOMIC_TIER_LABELS[10]).toBe('Post-Scarcity')
  })

  it('AuditOutput type has elevationDistribution + suggestions', () => {
    const audit: AuditOutput = {
      areaKm2: 500,
      elevationDistribution: {
        deepWater: 0,
        shallowWater: 0,
        lowland: 0.6,
        midland: 0.3,
        highland: 0.1,
      },
      suggestions: [],
    }
    expect(audit.elevationDistribution.lowland).toBe(0.6)
  })

  it('SliderSuggestion has slider, value, prose', () => {
    const s: SliderSuggestion = { slider: 'E', value: 5, prose: 'test' }
    expect(s.slider).toBe('E')
  })
})
