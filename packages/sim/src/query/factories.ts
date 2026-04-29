import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WorldQuery } from './WorldQuery'
import { SupabaseTileLoader, type TileLoader } from './tile-loader'

// Two factory functions force the call site to declare context — user-scoped
// (RLS-respected) vs service-role (RLS-bypassing). Misusing one for the other
// silently leaks data between users or fails to find rows the user owns.
//
// Test plan #15 (Factory env-var validation): worldQueryForServiceRole throws
// at construction if SUPABASE_SERVICE_ROLE_KEY is unset. Catches deploy
// misconfiguration before the first request hits.

// The TileLoader caches PNG bytes per loader instance. Sharing one loader
// across many WorldQuery instances reuses the cache. The tiles bucket is
// effectively public — service-role isn't strictly needed for tile reads,
// but using it consistently means the loader works in any context.
let _tileLoaderSingleton: TileLoader | null = null

function getOrCreateTileLoader(): TileLoader {
  if (_tileLoaderSingleton) return _tileLoaderSingleton

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'TileLoader requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  _tileLoaderSingleton = new SupabaseTileLoader(client)
  return _tileLoaderSingleton
}

/**
 * For app-route reads scoped to the signed-in user. RLS-respected — the
 * caller can only see worlds and events under their own workspace.
 *
 * `req` carries the session cookies. We parse them into Supabase's cookie
 * adapter; we deliberately do NOT write cookies back from inside WorldQuery
 * (read-only context — middleware handles session refresh elsewhere).
 */
export function worldQueryForUser(req: Request): WorldQuery {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'worldQueryForUser requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }

  const cookies = parseCookies(req.headers.get('cookie') ?? '')

  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return Array.from(cookies.entries()).map(([name, value]) => ({
          name,
          value,
        }))
      },
      setAll() {
        // No-op. WorldQuery is read-only; session refresh happens in middleware.
      },
    },
  })

  return new WorldQuery(client, getOrCreateTileLoader())
}

/**
 * For trusted server contexts: render webhooks, admin tasks, scripts. Bypasses
 * RLS — never call from a code path that runs with user input that could
 * influence which rows are read.
 *
 * Throws at construction if SUPABASE_SERVICE_ROLE_KEY is missing — catches
 * deploy misconfiguration at boot rather than at the first request.
 */
export function worldQueryForServiceRole(): WorldQuery {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error(
      'worldQueryForServiceRole: NEXT_PUBLIC_SUPABASE_URL env var not set',
    )
  }
  if (!serviceKey) {
    throw new Error(
      'worldQueryForServiceRole: SUPABASE_SERVICE_ROLE_KEY env var not set',
    )
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return new WorldQuery(client, getOrCreateTileLoader())
}

/**
 * For tests: construct a WorldQuery with arbitrary client + loader.
 *
 * Lets tests inject mock Supabase clients (returning canned rows) and
 * in-memory TileLoaders (returning synthetic substrates). Not exported from
 * the package barrel — tests import this directly.
 */
export function worldQueryForTesting(
  client: SupabaseClient,
  loader: TileLoader,
): WorldQuery {
  return new WorldQuery(client, loader)
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function parseCookies(header: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!header) return out
  for (const part of header.split(/;\s*/)) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq < 0) {
      out.set(part, '')
    } else {
      const name = part.slice(0, eq).trim()
      const value = decodeURIComponent(part.slice(eq + 1).trim())
      out.set(name, value)
    }
  }
  return out
}
