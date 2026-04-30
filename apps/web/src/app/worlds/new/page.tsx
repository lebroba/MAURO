import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { WorldForm } from './world-form'

// /worlds/new — auth-gated world-creation surface.
// Wider card than the auth pages to accommodate the tile picker grid.

export default async function NewWorldPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=/worlds/new')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-xl border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; New world
        </div>
        <h1 className="font-display mb-4 text-4xl">Begin.</h1>
        <p className="text-muted font-serif mb-8 italic leading-relaxed">
          Each world is a piece of real Earth &mdash; or Mars, or the Moon &mdash; that
          you shape into something else. Pick the substrate. The rest follows.
        </p>
        <WorldForm />
      </div>
    </main>
  )
}
