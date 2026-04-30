import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// /worlds/[id] — placeholder for Item 7 (world detail page + MapLibre).
//
// For Item 6 (world creation) this just confirms the world was created and
// shows a few facts from the row. The MapLibre map, factbook column,
// scrubber, and event-trigger button arrive in Item 7+.
//
// Test plan #43 (SECURITY): worldId not in user's workspace → 404 (NOT 403).
// RLS does this for us — the SELECT just returns no row, indistinguishable
// from "doesn't exist" → notFound() → Next.js 404.

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function WorldDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=/worlds/${id}`)

  const { data: world, error } = await supabase
    .from('worlds')
    .select(
      'id, name, tile_slug, magic_level, master_seed, created_at, latest_event_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load world ${id}: ${error.message}`)
  }
  if (!world) notFound()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-2xl border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; {world.tile_slug}
        </div>
        <h1 className="font-display mb-2 text-5xl leading-tight">{world.name}</h1>
        <p className="text-muted font-serif mb-10 italic">
          Created on real-world {new Date(world.created_at).toLocaleDateString()}.
          The substrate is here. The map and scrubber arrive in the next slice.
        </p>

        <dl className="font-mono text-muted mb-10 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm tabular-nums">
          <dt className="label-caps" style={{ fontSize: '0.7rem' }}>
            Tile
          </dt>
          <dd className="text-ink">{world.tile_slug}</dd>
          <dt className="label-caps" style={{ fontSize: '0.7rem' }}>
            Magic
          </dt>
          <dd className="text-ink">{world.magic_level}</dd>
          <dt className="label-caps" style={{ fontSize: '0.7rem' }}>
            Seed
          </dt>
          <dd className="text-ink">{world.master_seed}</dd>
        </dl>

        <div className="border-hairline flex items-center justify-between border-t pt-6">
          <Link
            href="/"
            className="label-caps text-muted hover:text-ink transition-colors"
          >
            ← Home
          </Link>
          <Link
            href="/worlds/new"
            className="font-sans text-ink border-ink hover:bg-ink hover:text-bg border px-6 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors"
          >
            Create another
          </Link>
        </div>
      </div>
    </main>
  )
}
