import { describe, expect, it } from 'vitest'
import { rotateAxisAngle, slerp } from './geodesy'
import { lonLatToCartesian, type Cartesian3 } from './coords'

describe('rotateAxisAngle', () => {
  it('returns the input unchanged for angle 0', () => {
    const p: Cartesian3 = { x: 1, y: 0, z: 0 }
    const r = rotateAxisAngle(p, { x: 0, y: 0, z: 1 }, 0)
    expect(r.x).toBeCloseTo(1, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('rotates (1,0,0) by 90° about Z to (0,1,0)', () => {
    const r = rotateAxisAngle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('rotates (0,1,0) by 90° about X to (0,0,1)', () => {
    const r = rotateAxisAngle({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, Math.PI / 2)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(1, 12)
  })

  it('returns to start after a full 2π rotation', () => {
    const p = lonLatToCartesian({ lonDeg: 37, latDeg: 53 })
    const axis = lonLatToCartesian({ lonDeg: -100, latDeg: 12 })
    const r = rotateAxisAngle(p, axis, 2 * Math.PI)
    expect(r.x).toBeCloseTo(p.x, 10)
    expect(r.y).toBeCloseTo(p.y, 10)
    expect(r.z).toBeCloseTo(p.z, 10)
  })

  it('preserves length for any unit-axis rotation (orthonormal)', () => {
    const p = lonLatToCartesian({ lonDeg: -73.5, latDeg: 40.7 })
    const axis = lonLatToCartesian({ lonDeg: 130, latDeg: -25 })
    const r = rotateAxisAngle(p, axis, 1.234)
    const lengthSq = r.x * r.x + r.y * r.y + r.z * r.z
    expect(lengthSq).toBeCloseTo(1, 12)
  })

  it('composes 100 small rotations equivalently to one large rotation', () => {
    const p = lonLatToCartesian({ lonDeg: 10, latDeg: 20 })
    const axis = lonLatToCartesian({ lonDeg: 60, latDeg: 30 })
    const totalAngle = 1.5
    const stepAngle = totalAngle / 100

    let composed = p
    for (let i = 0; i < 100; i++) {
      composed = rotateAxisAngle(composed, axis, stepAngle)
    }
    const single = rotateAxisAngle(p, axis, totalAngle)

    expect(composed.x).toBeCloseTo(single.x, 9)
    expect(composed.y).toBeCloseTo(single.y, 9)
    expect(composed.z).toBeCloseTo(single.z, 9)
  })
})

describe('slerp', () => {
  it('returns a at t=0', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 0, y: 1, z: 0 }
    const r = slerp(a, b, 0)
    expect(r.x).toBeCloseTo(1, 12)
    expect(r.y).toBeCloseTo(0, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('returns b at t=1', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 0, y: 1, z: 0 }
    const r = slerp(a, b, 1)
    expect(r.x).toBeCloseTo(0, 12)
    expect(r.y).toBeCloseTo(1, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('produces the expected midpoint for orthogonal inputs', () => {
    // Midpoint of (1,0,0) and (0,1,0) is (√2/2, √2/2, 0)
    const r = slerp({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5)
    const sqrt2over2 = Math.SQRT2 / 2
    expect(r.x).toBeCloseTo(sqrt2over2, 12)
    expect(r.y).toBeCloseTo(sqrt2over2, 12)
    expect(r.z).toBeCloseTo(0, 12)
  })

  it('handles nearly-identical inputs without dividing by zero', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const b: Cartesian3 = { x: 1, y: 1e-15, z: 0 }
    const r = slerp(a, b, 0.5)
    // Output should be unit-length and very close to a.
    const lenSq = r.x * r.x + r.y * r.y + r.z * r.z
    expect(lenSq).toBeCloseTo(1, 10)
    expect(r.x).toBeCloseTo(1, 12)
  })

  it('handles antipodal inputs deterministically', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const antipode: Cartesian3 = { x: -1, y: 0, z: 0 }
    const r1 = slerp(a, antipode, 0.5)
    const r2 = slerp(a, antipode, 0.5)
    // Same input → same output.
    expect(r1).toEqual(r2)
    // Output should be unit-length.
    const lenSq = r1.x * r1.x + r1.y * r1.y + r1.z * r1.z
    expect(lenSq).toBeCloseTo(1, 12)
    // Output should be perpendicular to a (dot product ≈ 0).
    expect(r1.x * a.x + r1.y * a.y + r1.z * a.z).toBeCloseTo(0, 12)
  })

  it('antipodal slerp at t=0 returns a, t=1 returns antipode-rotated', () => {
    const a: Cartesian3 = { x: 1, y: 0, z: 0 }
    const antipode: Cartesian3 = { x: -1, y: 0, z: 0 }
    const r0 = slerp(a, antipode, 0)
    const r1 = slerp(a, antipode, 1)
    expect(r0.x).toBeCloseTo(1, 12)
    // At t=1, full π rotation about a perpendicular axis brings us to -a.
    expect(r1.x).toBeCloseTo(-1, 10)
  })
})
