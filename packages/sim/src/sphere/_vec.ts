// Internal vector ops on Cartesian3. Not exported from the package — used
// only by sibling sphere modules. The Cartesian3 frame is documented per
// consumer (unit sphere in coords.ts/geodesy.ts; ECEF in coords.ts).

import type { Cartesian3 } from './coords'

export function dot(a: Cartesian3, b: Cartesian3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function norm(a: Cartesian3): number {
  return Math.sqrt(dot(a, a))
}

export function normalize(a: Cartesian3): Cartesian3 {
  const n = norm(a)
  if (n === 0) {
    throw new Error('normalize: zero vector')
  }
  return { x: a.x / n, y: a.y / n, z: a.z / n }
}

export function scale(a: Cartesian3, s: number): Cartesian3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function add(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Cartesian3, b: Cartesian3): Cartesian3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function lerp(a: Cartesian3, b: Cartesian3, t: number): Cartesian3 {
  return add(scale(a, 1 - t), scale(b, t))
}
