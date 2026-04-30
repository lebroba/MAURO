import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// POST /api/test-signin
//
// Test-only endpoint. Idempotently creates a user, adds them to the beta
// allowlist, and writes a Supabase session cookie on the response — so
// Playwright can hold a signed-in browser context without round-tripping
// the magic-link email flow.
//
// Defense in depth:
//   1. 404s if TEST_AUTH_SECRET env var is unset (so prod can never serve it
//      even if the route file ships).
//   2. 404s if VERCEL_ENV === 'production' (belt + braces — the secret is the
//      gate, but this is the suspenders).
//   3. Requires a matching `x-test-secret` request header — without it, 404
//      (same shape as the unset-env case so leaks don't reveal the gate).
//
// Cookie-writing path: admin.generateLink → verifyOtp on the SSR client.
// verifyOtp's cookie adapter writes Supabase's session cookies to the
// response; Playwright's storageState picks them up.

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

  // Idempotently create the user. createUser returns a 422-equivalent error
  // if the user exists; we ignore that case.
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createErr && !/already.*registered|exists/i.test(createErr.message)) {
    return NextResponse.json(
      { error: `createUser failed: ${createErr.message}` },
      { status: 500 },
    )
  }

  // Idempotently add to beta allowlist. Required because /auth/callback
  // re-checks the allowlist after exchanging the OTP for a session.
  const { error: allowlistErr } = await admin
    .from('beta_allowlist')
    .upsert({ email }, { onConflict: 'email' })
  if (allowlistErr) {
    return NextResponse.json(
      { error: `allowlist upsert failed: ${allowlistErr.message}` },
      { status: 500 },
    )
  }

  // Generate a magic-link token via admin. We don't follow the action_link
  // — we just extract the hashed_token and verify it against the SSR client,
  // which writes the session cookies onto the outgoing response.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink(
    { type: 'magiclink', email },
  )
  if (linkErr || !linkData) {
    return NextResponse.json(
      { error: `generateLink failed: ${linkErr?.message ?? 'no data'}` },
      { status: 500 },
    )
  }

  const tokenHash = linkData.properties?.hashed_token
  if (!tokenHash) {
    return NextResponse.json(
      { error: 'generateLink returned no hashed_token' },
      { status: 500 },
    )
  }

  const supabase = await createSupabaseServerClient()
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (verifyErr) {
    return NextResponse.json(
      { error: `verifyOtp failed: ${verifyErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, email })
}
