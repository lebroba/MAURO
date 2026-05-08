'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function ProcgenForm() {
  const router = useRouter()
  const [seed, setSeed] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/worlds/procgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: seed.trim() || undefined,
          name: name.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Failed to generate world.')
        return
      }
      const data = (await res.json()) as { id: string; seed: string }
      router.push(`/worlds/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="proc-name" className="label-caps mb-2 block">
          World name
        </label>
        <input
          id="proc-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Procgen World"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base focus:outline-none"
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor="proc-seed" className="label-caps mb-2 block">
          Seed (optional)
        </label>
        <input
          id="proc-seed"
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="leave blank for random"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base focus:outline-none"
          disabled={pending}
        />
      </div>
      {error ? (
        <p className="text-stamp font-serif text-sm italic">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-ink text-bg border-ink font-sans w-full border px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Generating…' : 'Generate world'}
      </button>
    </form>
  )
}
