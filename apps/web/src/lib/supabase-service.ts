import 'server-only'
import { createClient } from '@supabase/supabase-js'

// MAURO Supabase service-role client.
//
// SERVER ONLY. Bypasses Row-Level Security. Used for:
//   - Reading the beta_allowlist table (no public RLS policy by design)
//   - Future render-on-write paths where we need to write rows on behalf of
//     a user without a session (none in v0; all writes go through user-scoped
//     server clients via RPCs).
//
// The `import 'server-only'` at the top will fail the build if anything in
// the client bundle ever transitively imports this file. That is the
// service-role-key boundary the eng review (round 2) required.

export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
