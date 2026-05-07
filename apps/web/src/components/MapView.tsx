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
  /** Persisted nations to render as territory overlays. Each gets its own color. */
  savedNations?: ReadonlyArray<{
    id: number
    color: string
    polygon: { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  }>
  /** Color used for the in-progress draw + the pending polygon overlay. */
  drawColor?: string
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
  savedNations,
  drawColor = '#B8442C',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // Mirror imageUrl into a ref so the once-only load callback always reads
  // the current value, not the initial closure capture.
  const imageUrlRef = useRef(imageUrl)
  imageUrlRef.current = imageUrl

  // Map init — runs ONCE on mount. Previously this had [imageUrl] deps,
  // which caused the entire map to be destroyed + recreated whenever the
  // scrubber moved or a new snapshot was generated. That orphaned the
  // load-event listeners owned by the pending-polygon and saved-nations
  // effects (their deps didn't change, so they never re-registered onto
  // the new map). Result: drawing a polygon and then triggering volcanic
  // uplift wiped the polygon off the map. Now: map is built once, image
  // swaps flow through source.updateImage() in the second effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        url: imageUrlRef.current,
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
  }, [])

  // Update the image source if the URL changes (scrubber-driven swap).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const source = map.getSource('hillshade') as maplibregl.ImageSource | undefined
      if (source) source.updateImage({ url: imageUrl })
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
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
          'fill-color': drawColor,
          'fill-opacity': 0.22,
        },
      })
      map.addLayer({
        id: polygonLineLayerId,
        type: 'line',
        source: polygonSourceId,
        paint: {
          'line-color': drawColor,
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
      // Read mapRef.current at teardown time — the closured `map` may point
      // at a destroyed instance if the map-init effect re-ran (e.g., imageUrl
      // changed). MapLibre throws on getLayer() after remove().
      const m = mapRef.current
      try {
        map.off('mousedown', onMouseDown)
        map.off('mousemove', onMouseMove)
        map.off('mouseup', onMouseUp)
      } catch {
        // listener removal on destroyed map is a no-op concern
      }
      if (m && (m as unknown as { style?: unknown }).style) {
        try {
          if (m.getLayer(polygonLineLayerId)) m.removeLayer(polygonLineLayerId)
          if (m.getLayer(polygonFillLayerId)) m.removeLayer(polygonFillLayerId)
          if (m.getSource(polygonSourceId)) m.removeSource(polygonSourceId)
          canvas.style.cursor = prevCursor
          m.dragPan.enable()
        } catch {
          // Map was removed mid-cleanup — safe to ignore.
        }
      }
    }
  }, [drawingNation, onPolygonClose, drawColor])

  // Persistent render of a finalized-but-uncommitted polygon. Stays painted
  // while the GM reviews the audit panel and decides whether to continue to
  // the interview or cancel. Same fill+stroke as the draw preview.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = '__pending_polygon__'
    const fillLayerId = '__pending_polygon_fill__'
    const lineLayerId = '__pending_polygon_line__'

    // Re-read mapRef at teardown time so we never call into a destroyed map.
    // MapLibre's getLayer reads this.style which is nulled by remove().
    const teardown = () => {
      const m = mapRef.current
      if (!m || !(m as unknown as { style?: unknown }).style) return
      try {
        if (m.getLayer(lineLayerId)) m.removeLayer(lineLayerId)
        if (m.getLayer(fillLayerId)) m.removeLayer(fillLayerId)
        if (m.getSource(sourceId)) m.removeSource(sourceId)
      } catch {
        // Map was removed mid-cleanup — safe to ignore.
      }
    }

    if (!pendingPolygon) {
      teardown()
      return
    }

    let cancelled = false
    const paint = () => {
      if (cancelled) return
      const m = mapRef.current
      if (!m || !(m as unknown as { style?: unknown }).style) return
      try {
        if (!m.getSource(sourceId)) {
          m.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: pendingPolygon,
              properties: {},
            },
          })
          m.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': drawColor,
              'fill-opacity': 0.22,
            },
          })
          m.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': drawColor,
              'line-width': 3,
            },
          })
        } else {
          const src = m.getSource(sourceId) as maplibregl.GeoJSONSource
          src.setData({
            type: 'Feature',
            geometry: pendingPolygon,
            properties: {},
          })
        }
      } catch {
        // Map likely destroyed between style-load and paint. Safe to skip.
      }
    }

    if (map.isStyleLoaded()) {
      paint()
    } else {
      map.once('load', paint)
    }

    return () => {
      cancelled = true
      teardown()
    }
  }, [pendingPolygon, drawColor])

  // Persistent render of saved nations. One source with N features; fill +
  // line layers use data-driven `'get', 'color'` so each nation paints in
  // its own hex. Re-runs whenever the saved-nations array changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = '__saved_nations__'
    const fillLayerId = '__saved_nations_fill__'
    const lineLayerId = '__saved_nations_line__'
    const nations = savedNations ?? []

    const teardown = () => {
      const m = mapRef.current
      if (!m || !(m as unknown as { style?: unknown }).style) return
      try {
        if (m.getLayer(lineLayerId)) m.removeLayer(lineLayerId)
        if (m.getLayer(fillLayerId)) m.removeLayer(fillLayerId)
        if (m.getSource(sourceId)) m.removeSource(sourceId)
      } catch {
        // map removed mid-cleanup — safe to ignore
      }
    }

    if (nations.length === 0) {
      teardown()
      return
    }

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: nations.map((n) => ({
        type: 'Feature' as const,
        geometry: n.polygon,
        properties: { id: n.id, color: n.color },
      })),
    }

    let cancelled = false
    const paint = () => {
      if (cancelled) return
      const m = mapRef.current
      if (!m || !(m as unknown as { style?: unknown }).style) return
      try {
        const existing = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
        if (existing) {
          existing.setData(featureCollection)
          return
        }
        m.addSource(sourceId, { type: 'geojson', data: featureCollection })
        m.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.22,
          },
        })
        m.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
          },
        })
      } catch {
        // ignore — map likely destroyed
      }
    }

    if (map.isStyleLoaded()) {
      paint()
    } else {
      map.once('load', paint)
    }

    return () => {
      cancelled = true
      teardown()
    }
  }, [savedNations])

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
