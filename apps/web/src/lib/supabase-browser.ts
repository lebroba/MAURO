import { createBrowserClient } from '@supabase/ssr'

// MAURO Supabase browser client.
// Uses the public anon key. RLS-protected reads scoped to the signed-in user.
// Safe to import from client components.

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
