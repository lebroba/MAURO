import { describe, expect, it } from 'vitest'
import { createFreehandPolygonState, addPoint, finalizePolygon } from './freehand-polygon'

describe('freehand-polygon state machine', () => {
  it('starts empty', () => {
    const state = createFreehandPolygonState()
    expect(state.points).toEqual([])
    expect(state.closed).toBe(false)
  })

  it('addPoint accumulates points in order', () => {
    let state = createFreehandPolygonState()
    state = addPoint(state, [10, 20])
    state = addPoint(state, [30, 40])
    expect(state.points).toEqual([[10, 20], [30, 40]])
  })

  it('finalizePolygon closes the ring (first point appended at end)', () => {
    let state = createFreehandPolygonState()
    state = addPoint(state, [10, 20])
    state = addPoint(state, [30, 20])
    state = addPoint(state, [30, 40])
    state = addPoint(state, [10, 40])
    state = finalizePolygon(state)
    expect(state.closed).toBe(true)
    expect(state.points[0]).toEqual(state.points[state.points.length - 1])
  })

  it('finalizePolygon rejects polygons with fewer than 3 distinct points', () => {
    let state = createFreehandPolygonState()
    state = addPoint(state, [0, 0])
    state = addPoint(state, [1, 1])
    expect(() => finalizePolygon(state)).toThrow(/at least 3/)
  })
})
