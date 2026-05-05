import { describe, expect, it } from 'vitest'
import { deriveL, deriveF, deriveEffective } from './derived'
import type { GovernmentKey, ReligionKey } from '../types'

describe('deriveL', () => {
  it.each<[GovernmentKey, ReligionKey, number, number, number]>([
    // [government, religion, expectedMin, expectedMax, expectedDefault]
    ['anarchic', 'pantheon', 1, 3, 2],
    ['feudal', 'pantheon', 3, 6, 5],     // round((3+6)/2) = 5
    ['magocracy', 'sovereign', 4, 9, 8], // round((4+9)/2) + 1 = 8 → clamped to cap=9, so result = 8
    ['theocracy', 'cult', 5, 9, 5],      // round((5+9)/2) - 2 = 5
    ['totalitarian', 'pantheon', 7, 10, 9], // round((7+10)/2) = 9
  ])('government=%s religion=%s → L in [%i, %i], default=%i', (gov, rel, _min, _max, def) => {
    const result = deriveL(gov, rel)
    expect(result).toBe(def)
  })

  it('clamps the religion bonus inside the government band', () => {
    // theocracy floor=5 cap=9, religion=cult lBonus=-2 → midpoint 7 - 2 = 5 (still in band)
    expect(deriveL('theocracy', 'cult')).toBe(5)
    // anarchic floor=1 cap=3, religion=sovereign lBonus=+1 → midpoint 2 + 1 = 3 (still in band)
    expect(deriveL('anarchic', 'sovereign')).toBe(3)
  })
})

describe('deriveF', () => {
  it.each<[number, number]>([
    [1, 1],
    [5, 5],
    [10, 10],
  ])('E=%i → F=%i (thin slice: F_suggested = E)', (E, expected) => {
    expect(deriveF(E)).toBe(expected)
  })
})

describe('deriveEffective', () => {
  it('thin slice: world-pool taps return primary values unchanged', () => {
    const eff = deriveEffective({ M: 5, E: 7, I: 4, I2: 6, D: 3, C: 8 })
    expect(eff.M_eff).toBe(5)
    expect(eff.E_eff).toBe(7)
    expect(eff.M_star_eff).toBe(0)  // magic pool stubbed at 0
  })

  it('clamps effective values into [1, 10]', () => {
    const eff = deriveEffective({ M: 12, E: -3, I: 5, I2: 5, D: 5, C: 5 })
    expect(eff.M_eff).toBe(10)
    expect(eff.E_eff).toBe(1)
  })
})
