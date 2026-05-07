import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { worldQueryForServiceRole } from '@mauro/sim/server'

// GET /api/worlds/[id]/ocean-overlay
//
// Returns a small PNG with ocean cells tinted slate-blue (~50% alpha) and
// land cells transparent. Stacked above the hillshade in MapView, this gives
// the GM an immediate land/water read without recompiling the hillshade
// renderer. The mask is immutable in v0 (no event mutates it; cf.
// SubstrateState comment), so the PNG is content-addressable per world and
// can be cached aggressively.
//
// Auth follows the audit-polygon pattern: user-scoped SELECT first, then
// service-role for the substrate replay. Replay overhead is the heightmap
// reduce step we don't actually need (mask is immutable) — acceptable for
// the demo. Could be optimized to skip replay and read mask directly via
// TileLoader if perf shows up.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface PageProps {
  params: Promise<{ id: string }>
}

const OCEAN_RGB = { r: 0x4a, g: 0x5d, b: 0x70 } // muted slate-blue, paper-friendly
const OCEAN_ALPHA = 0x80 // ~50%

export async function GET(_request: Request, { params }: PageProps) {
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

  let mask: Uint8Array
  let width: number
  let height: number
  try {
    const wq = worldQueryForServiceRole()
    const today = new Date().toISOString().slice(0, 10)
    const replay = await wq.replayAsOf(worldId, today)
    mask = replay.state.mask
    width = replay.state.width
    height = replay.state.height
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'replay failed' },
      { status: 500 },
    )
  }

  // Build RGBA buffer: ocean tinted, land transparent.
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) {
      const off = i * 4
      rgba[off] = OCEAN_RGB.r
      rgba[off + 1] = OCEAN_RGB.g
      rgba[off + 2] = OCEAN_RGB.b
      rgba[off + 3] = OCEAN_ALPHA
    }
    // Land: alpha left at 0 (default) — fully transparent.
  }

  const png = await sharp(Buffer.from(rgba.buffer), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer()

  return new NextResponse(png as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      // Mask is immutable in v0 → safe to cache hard.
      'cache-control': 'private, max-age=86400, stale-while-revalidate=604800',
    },
  })
}
