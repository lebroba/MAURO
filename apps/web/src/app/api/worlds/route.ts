import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { MagicLevel, TileSlug } from '@mauro/sim'

// POST /api/worlds
//
// Creates a new world for the signed-in user. Wraps the create_world_with_event
// Postgres RPC so the worlds row + the WorldCreatedEvent insert happen
// atomically inside a single DB transaction (the Supabase JS client doesn't
// expose multi-statement transactions; the RPC is the workaround).
//
// Test plan refs:
//   #41 happy path: valid form → creates world+event in transaction → returns worldId
//   #42 validation: empty name → 400 with field error
//   #25 RPC atomicity: events insert failure rolls back the worlds insert

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-world calendar starting date. Hardcoded for v0 — fantasy four-digit year
// matching the design preview's "15 Arrenmoor 1247" convention. Future feature
// will let the GM pick this at world creation.
const DEFAULT_AT_DATE = '1247-01-01'

const VALID_TILE_SLUGS: ReadonlySet<TileSlug> = new Set([
  'earth-patagonia',
  'earth-norway',
  'earth-pamirs',
  'mars-tharsis',
  'moon-imbrium',
])

const VALID_MAGIC_LEVELS: ReadonlySet<MagicLevel> = new Set([
  'low',
  'standard',
  'high',
  'wild',
])

interface CreateWorldRequest {
  name?: unknown
  tileSlug?: unknown
  magicLevel?: unknown
}

interface CreateWorldRpcResult {
  worldId: string
  event: unknown
}

interface FieldErrors {
  name?: string
  tileSlug?: string
  magicLevel?: string
}

export async function POST(request: Request) {
  // -- Auth ----------------------------------------------------------------
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // -- Input validation ----------------------------------------------------
  let body: CreateWorldRequest
  try {
    body = (await request.json()) as CreateWorldRequest
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const fieldErrors: FieldErrors = {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length === 0) {
    fieldErrors.name = 'World name is required.'
  } else if (name.length > 80) {
    fieldErrors.name = 'World name must be 80 characters or fewer.'
  }

  const tileSlug = body.tileSlug
  if (typeof tileSlug !== 'string' || !VALID_TILE_SLUGS.has(tileSlug as TileSlug)) {
    fieldErrors.tileSlug = 'Pick one of the available tiles.'
  }

  const magicLevel = body.magicLevel
  if (
    typeof magicLevel !== 'string' ||
    !VALID_MAGIC_LEVELS.has(magicLevel as MagicLevel)
  ) {
    fieldErrors.magicLevel = 'Pick a magic level.'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: 'validation', fields: fieldErrors },
      { status: 400 },
    )
  }

  // -- Workspace lookup ----------------------------------------------------
  // The auto-creation trigger (supabase/migrations/0001_initial.sql) inserts
  // exactly one workspace per user on auth.users INSERT. RLS lets the user
  // read their own workspace.
  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (wsErr) {
    console.error('[POST /api/worlds] workspace lookup failed:', wsErr)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
  if (!workspace) {
    // The trigger should have created this on signup. If it didn't, the
    // user can't proceed — surface the broken state explicitly rather than
    // silently failing the FK constraint inside the RPC.
    return NextResponse.json(
      {
        error:
          'no workspace found for user — auth.users trigger may have failed at signup. Contact support.',
      },
      { status: 500 },
    )
  }

  // -- Master seed --------------------------------------------------------
  // 64-bit random hex (16 hex chars). Drives the xoshiro256** RNG via
  // splitmix64 state-init. Different worlds → different reproducible
  // procgen streams.
  const masterSeed = randomBytes(8).toString('hex')

  // -- Atomic world+event insert via RPC ----------------------------------
  const { data, error: rpcErr } = await supabase.rpc('create_world_with_event', {
    p_workspace_id: workspace.id,
    p_name: name,
    p_tile_slug: tileSlug,
    p_magic_level: magicLevel,
    p_master_seed: masterSeed,
    p_at_date: DEFAULT_AT_DATE,
  })

  if (rpcErr) {
    console.error('[POST /api/worlds] create_world_with_event failed:', rpcErr)
    return NextResponse.json({ error: 'failed to create world' }, { status: 500 })
  }

  const result = data as CreateWorldRpcResult | null
  if (!result?.worldId) {
    console.error('[POST /api/worlds] RPC returned unexpected shape:', data)
    return NextResponse.json({ error: 'unexpected RPC response' }, { status: 500 })
  }

  return NextResponse.json({ worldId: result.worldId }, { status: 201 })
}
