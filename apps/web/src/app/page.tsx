import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

interface WorldRow {
  id: string
  name: string
  tile_slug: string
  created_at: string
  latest_event_at: string
}

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let worlds: WorldRow[] = []
  if (user) {
    const { data } = await supabase
      .from('worlds')
      .select('id, name, tile_slug, created_at, latest_event_at')
      .order('latest_event_at', { ascending: false })
    worlds = (data ?? []) as WorldRow[]
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="label-caps mb-7 flex items-center justify-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; Cartographic Intelligence &middot; v0
        </div>
        <h1 className="display-hero mb-7 text-7xl md:text-8xl">
          Mauro<span className="text-stamp italic">.</span>
        </h1>
        <p className="text-ink font-serif mx-auto mb-10 max-w-xl text-xl leading-relaxed">
          A worldbuilding workspace for tabletop game masters and worldbuilding novelists.
          Real-Earth-derived geography, multi-nation factbooks, time-versioned simulation.{' '}
          <em className="text-muted">Not parchment. Paper.</em>
        </p>
        {user ? <SignedIn email={user.email ?? '(no email)'} worlds={worlds} /> : <SignedOut />}
      </div>
    </main>
  )
}

function SignedOut() {
  return (
    <Link
      href="/auth/sign-in"
      className="bg-ink text-bg border-ink font-sans inline-block border px-8 py-3.5 text-sm font-semibold uppercase tracking-wider transition-opacity hover:opacity-85"
    >
      Sign in
    </Link>
  )
}

function SignedIn({ email, worlds }: { email: string; worlds: WorldRow[] }) {
  return (
    <div className="space-y-6">
      <p className="text-muted font-serif italic">
        Signed in as <span className="text-ink font-mono not-italic">{email}</span>
      </p>

      {worlds.length > 0 ? (
        <ul className="border-hairline mx-auto max-w-md divide-y border">
          {worlds.map((w) => (
            <li key={w.id}>
              <Link
                href={`/worlds/${w.id}`}
                className="hover:bg-surface block px-4 py-3 text-left transition-colors"
              >
                <div className="font-display text-ink text-lg leading-tight">
                  {w.name}
                </div>
                <div className="label-caps mt-1" style={{ fontSize: '0.65rem' }}>
                  {w.tile_slug}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted font-serif text-sm italic">
          No worlds yet. Begin one.
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/worlds/new"
          className="bg-stamp inline-block border px-8 py-3.5 text-sm font-semibold uppercase tracking-wider text-[#F2EDE4] transition-opacity hover:opacity-85"
          style={{ borderColor: 'var(--color-stamp)' }}
        >
          {worlds.length > 0 ? 'Create another world' : 'Begin your first world'}
        </Link>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="border-hairline text-muted hover:text-ink hover:border-ink font-sans border px-6 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
