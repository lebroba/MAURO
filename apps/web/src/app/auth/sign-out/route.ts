import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// POST /auth/sign-out
//
// Form-target route. Clears the session cookie and redirects to home.
// Uses 303 to force the browser to GET the redirect target.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!
  return NextResponse.redirect(`${siteUrl}/`, { status: 303 })
}
