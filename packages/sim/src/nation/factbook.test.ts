import { describe, expect, it } from 'vitest'
import { renderFactbook } from './factbook'
import type { InterviewState } from '../types'

const BASE: InterviewState = {
  D: 5, C: 5, M: 5, E: 5, I: 5, I2: 5,
  government: 'feudal',
  religion: 'pantheon',
  civTier: 'iron',
  species: 'human',
  currency: 'Gold Pieces',
}

describe('renderFactbook', () => {
  it('returns three sections (I, II, III)', () => {
    const fb = renderFactbook('Iron Duchy', BASE)
    expect(fb.sectionI).toBeDefined()
    expect(fb.sectionII).toBeDefined()
    expect(fb.sectionIII).toBeDefined()
  })

  it('section I includes nation name + civtier + government + religion', () => {
    const fb = renderFactbook('Iron Duchy', BASE)
    expect(fb.sectionI).toContain('Iron Duchy')
    expect(fb.sectionI).toContain('Age of Iron')
    expect(fb.sectionI).toContain('feudal')
    expect(fb.sectionI).toContain('pantheon')
  })

  it('section II shows DIME values (M_eff, M*_eff, Intel, I, E_eff, F)', () => {
    const fb = renderFactbook('Iron Duchy', BASE)
    expect(fb.sectionII).toMatch(/M[_:].*5/)
    expect(fb.sectionII).toMatch(/M\*[_:].*0/) // stubbed in thin slice
    expect(fb.sectionII).toContain('5') // E_eff
  })

  it('section III mentions species', () => {
    const fb = renderFactbook('Iron Duchy', BASE)
    expect(fb.sectionIII).toContain('human')
  })

  it('determinism: same inputs → byte-identical output', () => {
    const a = renderFactbook('Iron Duchy', BASE)
    const b = renderFactbook('Iron Duchy', BASE)
    expect(a).toEqual(b)
  })

  it('boundary E=10 prose tier label = Post-Scarcity', () => {
    const fb = renderFactbook('X', { ...BASE, E: 10 })
    expect(fb.sectionII).toContain('Post-Scarcity')
  })

  it('boundary E=1 prose tier label = Subsistence', () => {
    const fb = renderFactbook('X', { ...BASE, E: 1 })
    expect(fb.sectionII).toContain('Subsistence')
  })

  it('thin slice footnote mentions deferred world-pool taps', () => {
    const fb = renderFactbook('Iron Duchy', BASE)
    expect(fb.sectionII).toMatch(/deferred|World-pool|v0\.1/i)
  })
})
