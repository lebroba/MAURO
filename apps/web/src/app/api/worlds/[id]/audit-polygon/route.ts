import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { auditPolygon, type GeoJSONPolygon } from '@mauro/sim'
import { worldQueryForServiceRole } from '@mauro/sim/server'

// POST /api/worlds/[id]/audit-polygon
//
// Replaces the stub audit in world-detail-client.tsx. Replays the world
// substrate to the requested as-of date and runs auditPolygon() against it.
//
// The polygon arrives in MapLibre's lon/lat coordinate space (the freehand
// draw layer captures e.lngLat directly). The substrate is a pixel grid
// stretched across the full image extent [-180, 180] × [85.05, -85.05] per
// MapView's `image` source. Conversion is a linear remap; no projection
// because v0 treats the hillshade as the entire fantasy surface.
//
// Auth: user-scoped SELECT against `worlds` first (RLS gate), then
// service-role for the substrate replay (matches the pattern in
// /api/worlds/[id]/events).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface PageProps {
  params: Promise<{ id: string }>
}

interface AuditRequest {
  polygon?: GeoJSONPolygon
  /** ISO YYYY-MM-DD; defaults to today. */
  atDate?: string
}

const IMAGE_LAT_TOP = 85.05
const IMAGE_LAT_BOTTOM = -85.05
const IMAGE_LON_LEFT = -180
const IMAGE_LON_RIGHT = 180

function lngLatToPixelPolygon(
  polygon: GeoJSONPolygon,
  width: number,
  height: number,
): GeoJSONPolygon {
  const lonSpan = IMAGE_LON_RIGHT - IMAGE_LON_LEFT
  const latSpan = IMAGE_LAT_TOP - IMAGE_LAT_BOTTOM
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) =>
      ring.map(([lng, lat]) => {
        const x = ((lng - IMAGE_LON_LEFT) / lonSpan) * width
        const y = ((IMAGE_LAT_TOP - lat) / latSpan) * height
        return [x, y] as [number, number]
      }),
    ),
  }
}

export async function POST(request: Request, { params }: PageProps) {
  const { id: worldId } = await params

  const userClient = await createSupabaseServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: world } = await userClient
    .from('worlds')
    .select('id')
    .eq('id', worldId)
    .maybeSingle()
  if (!world) {
    return NextResponse.json({ error: 'world not found' }, { status: 404 })
  }

  let body: AuditRequest
  try {
    body = (await request.json()) as AuditRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!body.polygon || body.polygon.type !== 'Polygon') {
    return NextResponse.json(
      { error: 'polygon required (GeoJSON Polygon)' },
      { status: 400 },
    )
  }
  if (!body.polygon.coordinates[0] || body.polygon.coordinates[0].length < 3) {
    return NextResponse.json(
      { error: 'polygon needs at least 3 vertices' },
      { status: 400 },
    )
  }

  const atDate = body.atDate ?? new Date().toISOString().slice(0, 10)

  let substrate
  try {
    const wq = worldQueryForServiceRole()
    const replay = await wq.replayAsOf(worldId, atDate)
    substrate = replay.state
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'replay failed' },
      { status: 500 },
    )
  }

  const pixelPolygon = lngLatToPixelPolygon(
    body.polygon,
    substrate.width,
    substrate.height,
  )

  const audit = auditPolygon(
    substrate,
    pixelPolygon,
    substrate.width,
    substrate.height,
  )
  return NextResponse.json(audit, { status: 200 })
}
