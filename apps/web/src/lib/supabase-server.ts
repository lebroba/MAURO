import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// MAURO Supabase server client (anon key + per-request cookie session).
// Used by Server Components, Route Handlers, and Server Actions for
// RLS-protected reads scoped to the signed-in user.
//
// In Next.js 15, cookies() returns a Promise — this factory is async.

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components are read-only for cookies in Next.js 15.
            // The middleware refreshes the session on every request, so a
            // throw here is safe to ignore for SC code paths.
          }
        },
      },
    },
  )
}
