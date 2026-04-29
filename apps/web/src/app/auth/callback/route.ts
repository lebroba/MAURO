import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'

// GET /auth/callback
//
// Supabase redirects here after the user clicks a magic link. The URL has a
// `code` query param which we exchange for a session.
//
// Defense-in-depth: even though /auth/request-magic-link gated at request
// time, we re-check the allowlist here. The allowlist could have changed
// between when the link was sent and when the user clicked it.
//
// Test plan refs:
//   #38 allowlisted callback → exchange + redirect to /
//   #39 non-allowlisted callback → sign out + redirect to error
//   #40 expired/invalid token → redirect to error

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeNextPath(raw: string | null): string {
  // Only allow same-origin paths. Reject "//evil.com/..." open-redirect tries.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNextPath(url.searchParams.get('next'))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/auth/error?reason=missing-code`)
  }

  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(`${siteUrl}/auth/error?reason=link-expired`)
  }

  const email = data.session.user.email?.toLowerCase()
  if (!email) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${siteUrl}/auth/error?reason=no-email`)
  }

  // Defense-in-depth allowlist re-check.
  const service = createSupabaseServiceClient()
  const { data: allowlisted, error: allowlistErr } = await service
    .from('beta_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()

  if (allowlistErr || !allowlisted) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${siteUrl}/auth/error?reason=not-in-beta`)
  }

  return NextResponse.redirect(`${siteUrl}${next}`)
}
