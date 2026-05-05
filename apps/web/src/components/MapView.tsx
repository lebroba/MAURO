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
    const polylineSourceId = '__nation_draw_polyline__'

    // Add a temporary source + line layer for the in-progress polyline.
    if (!map.getSource(polylineSourceId)) {
      map.addSource(polylineSourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      })
      map.addLayer({
        id: polylineSourceId,
        type: 'line',
        source: polylineSourceId,
        paint: {
          'line-color': '#3B6B5A', // --verdigris: live-state accent per DESIGN.md
          'line-width': 1.5,
        },
      })
    }

    const updatePolyline = () => {
      const src = map.getSource(polylineSourceId) as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: state.points },
        properties: {},
      })
    }

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      drawing = true
      state = addPoint(createFreehandPolygonState(), [e.lngLat.lng, e.lngLat.lat])
      updatePolyline()
    }

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!drawing) return
      state = addPoint(state, [e.lngLat.lng, e.lngLat.lat])
      updatePolyline()
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
        updatePolyline()
      }
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)

    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      if (map.getLayer(polylineSourceId)) map.removeLayer(polylineSourceId)
      if (map.getSource(polylineSourceId)) map.removeSource(polylineSourceId)
      canvas.style.cursor = prevCursor
      map.dragPan.enable()
    }
  }, [drawingNation, onPolygonClose])

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
