'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapView } from '@/components/MapView'
import { Scrubber, type ScrubberStop } from '@/components/Scrubber'

export interface SnapshotForScrubber {
  /** at_date as ISO YYYY-MM-DD; used for label/tooltip. */
  atDate: string
  /** Per-event short label, e.g. "T+0000". */
  label: string
  /** Resolved render URL for this snapshot's substrate hash. */
  renderUrl: string | null
}

export interface EventDisplay {
  id: number
  kind: string
  variant: string | null
  /** Reverse-chronological index (0 = latest). For "T+nnnn" labels. */
  tIndex: number
}

export interface WorldDisplay {
  id: string
  name: string
  tileSlug: string
  magicLevel: string
  masterSeed: string
}

export interface TileDisplay {
  name: string
  body: string
  coords: string
}

interface WorldDetailClientProps {
  world: WorldDisplay
  tile: TileDisplay
  events: EventDisplay[]
  snapshots: SnapshotForScrubber[]
  topLedgerDate: string
  topLedgerTNow: string
  hasMutationEvent: boolean
}

export function WorldDetailClient({
  world,
  tile,
  events,
  snapshots,
  topLedgerDate,
  topLedgerTNow,
  hasMutationEvent,
}: WorldDetailClientProps) {
  const router = useRouter()
  // Default to the latest snapshot. Scrubber pin sits on T+max.
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, snapshots.length - 1),
  )
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stops: ScrubberStop[] = snapshots.map((s, i) => ({
    position: snapshots.length > 1 ? i / (snapshots.length - 1) : 0,
    label: s.label,
  }))

  const currentSnapshot = snapshots[selectedIndex] ?? snapshots[0] ?? null
  const imageUrl = currentSnapshot?.renderUrl ?? null

  async function triggerEvent() {
    if (triggering) return
    setTriggering(true)
    setError(null)
    try {
      const res = await fetch(`/api/worlds/${world.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: 'volcanic_uplift' }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setError(data?.error ?? 'Failed to trigger event.')
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTriggering(false)
    }
  }

  const coordsLabel = `${tile.coords} · MAURO/${world.tileSlug}`

  return (
    <main className="bg-bg flex min-h-screen flex-col">
      {/* 36px top ledger ------------------------------------------------ */}
      <div className="bg-surface border-hairline label-caps flex h-9 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-muted hover:text-ink transition-colors"
          >
            MAURO
          </Link>
          <span className="text-muted">▸</span>
          <span className="text-ink">{world.name}</span>
        </div>
        <div className="font-mono text-muted text-[0.65rem] tabular-nums">
          {topLedgerDate} <span className="text-stamp">· {topLedgerTNow}</span>
        </div>
      </div>

      {/* Three-column dossier ------------------------------------------ */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_280px]">
        {/* LEDGER ----------------------------------------------------- */}
        <aside className="bg-bg border-hairline border-r p-6">
          <div className="label-caps mb-4">Event ledger</div>
          {events.length === 0 ? (
            <p className="text-muted font-serif text-sm italic">
              No events recorded yet.
            </p>
          ) : (
            <ol className="divide-hairline divide-y">
              {events.map((e, idx) => (
                <li key={e.id} className="py-3">
                  <div className="font-mono text-muted mb-1 flex items-center gap-2 text-[0.7rem] uppercase tabular-nums tracking-wider">
                    {idx === 0 ? (
                      <span
                        className="bg-stamp inline-block h-1.5 w-1.5 rounded-full"
                        aria-label="latest"
                      />
                    ) : null}
                    T+{String(e.tIndex).padStart(4, '0')} ·{' '}
                    {humanizeKind(e.kind, e.variant)}
                  </div>
                  <div className="text-ink font-serif text-sm italic leading-snug">
                    {humanizeEvent(e.kind, e.variant)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>

        {/* MAP -------------------------------------------------------- */}
        <main className="border-hairline relative min-h-[400px] border-r border-l">
          {imageUrl ? (
            <MapView
              imageUrl={imageUrl}
              coordsLabel={coordsLabel}
              tileLabel={tile.name}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
              <div className="label-caps">Render pending</div>
              <p className="font-serif text-muted text-center text-sm italic leading-relaxed">
                Tile assets aren&rsquo;t in Storage yet. Run prep-tiles + reload.
              </p>
            </div>
          )}

          {!hasMutationEvent ? (
            <div className="absolute bottom-4 right-4">
              <button
                type="button"
                onClick={triggerEvent}
                disabled={triggering}
                className="bg-stamp font-sans border px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#F2EDE4] shadow-lg transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--color-stamp)' }}
              >
                {triggering ? 'Triggering…' : 'Trigger volcanic uplift'}
              </button>
              {error ? (
                <div
                  className="font-serif mt-2 max-w-xs text-right text-xs italic"
                  style={{ color: 'var(--color-stamp)' }}
                >
                  {error}
                </div>
              ) : null}
            </div>
          ) : null}
        </main>

        {/* FACTBOOK --------------------------------------------------- */}
        <aside className="bg-bg p-6">
          <div className="label-caps mb-4">Factbook</div>
          <div className="font-display mb-1 text-2xl leading-tight">
            {world.name}
          </div>
          <div className="label-caps mb-6 text-[0.65rem]">{tile.body}</div>

          <dl className="font-mono mb-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs tabular-nums">
            <dt className="label-caps text-[0.65rem]">Tile</dt>
            <dd className="text-ink text-right">{world.tileSlug}</dd>
            <dt className="label-caps text-[0.65rem]">Magic</dt>
            <dd className="text-ink text-right">{world.magicLevel}</dd>
            <dt className="label-caps text-[0.65rem]">Seed</dt>
            <dd className="text-ink truncate text-right">
              {world.masterSeed.slice(0, 12)}…
            </dd>
            <dt className="label-caps text-[0.65rem]">Events</dt>
            <dd className="text-ink text-right">{events.length}</dd>
          </dl>

          <div className="border-hairline border-t pt-4">
            <div className="label-caps mb-2 text-[0.65rem]">Field notes</div>
            <p className="text-muted font-serif text-sm italic leading-relaxed">
              Nation creation arrives in feature #2. The substrate is here;
              the factbook follows.
            </p>
          </div>
        </aside>
      </div>

      {/* Scrubber ------------------------------------------------------ */}
      <Scrubber
        stops={stops}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
      />
    </main>
  )
}

function humanizeKind(kind: string, variant: string | null): string {
  if (kind === 'WorldCreated') return 'Genesis'
  if (kind === 'GeographyMutation') return variant ?? 'Geography'
  return kind
}

function humanizeEvent(kind: string, variant: string | null): string {
  if (kind === 'WorldCreated') return 'World created from the source tile.'
  if (kind === 'GeographyMutation') {
    if (variant === 'volcanic_uplift') {
      return 'Volcanic uplift along the demo polygon.'
    }
    return `Geography mutated (${variant ?? 'unknown'}).`
  }
  return kind
}
