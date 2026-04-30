import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { MapView } from '@/components/MapView'
import { Scrubber } from '@/components/Scrubber'

// /worlds/[id] — the world detail page (design doc Scope-In #7).
//
// Three-column dossier per DESIGN.md "World detail page" mockup:
//   left rail (240px)   — event ledger, reverse-chronological
//   center (fluid)      — MapLibre with the rendered hillshade
//   right rail (280px)  — factbook excerpt for the world (placeholder for now;
//                         expanded with the DIME-Plus output in Item 9 / feature #2)
// Bottom: 56px scrubber bar with event tick marks + the current sim-date pin.
//
// Test plan #43 (SECURITY): worldId not in user's workspace → notFound() →
// Next.js 404. RLS does this for us — the SELECT just returns no row,
// indistinguishable from "doesn't exist."

interface PageProps {
  params: Promise<{ id: string }>
}

interface WorldRow {
  id: string
  name: string
  tile_slug: string
  magic_level: string
  master_seed: string
  created_at: string
  latest_event_at: string
}

interface EventRow {
  id: number
  kind: string
  at_date: string
  payload: { variant?: string } | null
  created_at: string
}

const TILE_DISPLAY: Record<string, { name: string; body: string; coords: string }> = {
  'earth-patagonia': {
    name: 'Patagonia · Cordillera Darwin',
    body: 'Earth · SRTM',
    coords: '50.75°S · 73°W',
  },
  'earth-norway': {
    name: 'Norway · Sunnmøre',
    body: 'Earth · Copernicus GLO-30',
    coords: '62.5°N · 6.5°E',
  },
  'earth-pamirs': {
    name: 'Pamir massif',
    body: 'Earth · SRTM',
    coords: '38.5°N · 73.5°E',
  },
  'mars-tharsis': {
    name: 'Tharsis · Olympus Mons',
    body: 'Mars · MOLA',
    coords: '10°N · 120°W',
  },
  'moon-imbrium': {
    name: 'Mare Imbrium',
    body: 'Moon · LOLA + SELENE',
    coords: '35°N · 5°W',
  },
}

