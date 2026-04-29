import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

  // Allowlisted — trigger the magic link via a no-cookie anon client.
  // signInWithOtp is stateless from the caller's perspective; cookies aren't
  // relevant until the user clicks the link and hits /auth/callback.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const { error: otpErr } = await anon.auth.signInWithOtp({
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
