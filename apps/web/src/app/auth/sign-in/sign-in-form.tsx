'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = email.trim()
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("That doesn't look like a valid email address.")
      return
    }

    setPending(true)
    try {
      const res = await fetch('/auth/request-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; signedIn?: boolean }
          | null
        // Local-dev shortcut: server signed us in in-process, skip the
        // check-email step and go straight to the home page.
        if (data?.signedIn) {
          router.push('/')
          router.refresh()
          return
        }
        const params = new URLSearchParams({ email: trimmed })
        router.push(`/auth/check-email?${params.toString()}`)
        return
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'Something went wrong. Try again.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label-caps mb-2 block">
          Email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          placeholder="you@somewhere.email"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base transition-colors focus:outline-none disabled:opacity-50"
        />
        {error ? (
          <p className="text-stamp font-serif mt-2 text-sm italic">{error}</p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="bg-ink text-bg border-ink font-sans w-full border px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send the link'}
      </button>
    </form>
  )
}
