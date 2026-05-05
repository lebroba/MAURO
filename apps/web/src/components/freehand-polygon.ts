// Pure state machine for freehand polygon drawing on a MapLibre map.
// Hosted in a separate module from MapView.tsx so the state transitions are
// unit-testable without spinning up a MapLibre instance.
//
// Coordinates are GeoJSON [lon, lat] pairs in WGS84 (the conversion from
// screen-pixel mousedown/move/up to lon/lat happens in MapView.tsx via
// map.unproject()). For thin slice, the polygon is captured as freehand
// drag-to-draw — no click-each-vertex mode.

export interface FreehandState {
  points: Array<[number, number]>
  closed: boolean
}

export function createFreehandPolygonState(): FreehandState {
  return { points: [], closed: false }
}

export function addPoint(state: FreehandState, point: [number, number]): FreehandState {
  if (state.closed) return state
  return { points: [...state.points, point], closed: false }
}

/**
 * Finalize the polygon by closing the ring (appending the first point at the
 * end). Throws if there are fewer than 3 distinct points (degenerate polygon).
 */
export function finalizePolygon(state: FreehandState): FreehandState {
  if (state.points.length < 3) {
    throw new Error('Polygon needs at least 3 distinct points')
  }
  const first = state.points[0]!
  const last = state.points[state.points.length - 1]!
  const points =
    first[0] === last[0] && first[1] === last[1]
      ? state.points
      : [...state.points, first]
  return { points, closed: true }
}

export function clearPolygon(): FreehandState {
  return createFreehandPolygonState()
}

/**
 * Convert FreehandState into a GeoJSON Polygon. Caller is responsible for
 * checking state.closed before calling.
 */
export function toGeoJSON(state: FreehandState): {
  type: 'Polygon'
  coordinates: Array<Array<[number, number]>>
} {
  if (!state.closed) throw new Error('Polygon is not closed')
  return { type: 'Polygon', coordinates: [state.points] }
}
