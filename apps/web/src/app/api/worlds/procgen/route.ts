import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'
import { generateWorld } from '@mauro/sim'

// POST /api/worlds/procgen
//
// Creates a procgen-kind world. Required auth (user-scoped SELECT first to
// confirm the session). Body: { seed?: string, name?: string } — if absent,
// server picks defaults. Server runs generateWorld(seed), inserts the world
// row, and writes two events: WorldCreated (handle) and WorldGenerated
// (continents payload).
//
// The existing tile-world POST goes through the create_world_with_event RPC,
// which assumes tile_slug NOT NULL. The procgen path doesn't fit that RPC, so
// we use the service-role client to bypass RLS for the world INSERT (after
// confirming user identity above) and call the existing add_event RPC for
// each event row (which resolves workspace_id from the world internally).
//
// Returns: { id: string, seed: string }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface ProcgenRequest {
  /** Optional user-supplied seed. Empty/missing → server generates one. */
  seed?: string
  /** Optional name for the world. Default: 'Procgen World'. */
  name?: string
}

export async function POST(request: Request) {
  const userClient = await createSupabaseServerClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: ProcgenRequest = {}
  try {
    body = (await request.json()) as ProcgenRequest
  } catch {
    // Empty body is fine — defaults take over.
  }

  // Pick a seed if user didn't supply one.
  const userSeed = body.seed?.trim()
  const seed = userSeed && userSeed.length > 0 ? userSeed : crypto.randomUUID()

  // Run the procgen.
  const payload = generateWorld(seed)
  const worldName = body.name?.trim() || 'Procgen World'

  // Resolve the user's workspace (auto-created on signup; one-per-user).
  const { data: workspace, error: wsErr } = await userClient
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (wsErr || !workspace) {
    return NextResponse.json(
      { error: `workspace lookup failed: ${wsErr?.message ?? 'no workspace'}` },
      { status: 500 },
    )
  }

  // Insert the world via service-role: the existing user-side RPC assumes
  // tile_slug NOT NULL and doesn't expose procgen_seed. We confirmed user
  // identity + workspace ownership above.
  const service = createSupabaseServiceClient()

  const { data: world, error: worldErr } = await service
    .from('worlds')
    .insert({
      workspace_id: workspace.id,
      name: worldName,
      tile_slug: null,
      procgen_seed: payload.seed,
      magic_level: 'standard',
      master_seed: payload.seed.slice(0, 16),
    })
    .select('id')
    .single()

  if (worldErr || !world) {
    return NextResponse.json(
      { error: `world insert failed: ${worldErr?.message ?? 'no data'}` },
      { status: 500 },
    )
  }

  // WorldCreated + WorldGenerated, both pinned at today's date.
  const today = new Date().toISOString().slice(0, 10)
  const { error: createdErr } = await service.rpc('add_event', {
    p_world_id: world.id,
    p_kind: 'WorldCreated',
    p_at_date: today,
    p_payload: { name: worldName },
  })
  if (createdErr) {
    return NextResponse.json(
      { error: `WorldCreated event failed: ${createdErr.message}` },
      { status: 500 },
    )
  }

  const { error: genErr } = await service.rpc('add_event', {
    p_world_id: world.id,
    p_kind: 'WorldGenerated',
    p_at_date: today,
    p_payload: payload,
  })
  if (genErr) {
    return NextResponse.json(
      { error: `WorldGenerated event failed: ${genErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: world.id, seed: payload.seed }, { status: 201 })
}
