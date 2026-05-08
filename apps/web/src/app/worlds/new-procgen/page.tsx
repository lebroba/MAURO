import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ProcgenForm } from './procgen-form'

export default async function NewProcgenWorldPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=/worlds/new-procgen')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-xl border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO &middot; New procgen world
        </div>
        <h1 className="font-display mb-4 text-4xl">Generate.</h1>
        <p className="text-muted font-serif mb-8 italic leading-relaxed">
          A procedural world built from real-Earth statistics. Pick a seed
          to reproduce a specific world, or leave blank for a fresh one.
        </p>
        <ProcgenForm />
      </div>
    </main>
  )
}