export default async function WorldDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=/worlds/${id}`)

  const { data: world, error: worldErr } = await supabase
    .from('worlds')
    .select(
      'id, name, tile_slug, magic_level, master_seed, created_at, latest_event_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (worldErr) {
    throw new Error(`Failed to load world ${id}: ${worldErr.message}`)
  }
  if (!world) notFound()

  const w = world as WorldRow

  const { data: events } = await supabase
    .from('events')
    .select('id, kind, at_date, payload, created_at')
    .eq('world_id', id)
    .order('id', { ascending: true })

  const eventList = (events ?? []) as EventRow[]
  const tile = TILE_DISPLAY[w.tile_slug] ?? {
    name: w.tile_slug,
    body: '',
    coords: '',
  }

  // For Item 7 we serve the source-state hillshade. prep-tiles.ts publishes
  // tile.json to public Storage at tiles/{slug}/tile.json, including the
  // sourceSubstrateHash that points at the matching pre-rendered hillshade
  // at tiles-rendered/{hash}.png. Fetch it server-side and build the URL.
  // Item 8 will replace this with WorldSnapshot.renderUrl from WorldQuery
  // (which handles event-mutated states).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const tileJsonUrl = `${supabaseUrl}/storage/v1/object/public/tiles/${w.tile_slug}/tile.json`
  let imageUrl: string | null = null
  try {
    const tileJsonRes = await fetch(tileJsonUrl, { cache: 'no-store' })
    if (tileJsonRes.ok) {
      const tileMeta = (await tileJsonRes.json()) as { sourceSubstrateHash?: string }
      if (tileMeta.sourceSubstrateHash) {
        imageUrl = `/api/render/${tileMeta.sourceSubstrateHash}.png`
      }
    }
  } catch {
    // tile.json not yet uploaded — page renders without the map; the
    // factbook + ledger still work. Once prep-tiles uploads, the next
    // page load will succeed.
  }

  const t0Label = formatSimDate(eventList[0]?.at_date ?? w.created_at)
  const tNowLabel = `T+${String(eventList.length - 1).padStart(4, '0')}`

  return (
    <main className="bg-bg flex min-h-screen flex-col">
      {/* 36px top ledger — replaces the conventional top nav */}
      <div className="bg-surface border-hairline label-caps flex h-9 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-muted hover:text-ink transition-colors">
            MAURO
          </Link>
          <span className="text-muted">▸</span>
          <span className="text-ink">{w.name}</span>
        </div>
        <div className="font-mono text-muted text-[0.65rem] tabular-nums">
          {t0Label}{' '}
          <span className="text-stamp">· {tNowLabel}</span>
        </div>
      </div>

      {/* Three-column dossier */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_280px]">
        {/* LEDGER --------------------------------------------------------- */}
        <aside className="bg-bg border-hairline border-r p-6">
          <div className="label-caps mb-4">Event ledger</div>
          {eventList.length === 0 ? (
            <p className="text-muted font-serif text-sm italic">
              No events recorded yet.
            </p>
          ) : (
            <ol className="divide-hairline divide-y">
              {[...eventList].reverse().map((e, idx) => {
                const tIdx = eventList.length - 1 - idx
                const isLatest = idx === 0
                return (
                  <li key={e.id} className="py-3">
                    <div className="font-mono text-muted mb-1 flex items-center gap-2 text-[0.7rem] uppercase tabular-nums tracking-wider">
                      {isLatest ? (
                        <span
                          className="bg-stamp inline-block h-1.5 w-1.5 rounded-full"
                          aria-label="latest"
                        />
                      ) : null}
                      T+{String(tIdx).padStart(4, '0')} ·{' '}
                      {humanizeKind(e.kind, e.payload)}
                    </div>
                    <div className="text-ink font-serif text-sm italic leading-snug">
                      {humanizeEvent(e)}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </aside>

        {/* MAP ------------------------------------------------------------ */}
        <main className="border-hairline relative min-h-[400px] border-r border-l">
          {imageUrl ? (
            <MapView
              imageUrl={imageUrl}
              coordsLabel={`${tile.coords} · MAURO/${w.tile_slug}`}
              tileLabel={tile.name}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
              <div className="label-caps">Render pending</div>
              <p className="font-serif text-muted text-center text-sm italic leading-relaxed">
                Tile assets for{' '}
                <span className="font-mono not-italic">{w.tile_slug}</span> aren&rsquo;t
                in Storage yet.
                <br />
                Run{' '}
                <span className="font-mono not-italic">
                  pnpm --filter @mauro/scripts prep-tiles
                </span>{' '}
                to upload, then reload.
              </p>
            </div>
          )}
        </main>

        {/* FACTBOOK ------------------------------------------------------- */}
        <aside className="bg-bg p-6">
          <div className="label-caps mb-4">Factbook</div>
          <div className="font-display mb-1 text-2xl leading-tight">{w.name}</div>
          <div className="label-caps mb-6 text-[0.65rem]">{tile.body}</div>

          <dl className="font-mono mb-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs tabular-nums">
            <dt className="label-caps text-[0.65rem]">Tile</dt>
            <dd className="text-ink text-right">{w.tile_slug}</dd>
            <dt className="label-caps text-[0.65rem]">Magic</dt>
            <dd className="text-ink text-right">{w.magic_level}</dd>
            <dt className="label-caps text-[0.65rem]">Seed</dt>
            <dd className="text-ink text-right truncate">{w.master_seed.slice(0, 12)}…</dd>
            <dt className="label-caps text-[0.65rem]">Events</dt>
            <dd className="text-ink text-right">{eventList.length}</dd>
          </dl>

          <div className="border-hairline border-t pt-4">
            <div className="label-caps mb-2 text-[0.65rem]">Field notes</div>
            <p className="text-muted font-serif text-sm italic leading-relaxed">
              Nation creation arrives in feature #2. The substrate is here; the
              factbook follows.
            </p>
          </div>
        </aside>
      </div>

      {/* SCRUBBER */}
      <Scrubber
        events={[
          { position: 0, label: 'T+0000', variant: 'stamp' },
          ...(eventList.length > 1
            ? eventList
                .slice(1)
                .map((e, i) => ({
                  position: (i + 1) / Math.max(1, eventList.length - 1),
                  label: `T+${String(i + 1).padStart(4, '0')}`,
                  variant: 'stamp' as const,
                }))
            : []),
        ]}
      />
    </main>
  )
}

function formatSimDate(iso: string): string {
  // Parse ISO date safely — works for fantasy years like 1247-01-01 too.
  const m = /^(\d{1,4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, year, month, day] = m
  const months = [
    '',
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ]
  return `${parseInt(day!, 10)} ${months[parseInt(month!, 10)]} ${year}`
}

function humanizeKind(kind: string, payload: { variant?: string } | null): string {
  if (kind === 'WorldCreated') return 'Genesis'
  if (kind === 'GeographyMutation') return payload?.variant ?? 'Geography'
  return kind
}

function humanizeEvent(e: EventRow): string {
  if (e.kind === 'WorldCreated') return 'World created from the source tile.'
  if (e.kind === 'GeographyMutation') {
    const v = e.payload?.variant
    if (v === 'volcanic_uplift') return 'Volcanic uplift along the demo polygon.'
    return `Geography mutated (${v ?? 'unknown'}).`
  }
  return e.kind
}
