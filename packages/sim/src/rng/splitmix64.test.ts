import { describe, expect, it } from 'vitest'
import { splitmix64 } from './splitmix64'

describe('splitmix64', () => {
  it('produces a deterministic sequence from a fixed seed', () => {
    const next = splitmix64(0n)
    expect(next()).toBe(0xe220a8397b1dcdafn)
    expect(next()).toBe(0x6e789e6aa1b965f4n)
    expect(next()).toBe(0x06c45d188009454fn)
  })

  it('produces a different sequence for a different seed', () => {
    const a = splitmix64(0n)
    const b = splitmix64(1n)
    expect(a()).not.toBe(b())
  })
})
