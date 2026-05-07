import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// POST /auth/request-magic-link
//
// Beta gate at REQUEST TIME: check the email against beta_allowlist BEFORE
// calling signInWithOtp(). Non-allowlisted emails never receive a magic link.
//
// The response body is identical for allowlisted and non-allowlisted addresses
// — no email enumeration leak. The only differential side-effect is whether
// Supabase actually sends an email.
//
// Test plan refs:
//   #35 allowlisted email → signInWithOtp called → 200 generic
//   #36 non-allowlisted email → signInWithOtp NOT called → 200 generic (no leak)
//   #37 malformed email → 400 with field error

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const GENERIC_OK_BODY = {
  ok: true,
  message: 'If your email is in the beta, a sign-in link is on its way. Check your inbox.',
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const rawEmail = (body as { email?: unknown })?.email
  if (typeof rawEmail !== 'string' || !EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const email = rawEmail.trim().toLowerCase()

  // ------------------------------------------------------------------
  // Local-dev shortcut: skip the email send + Vercel redirect entirely.
  // When NODE_ENV is not 'production' (i.e. `next dev`) we run the same
  // in-process flow as /api/test-signin: idempotently create the user,
  // upsert the beta allowlist, generate a magic-link token via admin,
  // verify it through the SSR client (which writes the session cookie
  // onto the outgoing response). The form sees `signedIn: true` and
  // routes to `/` directly.
  //
  // This branch is unreachable on Vercel because Next sets NODE_ENV to
  // 'production' for `next build && next start` and on hosted deploys.
  if (process.env.NODE_ENV !== 'production') {
    const admin = createSupabaseServiceClient()
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (createErr && !/already.*registered|exists/i.test(createErr.message)) {
      return NextResponse.json(
        { error: `dev sign-in failed (createUser): ${createErr.message}` },
        { status: 500 },
      )
    }
    const { error: allowlistErr } = await admin
      .from('beta_allowlist')
      .upsert({ email }, { onConflict: 'email' })
    if (allowlistErr) {
      return NextResponse.json(
        { error: `dev sign-in failed (allowlist): ${allowlistErr.message}` },
        { status: 500 },
      )
    }
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        { error: `dev sign-in failed (generateLink): ${linkErr?.message ?? 'no token'}` },
        { status: 500 },
      )
    }
    const supabase = await createSupabaseServerClient()
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    })
    if (verifyErr) {
      return NextResponse.json(
        { error: `dev sign-in failed (verifyOtp): ${verifyErr.message}` },
        { status: 500 },
      )
    }
    return NextResponse.json({ ok: true, signedIn: true, email })
  }
  // ------------------------------------------------------------------

  const service = createSupabaseServiceClient()
  const { data: allowlisted, error: allowlistErr } = await service
    .from('beta_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (allowlistErr) {
    console.error('[request-magic-link] allowlist check failed:', allowlistErr)
    // Return generic to avoid leaking the failure mode.
    return NextResponse.json(GENERIC_OK_BODY)
  }

  if (!allowlisted) {
    // Not in beta. Do NOT call signInWithOtp. Same response shape as success.
    return NextResponse.json(GENERIC_OK_BODY)
  }

  // Allowlisted — trigger the magic link.
  //
  // CRITICAL: must use the SSR server client (not bare @supabase/supabase-js).
  // The SSR client defaults to PKCE flow, which stores a code verifier in
  // cookies that the /auth/callback route reads back to complete the exchange.
  // The bare client defaults to IMPLICIT flow, which sends tokens in the URL
  // hash fragment — server routes can't read hash fragments, so the callback
  // fails silently and the user lands on the Site URL with floating tokens.
  const supabase = await createSupabaseServerClient()

  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      shouldCreateUser: true,
    },
  })

  if (otpErr) {
    console.error('[request-magic-link] signInWithOtp failed:', otpErr)
    // Still return generic — Supabase rate-limit failures or transient errors
    // shouldn't expose themselves to the caller via differential responses.
  }

  return NextResponse.json(GENERIC_OK_BODY)
}
