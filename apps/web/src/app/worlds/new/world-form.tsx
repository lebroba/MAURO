'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { MagicLevel, TileSlug } from '@mauro/sim'

interface TileOption {
  slug: TileSlug
  name: string
  body: 'Earth' | 'Mars' | 'Moon'
  blurb: string
  /** True when the slug has been processed locally but not yet uploaded to Storage. */
  available: boolean
}

const TILE_OPTIONS: TileOption[] = [
  {
    slug: 'earth-patagonia',
    name: 'Patagonia',
    body: 'Earth',
    blurb: 'Glacial fjord coast, Cordillera Darwin',
    available: true,
  },
  {
    slug: 'earth-norway',
    name: 'Norway',
    body: 'Earth',
    blurb: 'Sunnmøre fjords, Norwegian Sea',
    available: true,
  },
  {
    slug: 'earth-pamirs',
    name: 'Pamirs',
    body: 'Earth',
    blurb: 'Hindu Kush massif, no ocean',
    available: true,
  },
  {
    slug: 'mars-tharsis',
    name: 'Tharsis',
    body: 'Mars',
    blurb: 'Olympus Mons + Tharsis Montes',
    available: true,
  },
  {
    slug: 'moon-imbrium',
    name: 'Imbrium',
    body: 'Moon',
    blurb: 'Mare Imbrium + Apennines (pending)',
    available: false,
  },
]

const MAGIC_LEVELS: { value: MagicLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
  { value: 'wild', label: 'Wild' },
]

interface FieldErrors {
  name?: string
  tileSlug?: string
  magicLevel?: string
}

export function WorldForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [tileSlug, setTileSlug] = useState<TileSlug>('earth-patagonia')
  const [magicLevel, setMagicLevel] = useState<MagicLevel>('standard')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})
    setServerError(null)

    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setErrors({ name: 'World name is required.' })
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, tileSlug, magicLevel }),
      })

      if (res.status === 201) {
        const { worldId } = (await res.json()) as { worldId: string }
        router.push(`/worlds/${worldId}`)
        return
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string
        fields?: FieldErrors
      } | null

      if (res.status === 400 && data?.fields) {
        setErrors(data.fields)
      } else if (res.status === 401) {
        router.push('/auth/sign-in?next=/worlds/new')
      } else {
        setServerError(data?.error ?? 'Something went wrong creating the world.')
      }
    } catch {
      setServerError('Network error. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      {/* World name --------------------------------------------------- */}
      <div>
        <label htmlFor="name" className="label-caps mb-2 block">
          World name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="off"
          autoFocus
          maxLength={80}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          placeholder="The Burnt March"
          className="bg-bg border-hairline text-ink focus:border-stamp font-serif w-full border px-4 py-3 text-base transition-colors focus:outline-none disabled:opacity-50"
        />
        {errors.name ? (
          <p className="text-stamp font-serif mt-2 text-sm italic">{errors.name}</p>
        ) : null}
      </div>

      {/* Tile picker -------------------------------------------------- */}
      <div>
        <label className="label-caps mb-2 block">Source tile</label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {TILE_OPTIONS.map((opt) => {
            const selected = tileSlug === opt.slug
            const disabled = !opt.available || pending
            return (
              <button
                key={opt.slug}
                type="button"
                disabled={disabled}
                onClick={() => setTileSlug(opt.slug)}
                aria-pressed={selected}
                className={`bg-bg flex flex-col items-start border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? 'border-stamp'
                    : 'border-hairline hover:border-ink'
                }`}
              >
                <span className="font-display text-ink text-base font-semibold leading-tight">
                  {opt.name}
                </span>
                <span className="label-caps mt-1" style={{ fontSize: '0.65rem' }}>
                  {opt.body}
                </span>
                <span className="font-serif text-muted mt-2 text-xs italic leading-snug">
                  {opt.blurb}
                </span>
              </button>
            )
          })}
        </div>
        {errors.tileSlug ? (
          <p className="text-stamp font-serif mt-2 text-sm italic">{errors.tileSlug}</p>
        ) : null}
      </div>

      {/* Magic level segmented control -------------------------------- */}
      <div>
        <label className="label-caps mb-2 block">Magic level</label>
        <div className="grid grid-cols-4 gap-2">
          {MAGIC_LEVELS.map((opt) => {
            const selected = magicLevel === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={pending}
                onClick={() => setMagicLevel(opt.value)}
                aria-pressed={selected}
                className={`font-sans border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                  selected
                    ? 'bg-ink text-bg border-ink'
                    : 'border-hairline text-muted hover:border-ink hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {errors.magicLevel ? (
          <p className="text-stamp font-serif mt-2 text-sm italic">
            {errors.magicLevel}
          </p>
        ) : null}
      </div>

      {/* Submit ------------------------------------------------------- */}
      {serverError ? (
        <p className="text-stamp font-serif text-sm italic">{serverError}</p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="bg-stamp w-full border px-6 py-3 text-sm font-semibold uppercase tracking-wide text-[#F2EDE4] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--color-stamp)' }}
        >
          {pending ? 'Beginning…' : 'Begin the world'}
        </button>
        <p className="text-muted font-serif mt-3 text-center text-xs italic">
          Genesis is permanent. Choose carefully.
        </p>
      </div>
    </form>
  )
}
