'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  addPoint,
  createFreehandPolygonState,
  finalizePolygon,
  toGeoJSON,
} from './freehand-polygon'

interface MapViewProps {
  /** PNG URL the renderer serves (per WorldQuery.WorldSnapshot.renderUrl). */
  imageUrl: string
  /** Coordinates label shown in the map's lower-left corner. */
  coordsLabel: string
  /** Display label shown top-left ("Norway · cropped to The Burnt March"). */
  tileLabel: string
  /** When true, the map is in polygon-draw mode (cursor crosshair, mouse drag captures polygon). */
  drawingNation?: boolean
  /** Called when the GM finalizes a polygon by mouseup. */
  onPolygonClose?: (geoJSON: {
    type: 'Polygon'
    coordinates: Array<Array<[number, number]>>
  }) => void
  /** Finalized polygon awaiting commit — rendered persistently until cleared. */
  pendingPolygon?: {
    type: 'Polygon'
    coordinates: Array<Array<[number, number]>>
  } | null
}

// MapLibre client component for the world detail page.
// v0 uses an `image` source spanning the full Mercator extent — the rendered
// hillshade is just the world. There's no real geographic projection on a
// fantasy world, so we treat the PNG as the entire surface. Pan + zoom come
// from MapLibre's built-in handlers.

export function MapView({
  imageUrl,
  coordsLabel,
  tileLabel,
  drawingNation,
  onPolygonClose,
  pendingPolygon,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': '#1a1816' },
          },
        ],
        // glyphs intentionally omitted — we don't render any text labels.
        // Setting it to undefined explicitly fails MapLibre's style validator
        // ("string expected, undefined found"); the field must be either a
        // valid URL string or absent.
      },
      center: [0, 0],
      zoom: 1,
      minZoom: 0,
      maxZoom: 6,
      attributionControl: false,
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource('hillshade', {
        type: 'image',
        url: imageUrl,
        coordinates: [
          [-180, 85.05],
          [180, 85.05],
          [180, -85.05],
          [-180, -85.05],
        ],
      })
      map.addLayer({
        id: 'hillshade-layer',
        type: 'raster',
        source: 'hillshade',
        paint: { 'raster-opacity': 1 },
      })
      // Fit the view to the image bounds on first load.
      map.fitBounds(
        [
          [-180, -85.05],
          [180, 85.05],
        ],
        { padding: 0, duration: 0 },
      )
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [imageUrl])

  // Update the image source if the URL changes (Item 8: scrubber-driven swap).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('hillshade') as maplibregl.ImageSource | undefined
    if (source) {
      source.updateImage({ url: imageUrl })
    }
  }, [imageUrl])

  // Freehand polygon-draw mode.
  // Uses MapLibre's raw mouse event API instead of @maplibre/maplibre-gl-draw
  // because the community fork doesn't support drag-to-draw freehand mode.
  // The state machine lives in freehand-polygon.ts for unit-testability.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !drawingNation) return

    const canvas = map.getCanvas()
    const prevCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    map.dragPan.disable()

    let state = createFreehandPolygonState()
    let drawing = false
    const polygonSourceId = '__nation_draw_polygon__'
    const polygonFillLayerId = '__nation_draw_polygon_fill__'
    const polygonLineLayerId = '__nation_draw_polygon_line__'

    // Temporary source + fill/line layers for the in-progress polygon.
    // Rendering as Polygon (rather than LineString) lets MapLibre auto-close
    // the ring visually while the GM is still dragging — gives a real preview
    // of the bounded area, not just the trace.
    if (!map.getSource(polygonSourceId)) {
      map.addSource(polygonSourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[]] },
          properties: {},
        },
      })
      map.addLayer({
        id: polygonFillLayerId,
        type: 'fill',
        source: polygonSourceId,
        paint: {
          'fill-color': '#3B6B5A', // --verdigris
          'fill-opacity': 0.22,
        },
      })
      map.addLayer({
        id: polygonLineLayerId,
        type: 'line',
        source: polygonSourceId,
        paint: {
          'line-color': '#3B6B5A',
          'line-width': 3,
        },
      })
    }

    const updatePolygon = () => {
      const src = map.getSource(polygonSourceId) as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [state.points] },
        properties: {},
      })
    }

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      drawing = true
      state = addPoint(createFreehandPolygonState(), [e.lngLat.lng, e.lngLat.lat])
      updatePolygon()
    }

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!drawing) return
      state = addPoint(state, [e.lngLat.lng, e.lngLat.lat])
      updatePolygon()
    }

    const onMouseUp = () => {
      if (!drawing) return
      drawing = false
      try {
        state = finalizePolygon(state)
        onPolygonClose?.(toGeoJSON(state))
      } catch {
        // Too few points — silently reset
        state = createFreehandPolygonState()
        updatePolygon()
      }
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)

    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      if (map.getLayer(polygonLineLayerId)) map.removeLayer(polygonLineLayerId)
      if (map.getLayer(polygonFillLayerId)) map.removeLayer(polygonFillLayerId)
      if (map.getSource(polygonSourceId)) map.removeSource(polygonSourceId)
      canvas.style.cursor = prevCursor
      map.dragPan.enable()
    }
  }, [drawingNation, onPolygonClose])

  // Persistent render of a finalized-but-uncommitted polygon. Stays painted
  // while the GM reviews the audit panel and decides whether to continue to
  // the interview or cancel. Same fill+stroke as the draw preview.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = '__pending_polygon__'
    const fillLayerId = '__pending_polygon_fill__'
    const lineLayerId = '__pending_polygon_line__'

    const teardown = () => {
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }

    if (!pendingPolygon) {
      teardown()
      return
    }

    const paint = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: pendingPolygon,
            properties: {},
          },
        })
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#3B6B5A',
            'fill-opacity': 0.22,
          },
        })
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#3B6B5A',
            'line-width': 3,
          },
        })
      } else {
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource
        src.setData({
          type: 'Feature',
          geometry: pendingPolygon,
          properties: {},
        })
      }
    }

    if (map.isStyleLoaded()) {
      paint()
    } else {
      map.once('load', paint)
    }

    return teardown
  }, [pendingPolygon])

  return (
    <div className="relative h-full w-full">
      {/* Inline position+inset because MapLibre's bundled CSS sets
          `.maplibregl-map { position: relative }`, which loads after Tailwind
          and overrides `absolute`. With `position: relative`, `inset-0` is a
          no-op and the container collapses to 0×0 — MapLibre then renders
          into a 300px default canvas that the parent clips to nothing.
          Inline styles beat any stylesheet regardless of cascade order. */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Tile label — italic Fraunces, top-left, drop shadow for readability. */}
      <div
        className="font-display pointer-events-none absolute left-4 top-4 text-xl italic"
        style={{
          color: 'rgba(239, 233, 220, 0.85)',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
        }}
      >
        {tileLabel}
      </div>

      {/* Coordinates — mono, lower-left. */}
      <div
        className="font-mono pointer-events-none absolute bottom-3 left-4 text-xs tabular-nums"
        style={{
          color: 'rgba(239, 233, 220, 0.75)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          letterSpacing: '0.08em',
        }}
      >
        {coordsLabel}
      </div>
    </div>
  )
}
