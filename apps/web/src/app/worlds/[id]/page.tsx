import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { worldQueryForServiceRole } from '@mauro/sim/server'
import type { GeoJSONPolygon, InterviewState } from '@mauro/sim'
import {
  WorldDetailClient,
  type EventDisplay,
  type SnapshotForScrubber,
  type TileDisplay,
} from './world-detail-client'
import type { NationDisplay } from '@/components/Factbook'

// /worlds/[id] — server-side data fetcher; delegates rendering to the
// client component (which manages scrubber state + map source swaps).
//
// Test plan #43 (SECURITY): worldId not in user's workspace → notFound() →
// 404. RLS does this for us — the user-scoped SELECT just returns no row.

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
  payload:
    | {
        variant?: string
        name?: string
        color?: string
        polygon?: GeoJSONPolygon
        interview?: InterviewState
      }
    | null
}

// Fallback palette for legacy nations created before the color field existed.
// Rotates by event id so adjacent nations don't collide visually. Verdigris
// (#3B6B5A) is excluded — that hex is reserved as the hillshade ocean fill.
const LEGACY_PALETTE = ['#B8442C', '#9C3848', '#3B4D6B', '#C77E2D', '#5B3A4F', '#7C8A66', '#7A5A2F', '#4A4D52'] as const

const TILE_DISPLAY: Record<string, TileDisplay> = {
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
  if (worldErr) throw new Error(`Failed to load world ${id}: ${worldErr.message}`)
  if (!world) notFound()

  const w = world as WorldRow

  const { data: events } = await supabase
    .from('events')
    .select('id, kind, at_date, payload')
    .eq('world_id', id)
    .order('id', { ascending: true })

  const eventList = (events ?? []) as EventRow[]

  // Derive NationDisplay entries from NationCreated events for the Factbook
  // and map overlay. Polygon + color come from the event payload; both are
  // required for the persistent on-map render.
  const nationDisplays: NationDisplay[] = eventList
    .filter((e) => e.kind === 'NationCreated' && !!e.payload?.polygon)
    .map((e, idx) => ({
      eventId: Number(e.id),
      name: e.payload?.name ?? '(unnamed)',
      atDate: e.at_date,
      color: e.payload?.color ?? LEGACY_PALETTE[idx % LEGACY_PALETTE.length] ?? '#B8442C',
      polygon: e.payload!.polygon as GeoJSONPolygon,
      interview: e.payload?.interview as InterviewState,
    }))

  const tile = TILE_DISPLAY[w.tile_slug] ?? {
    name: w.tile_slug,
    body: '',
    coords: '',
  }

  // Compute one snapshot per event boundary. Service-role replay is fine —
  // we already verified ownership of this world via the user-scoped SELECT.
  const snapshots: SnapshotForScrubber[] = []
  if (eventList.length > 0) {
    try {
      const wq = worldQueryForServiceRole()
      for (let i = 0; i < eventList.length; i++) {
        const e = eventList[i]!
        const snap = await wq.getWorldAsOf(id, e.at_date)
        snapshots.push({
          atDate: e.at_date,
          label: `T+${String(i).padStart(4, '0')}`,
          renderUrl: snap.renderUrl,
        })
      }
    } catch (err) {
      // Tile assets probably aren't in Storage yet. Page renders with
      // "render pending" message; user runs prep-tiles + reloads.
      console.error('[worlds/[id]] snapshot computation failed:', err)
    }
  }

  // Reverse-chronological event display for the ledger.
  const eventDisplay: EventDisplay[] = [...eventList]
    .reverse()
    .map((e, idx) => ({
      id: e.id,
      kind: e.kind,
      variant: e.payload?.variant ?? null,
      tIndex: eventList.length - 1 - idx,
    }))

  const topLedgerDate = formatSimDate(eventList[0]?.at_date ?? w.created_at)
  const topLedgerTNow = `T+${String(Math.max(0, eventList.length - 1)).padStart(
    4,
    '0',
  )}`

  const hasMutationEvent = eventList.some((e) => e.kind === 'GeographyMutation')

  return (
    <WorldDetailClient
      world={{
        id: w.id,
        name: w.name,
        tileSlug: w.tile_slug,
        magicLevel: w.magic_level,
        masterSeed: w.master_seed,
      }}
      tile={tile}
      events={eventDisplay}
      snapshots={snapshots}
      topLedgerDate={topLedgerDate}
      topLedgerTNow={topLedgerTNow}
      hasMutationEvent={hasMutationEvent}
      nations={nationDisplays}
    />
  )
}

function formatSimDate(iso: string): string {
  const m = /^(\d{1,4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, year, month, day] = m
  const months = [
    '', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ]
  return `${parseInt(day!, 10)} ${months[parseInt(month!, 10)]} ${year}`
}
