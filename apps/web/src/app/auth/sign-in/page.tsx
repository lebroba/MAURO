import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { SignInForm } from './sign-in-form'

// /auth/sign-in
//
// Redirects already-signed-in users to the home page so the URL doesn't
// hang around as a back-button trap.

export default async function SignInPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-md border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO · Closed beta
        </div>
        <h1 className="font-display mb-4 text-4xl">Sign in.</h1>
        <p className="text-muted font-serif mb-7 italic leading-relaxed">
          We&rsquo;ll send you a magic link. New here? You&rsquo;ll need an invitation
          &mdash; beta access is closed during v0.
        </p>
        <SignInForm />
      </div>
    </main>
  )
}
