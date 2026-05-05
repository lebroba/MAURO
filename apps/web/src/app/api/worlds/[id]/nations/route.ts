import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'
import type { GeoJSONPolygon, InterviewState } from '@mauro/sim'

// POST /api/worlds/[id]/nations
//
// Records a NationCreated event on the given world. Auth-gated via the
// existing worlds SELECT (RLS). Calls the existing add_event Postgres RPC
// with kind: 'NationCreated'. Does NOT trigger hillshade re-render —
// NationCreated is substrate-unchanged per the regression test in
// packages/sim/src/events/applyEvent.test.ts.
//
// Test plan refs:
//   - POST: unauth → 401
//   - POST: world not in user workspace → 404 (RLS)
//   - POST: invalid payload → 400 with field-level errors
//   - POST: happy path → 201 + new event row in DB

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

interface PageProps {
  params: Promise<{ id: string }>
}

interface NationRequest {
  name?: string
  polygon?: GeoJSONPolygon
  interview?: InterviewState
  atDate?: string
}

const VALID_GOVERNMENTS = new Set(['anarchic', 'feudal', 'magocracy', 'theocracy', 'totalitarian'])
const VALID_RELIGIONS = new Set(['pantheon', 'sovereign', 'cult', 'secular'])
const VALID_CIV_TIERS = new Set(['bone', 'iron', 'stone', 'aether'])
const VALID_SPECIES = new Set([
  'human', 'elf', 'dwarf', 'halfling', 'dragonborn', 'gnome',
  'half-elf', 'half-orc', 'tiefling', 'aasimar', 'goliath', 'orc',
])

export async function POST(request: Request, { params }: PageProps) {
  const { id: worldId } = await params

  const userClient = await createSupabaseServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Auth-gate: this SELECT goes through RLS. If the world isn't in the user's
  // workspace, no row is returned and we 404.
  const { data: world } = await userClient
    .from('worlds')
    .select('id')
    .eq('id', worldId)
    .maybeSingle()
  if (!world) {
    return NextResponse.json({ error: 'world not found' }, { status: 404 })
  }

  let body: NationRequest
  try {
    body = (await request.json()) as NationRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const errors: Record<string, string> = {}
  if (!body.name || body.name.trim().length === 0) errors.name = 'required'
  if (!body.polygon || body.polygon.type !== 'Polygon') errors.polygon = 'required (GeoJSON Polygon)'
  if (!body.interview) errors.interview = 'required'
  else {
    const iv = body.interview
    for (const k of ['D', 'C', 'M', 'E', 'I', 'I2'] as const) {
      const v = iv[k]
      if (typeof v !== 'number' || v < 1 || v > 10) errors[`interview.${k}`] = 'must be 1..10'
    }
    if (!VALID_GOVERNMENTS.has(iv.government)) errors['interview.government'] = 'invalid'
    if (!VALID_RELIGIONS.has(iv.religion)) errors['interview.religion'] = 'invalid'
    if (!VALID_CIV_TIERS.has(iv.civTier)) errors['interview.civTier'] = 'invalid'
    if (!VALID_SPECIES.has(iv.species)) errors['interview.species'] = 'invalid'
    if (typeof iv.currency !== 'string' || iv.currency.trim().length === 0) {
      errors['interview.currency'] = 'required'
    }
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'validation failed', fields: errors }, { status: 400 })
  }

  const atDate = body.atDate ?? new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Insert via service-role RPC (matches existing GeographyMutation route pattern).
  const serviceClient = createSupabaseServiceClient()
  const { data: eventRow, error: rpcErr } = await serviceClient.rpc('add_event', {
    p_world_id: worldId,
    p_kind: 'NationCreated',
    p_at_date: atDate,
    p_payload: {
      name: body.name!.trim(),
      polygon: body.polygon,
      interview: body.interview,
    },
  })
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ event: eventRow }, { status: 201 })
}
