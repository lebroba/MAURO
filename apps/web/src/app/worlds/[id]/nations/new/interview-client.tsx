'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { applyCascadeRules, explainRule, type GeoJSONPolygon, type InterviewState } from '@mauro/sim'
import { ModuleSovereignty } from './module-sovereignty'
import { ModuleWar } from './module-war'
import { ModuleProsperity } from './module-prosperity'
import { ModuleEnvironment } from './module-environment'
import { NationColorPicker } from '@/components/NationColorPicker'

interface InterviewClientProps {
  worldId: string
}

export function InterviewClient({ worldId }: InterviewClientProps) {
  const router = useRouter()
  const [polygon, setPolygon] = useState<GeoJSONPolygon | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('#B8442C')
  const [interview, setInterview] = useState<Partial<InterviewState>>({
    currency: 'Gold Pieces',
  })
  const [flashed, setFlashed] = useState<Set<string>>(new Set())
  const [firedRules, setFiredRules] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flashTimeout = useRef<NodeJS.Timeout | null>(null)

  // Read polygon from sessionStorage on mount; redirect back if missing.
  useEffect(() => {
    const raw = sessionStorage.getItem('mauro:nation-draft:polygon')
    if (!raw) {
      router.replace(`/worlds/${worldId}?error=draw_polygon_first`)
      return
    }
    try {
      setPolygon(JSON.parse(raw))
    } catch {
      router.replace(`/worlds/${worldId}?error=invalid_polygon`)
    }
  }, [worldId, router])

  const onChange = (patch: Partial<InterviewState>) => {
    const next = { ...interview, ...patch }
    setInterview(next)

    // Cascade rules fire only when all required fields are set.
    if (
      next.D !== undefined && next.C !== undefined && next.M !== undefined &&
      next.E !== undefined && next.I !== undefined && next.I2 !== undefined &&
      next.government && next.religion && next.civTier && next.species
    ) {
      const result = applyCascadeRules(next as InterviewState)
      const changedKeys = new Set<string>()
      for (const k of ['D', 'C', 'M', 'E', 'I', 'I2', 'government', 'religion', 'civTier', 'species'] as const) {
        if (result.state[k] !== next[k]) {
          changedKeys.add(k)
        }
      }
      if (changedKeys.size > 0) {
        setInterview(result.state)
        setFlashed(changedKeys)
        if (flashTimeout.current) clearTimeout(flashTimeout.current)
        flashTimeout.current = setTimeout(() => setFlashed(new Set()), 600)
      }
      setFiredRules(result.firedRules)
    }
  }

  // 12 required inputs total: name, polygon, plus the 10 DIME slots below.
  // Track completion granularly so we can show the GM a `n / 12` counter.
  const REQUIRED_SLOTS = ['D', 'C', 'M', 'E', 'I', 'I2', 'government', 'religion', 'civTier', 'species'] as const
  const slotComplete = REQUIRED_SLOTS.filter((k) => {
    const v = interview[k]
    return v !== undefined && v !== ('' as unknown)
  }).length
  const filledCount = (name.trim() ? 1 : 0) + (polygon ? 1 : 0) + slotComplete
  const totalCount = 2 + REQUIRED_SLOTS.length // 12
  const isComplete = filledCount === totalCount

  const onSubmit = async () => {
    if (!isComplete || !polygon) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/worlds/${worldId}/nations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          polygon,
          color,
          interview,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      sessionStorage.removeItem('mauro:nation-draft:polygon')
      router.push(`/worlds/${worldId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setSubmitting(false)
    }
  }

  if (!polygon) {
    return <div className="text-muted font-serif italic">Loading…</div>
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <ModuleSovereignty state={interview} onChange={onChange} flashedFields={flashed} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <ModuleWar state={interview} onChange={onChange} flashedFields={flashed} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <ModuleProsperity state={interview} onChange={onChange} flashedFields={flashed} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <ModuleEnvironment state={interview} onChange={onChange} flashedFields={flashed} />
        </div>
      </div>

      {firedRules.length > 0 && (
        <div className="bg-surface border-hairline mt-6 border p-4">
          <div className="label-caps mb-2 text-xs">Cascading rules fired</div>
          {firedRules.map((id) => (
            <div key={id} className="font-serif text-sm italic">{explainRule(id)}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-stamp mt-6 font-serif italic">{error}</div>
      )}

      <div className="border-hairline mt-8 flex flex-col gap-4 border-t pt-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md space-y-3 md:flex-1">
          <div>
            <label htmlFor="nation-name" className="label-caps mb-2 block text-xs">
              Nation name
            </label>
            <input
              id="nation-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-bg border-hairline w-full border px-3 py-2 font-serif"
              placeholder="e.g., Iron Duchy"
            />
          </div>
          <NationColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex items-center gap-4">
          <div
            className="text-muted font-mono text-xs tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-ink">{filledCount}</span>
            <span className="text-muted"> / {totalCount} fields complete</span>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('mauro:nation-draft:polygon')
              router.push(`/worlds/${worldId}`)
            }}
            className="border-hairline text-text px-4 py-2 text-sm"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!isComplete || submitting}
            className="bg-stamp px-4 py-2 text-sm text-[#F2EDE4] disabled:opacity-50"
            type="button"
          >
            {submitting ? 'Submitting…' : 'Establish nation'}
          </button>
        </div>
      </div>
    </div>
  )
}
