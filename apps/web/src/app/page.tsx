import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
        {user ? <SignedIn email={user.email ?? '(no email)'} /> : <SignedOut />}
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

function SignedIn({ email }: { email: string }) {
  return (
    <div className="space-y-6">
      <p className="text-muted font-serif italic">
        Signed in as{' '}
        <span className="text-ink font-mono not-italic">{email}</span>
      </p>
      <p className="text-muted font-serif text-sm italic">
        World creation arrives in the next slice. Stand by.
      </p>
      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="border-hairline text-muted hover:text-ink hover:border-ink font-sans border px-6 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
