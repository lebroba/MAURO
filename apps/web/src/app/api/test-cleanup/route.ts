import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// POST /api/test-cleanup
//
// Test-only. Wipes all worlds + workspaces owned by a given test email so
// E2E runs start from a clean slate. Same gating as /api/test-signin.
//
// Cascades drop events automatically (events.world_id FK has on delete
// cascade). Storage objects in tiles-rendered/ are NOT cleaned up — they
// are content-addressed and shared across workspaces, so leaving orphans
// is safe and cheaper than tracking what's referenced from where.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  email?: string
}

function isEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  if (!process.env.TEST_AUTH_SECRET) return false
  return true
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const expected = process.env.TEST_AUTH_SECRET
  const provided = request.headers.get('x-test-secret')
  if (!expected || provided !== expected) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const admin = createSupabaseServiceClient()

  // Look up the user. If they don't exist there's nothing to clean.
  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) {
    return NextResponse.json(
      { error: `listUsers failed: ${listErr.message}` },
      { status: 500 },
    )
  }
  const user = usersList.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) {
    return NextResponse.json({ ok: true, deletedWorlds: 0 })
  }

  // Find their workspace.
  const { data: workspace } = await admin
    .from('workspaces')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!workspace) {
    return NextResponse.json({ ok: true, deletedWorlds: 0 })
  }

  // Delete all worlds (events cascade).
  const { data: deleted, error: delErr } = await admin
    .from('worlds')
    .delete()
    .eq('workspace_id', workspace.id)
    .select('id')
  if (delErr) {
    return NextResponse.json(
      { error: `delete worlds failed: ${delErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    deletedWorlds: deleted?.length ?? 0,
  })
}
