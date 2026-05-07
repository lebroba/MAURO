import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { InterviewClient } from './interview-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NewNationPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=/worlds/${id}/nations/new`)

  const { data: world } = await supabase
    .from('worlds')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!world) notFound()

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-12">
      <div className="label-caps mb-6 text-xs">
        <span className="bg-stamp mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" />
        MAURO &middot; {world.name as string} &middot; New nation
      </div>
      <h1 className="font-display mb-6 text-4xl">Establish nation.</h1>
      <p className="text-muted font-serif mb-10 italic">
        Answer the four modules. Sliders accept the audit&apos;s suggestion or your override.
      </p>
      <InterviewClient worldId={id} />
    </main>
  )
}
