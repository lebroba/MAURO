import Link from 'next/link'

// /auth/error
//
// Landing for failed callback paths. The reason query param is set by
// /auth/callback when something goes wrong (expired link, not in beta, etc).

const REASON_MESSAGES: Record<string, { title: string; body: string }> = {
  'not-in-beta': {
    title: "You're not on the list.",
    body:
      "This email isn't in the beta yet. Closed beta during v0; reach out and " +
      "we'll add you to the list when seats open up.",
  },
  'link-expired': {
    title: 'That link expired.',
    body:
      'Magic links live for one hour and can only be used once. Request a fresh ' +
      'one and try again.',
  },
  'missing-code': {
    title: 'Malformed sign-in link.',
    body:
      'The link is missing the auth code. Try requesting a new one from the sign-in page.',
  },
  'no-email': {
    title: 'No email on the account.',
    body:
      "Your account is missing an email address — that shouldn't happen during a " +
      'magic-link flow. Contact support.',
  },
}

const FALLBACK = {
  title: "Couldn't sign you in.",
  body: 'Something went wrong. Try again.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const params = await searchParams
  const reason = params.reason ?? 'unknown'
  const { title, body } = REASON_MESSAGES[reason] ?? FALLBACK

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface border-hairline w-full max-w-md border p-12">
        <div className="label-caps mb-7 flex items-center gap-3">
          <span className="bg-stamp h-1.5 w-1.5 rounded-full" />
          MAURO · Sign-in error
        </div>
        <h1 className="font-display mb-4 text-4xl leading-tight">{title}</h1>
        <p className="text-muted font-serif mb-7 italic leading-relaxed">{body}</p>
        <Link
          href="/auth/sign-in"
          className="bg-ink text-bg border-ink font-sans inline-block border px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-opacity hover:opacity-85"
        >
          Try again
        </Link>
      </div>
    </main>
  )
}
