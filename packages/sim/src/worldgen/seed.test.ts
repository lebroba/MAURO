import { describe, expect, it } from 'vitest'
import { mixSeedString, encodeSeedHex, parseSeedHex } from './seed'

describe('seed — string mixing', () => {
  it('produces 4 × u64 (BigInt) state from any string', () => {
    const state = mixSeedString('hello')
    expect(state).toHaveLength(4)
    state.forEach((s) => {
      expect(typeof s).toBe('bigint')
      expect(s).toBeGreaterThanOrEqual(0n)
      expect(s).toBeLessThan(1n << 64n)
    })
  })

  it('is deterministic for the same input', () => {
    const a = mixSeedString('hello')
    const b = mixSeedString('hello')
    expect(a).toEqual(b)
  })

  it('produces different states for different inputs', () => {
    const a = mixSeedString('hello')
    const b = mixSeedString('world')
    expect(a).not.toEqual(b)
  })

  it('rejects empty string with a clear error', () => {
    expect(() => mixSeedString('')).toThrow(/empty/i)
  })

  it('handles unicode without throwing', () => {
    expect(() => mixSeedString('世界')).not.toThrow()
  })
})

describe('seed — hex round-trip', () => {
  it('encodes 4 × u64 as a single hex string', () => {
    const state: [bigint, bigint, bigint, bigint] = [1n, 2n, 3n, 4n]
    const hex = encodeSeedHex(state)
    expect(hex).toMatch(/^[0-9a-f]+$/)
    expect(hex.length).toBe(64) // 4 × 16 hex chars
  })

  it('round-trips encode → parse', () => {
    const original: [bigint, bigint, bigint, bigint] = [
      0xdeadbeefcafebafen,
      0x1n,
      0xffffffffffffffffn,
      0x9e3779b97f4a7c15n,
    ]
    const hex = encodeSeedHex(original)
    const parsed = parseSeedHex(hex)
    expect(parsed).toEqual(original)
  })

  it('parseSeedHex rejects malformed input', () => {
    expect(() => parseSeedHex('not-hex')).toThrow(/hex/i)
    expect(() => parseSeedHex('abc')).toThrow(/64/)
  })
})
