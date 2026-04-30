import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { computeHillshade } from '@mauro/geo'
import {
  WorldNotFoundError,
  worldQueryForServiceRole,
} from '@mauro/sim/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// POST /api/worlds/[id]/events
//
// Trigger an event on a world. Auth-gated: only the world's owner can
// post (RLS confirms via the world lookup). v0 supports the
// 'volcanic_uplift' GeographyMutation only.
//
// Synchronous render-on-write per the eng-review design (round 3 reversal
// from the trigger+webhook plan):
//   1. RPC: add_event inserts the event row inside a DB transaction.
//   2. Service-role replay: WorldQuery.replayAsOf() loads the source tile
//      and folds all events through applyEvent, producing the post-event
//      substrate state.
//   3. Hillshade: computeHillshade renders the new state's RGBA bytes.
//   4. Encode + upload: sharp produces a palette PNG, uploaded to
//      tiles-rendered/{substrateHash}.png with upsert: true.
//   5. Returns the new substrate hash + render URL so the client can swap
//      MapLibre's image source on the next scrubber tick.
//
// Idempotent: substrate hashes are deterministic for a given event sequence.
// upsert: true on Storage means a re-render produces identical bytes at
// the same key.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RENDERED_BUCKET = 'tiles-rendered'
const YEARS_BETWEEN_EVENTS = 50
const DEFAULT_ELEVATION_DELTA = 400
const DEMO_POLYGON_ID = 'demo'

interface PageProps {
  params: Promise<{ id: string }>
}

interface EventRequest {
  variant?: string
  elevationDelta?: number
}

export async function POST(request: Request, { params }: PageProps) {
  const { id: worldId } = await params

  // ---- Auth + world lookup -------------------------------------------
  const userClient = await createSupabaseServerClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: worldRow, error: worldErr } = await userClient
    .from('worlds')
    .select('id, workspace_id')
    .eq('id', worldId)
    .maybeSingle()
  if (worldErr) {
    console.error('[POST events] world lookup error:', worldErr)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
  if (!worldRow) {
    // RLS-hidden or genuinely missing — same response either way.
    return NextResponse.json({ error: 'world not found' }, { status: 404 })
  }

  // ---- Validate request body -----------------------------------------
  const body = (await request
    .json()
    .catch(() => ({}))) as EventRequest
  const variant = body.variant ?? 'volcanic_uplift'
  if (variant !== 'volcanic_uplift') {
    return NextResponse.json(
      { error: `Unsupported variant: ${variant}` },
      { status: 400 },
    )
  }
  const elevationDelta =
    typeof body.elevationDelta === 'number'
      ? body.elevationDelta
      : DEFAULT_ELEVATION_DELTA

  // ---- Compute the next at_date --------------------------------------
  // In-world calendar: latest event's date + 50 years. For a world with
  // only WorldCreated (atDate=1247-01-01), the first GeographyMutation
  // lands at 1297-01-01.
  const { data: latestEvent, error: latestErr } = await userClient
    .from('events')
    .select('at_date')
    .eq('world_id', worldId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) {
    console.error('[POST events] latest event lookup error:', latestErr)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
  const lastDate = latestEvent?.at_date ?? '1247-01-01'
  const nextDate = addYearsToFantasyDate(lastDate, YEARS_BETWEEN_EVENTS)

  // ---- Insert event via RPC ------------------------------------------
  const { error: rpcErr } = await userClient.rpc('add_event', {
    p_world_id: worldId,
    p_kind: 'GeographyMutation',
    p_at_date: nextDate,
    p_payload: {
      variant,
      polygonId: DEMO_POLYGON_ID,
      elevationDelta,
    },
  })
  if (rpcErr) {
    console.error('[POST events] add_event failed:', rpcErr)
    return NextResponse.json({ error: 'failed to insert event' }, { status: 500 })
  }

  // ---- Replay → render → upload (synchronous) ------------------------
  // Service-role WorldQuery so the render path doesn't depend on the
  // user's RLS context. We already verified ownership above.
  let renderError: string | null = null
  let renderUrl: string | null = null
  let substrateHash: string | null = null

  try {
    const wq = worldQueryForServiceRole()
    const replay = await wq.replayAsOf(worldId, nextDate)
    substrateHash = replay.substrateHash
    renderUrl = `/api/render/${substrateHash}.png`

    const rgba = computeHillshade(
      replay.state.heightmap,
      replay.state.mask,
      replay.state.width,
      replay.state.height,
      replay.tileMeta.hillshadeParams,
    )

    const png = await sharp(rgba, {
      raw: {
        width: replay.state.width,
        height: replay.state.height,
        channels: 4,
      },
    })
      .png({ palette: true, quality: 90, effort: 7 })
      .toBuffer()

    const supabaseService = createSupabaseServiceClient()
    const { error: uploadErr } = await supabaseService.storage
      .from(RENDERED_BUCKET)
      .upload(`${substrateHash}.png`, png, {
        contentType: 'image/png',
        upsert: true,
      })
    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`)
    }
  } catch (err) {
    renderError = err instanceof Error ? err.message : String(err)
    console.error('[POST events] render failed:', err)
    if (err instanceof WorldNotFoundError) {
      // Should not happen — we just inserted the event. Bubble up clearly.
      return NextResponse.json(
        { error: 'world disappeared mid-write — concurrent delete?' },
        { status: 500 },
      )
    }
    // Event row is committed; render failed. Read-side fallback (when we
    // build it) will re-render lazily. Surface the error so the client can
    // retry, but the event is durable either way.
  }

  return NextResponse.json(
    {
      ok: true,
      eventDate: nextDate,
      substrateHash,
      renderUrl,
      renderError,
    },
    { status: 201 },
  )
}

/** Add `years` to a fantasy ISO date (YYYY-MM-DD) — month/day unchanged. */
function addYearsToFantasyDate(iso: string, years: number): string {
  const m = /^(-?\d+)-(\d{2})-(\d{2})/.exec(iso)
  if (!m) throw new Error(`Invalid date: ${iso}`)
  const newYear = parseInt(m[1]!, 10) + years
  return `${newYear}-${m[2]}-${m[3]}`
}
