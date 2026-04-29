import Link from 'next/link'

// /auth/check-email
//
// Shown after the sign-in form successfully POSTs to /auth/request-magic-link.
// Generic copy regardless of allowlist status to avoid the enumeration leak.

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const params = await searchParams
  const email = params.email

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-md border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO · Check your inbox
        </div>
        <h1 className="font-display mb-4 text-4xl">Sent.</h1>
        <p className="text-muted font-serif mb-3 italic leading-relaxed">
          {email ? (
            <>
              If <span className="text-ink font-mono not-italic">{email}</span> is in the
              beta, a sign-in link is on its way.
            </>
          ) : (
            'If your email is in the beta, a sign-in link is on its way.'
          )}
        </p>
        <p className="text-muted font-serif mb-7 text-sm italic leading-relaxed">
          The link expires in an hour. Check spam if you don&rsquo;t see it in a few minutes.
        </p>
        <Link
          href="/auth/sign-in"
          className="label-caps text-muted hover:text-ink transition-colors"
        >
          ← Try a different email
        </Link>
      </div>
    </main>
  )
}
