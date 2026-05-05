import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WorldNotFoundError,
  WorldNotYetCreatedError,
  WorldQuery,
} from './WorldQuery'
import { worldQueryForServiceRole, worldQueryForUser } from './factories'
import type { LoadedTile, TileLoader } from './tile-loader'
import type { EventRow, NationCreatedEvent, TileMetadata, TileSlug, World } from '../types'

// ============================================================================
// Test fixtures — synthetic 32×32 substrate, one tile, controllable Supabase.
// ============================================================================

const TILE_W = 32
const TILE_H = 32

function makeTileMeta(): TileMetadata {
  return {
    slug: 'earth-patagonia',
    body: 'earth',
    sourceRegion: { name: 'test', lat: 0, lon: 0, widthDeg: 1, heightDeg: 1 },
    cellSizeMeters: 30,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 45,
      zFactor: 1,
      cellSizeMeters: 30,
    },
    demoPolygon: {
      polygonId: 'demo',
      pixels: [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
      ],
      description: 'test polygon',
    },
    source: {
      dataset: 'SRTM',
      datasetVersion: 'test',
      downloadUrl: 'test',
      fileChecksum: 'test',
      license: 'public-domain',
      attribution: 'test',
    },
  }
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'world-1',
    workspaceId: 'ws-1',
    name: 'The Burnt March',
    tileSlug: 'earth-patagonia',
    magicLevel: 'standard',
    masterSeed: 'deadbeef',
    createdAt: '2026-04-29T12:00:00.000Z',
    latestEventAt: '2026-04-29T12:00:00.000Z',
    ...overrides,
  }
}

function makeEvent(opts: {
  id: bigint
  worldId?: string
  atDate: string
  kind: 'WorldCreated' | 'GeographyMutation' | 'NationCreated'
  payload: unknown
}): EventRow {
  return {
    id: opts.id,
    worldId: opts.worldId ?? 'world-1',
    workspaceId: 'ws-1',
    kind: opts.kind,
    atDate: opts.atDate,
    payload: opts.payload as EventRow['payload'],
    createdAt: '2026-04-29T12:00:00.000Z',
  }
}

// ----------------------------------------------------------------------------
// Mock TileLoader — returns a fresh synthetic substrate per call.
// Heightmap baseline = 1000 across the 32×32 grid.
// ----------------------------------------------------------------------------

class InMemoryTileLoader implements TileLoader {
  private metadata = makeTileMeta()
  loadCount = 0

  async load(_slug: TileSlug): Promise<LoadedTile> {
    this.loadCount++
    const heightmap = new Uint16Array(TILE_W * TILE_H)
    heightmap.fill(1000)
    const mask = new Uint8Array(TILE_W * TILE_H)
    mask.fill(1)
    return {
      metadata: this.metadata,
      fresh: { heightmap, mask, width: TILE_W, height: TILE_H },
    }
  }
}

// ----------------------------------------------------------------------------
// Mock SupabaseClient — supports just the methods WorldQuery uses.
// Uses snake_case in returned rows to match real Supabase behavior.
// ----------------------------------------------------------------------------

interface MockData {
  worlds: Map<string, World>
  events: EventRow[]
}

function makeMockClient(data: MockData): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'worlds') return makeWorldsBuilder(data.worlds)
      if (table === 'events') return makeEventsBuilder(data.events)
      throw new Error(`mock client: unsupported table "${table}"`)
    },
  } as unknown as SupabaseClient
}

function makeWorldsBuilder(worlds: Map<string, World>) {
  let filterId: string | null = null
  return {
    select(_cols: string) {
      return this
    },
    eq(col: string, val: string) {
      if (col === 'id') filterId = val
      return this
    },
    async maybeSingle() {
      const world = filterId ? worlds.get(filterId) : null
      if (!world) return { data: null, error: null }
      return {
        data: {
          id: world.id,
          workspace_id: world.workspaceId,
          name: world.name,
          tile_slug: world.tileSlug,
          magic_level: world.magicLevel,
          master_seed: world.masterSeed,
          created_at: world.createdAt,
          latest_event_at: world.latestEventAt,
        },
        error: null,
      }
    },
  }
}

function makeEventsBuilder(events: EventRow[]) {
  let filterWorldId: string | null = null
  let filterMaxDate: string | null = null
  return {
    select(_cols: string) {
      return this
    },
    eq(col: string, val: string) {
      if (col === 'world_id') filterWorldId = val
      return this
    },
    lte(col: string, val: string) {
      if (col === 'at_date') filterMaxDate = val
      return this
    },
    async order(_col: string, _opts: { ascending: boolean }) {
      const filtered = events
        .filter((e) => e.worldId === filterWorldId)
        .filter((e) => !filterMaxDate || e.atDate <= filterMaxDate)
        .sort((a, b) => Number(a.id - b.id))
      return {
        data: filtered.map((e) => ({
          id: e.id,
          world_id: e.worldId,
          workspace_id: e.workspaceId,
          kind: e.kind,
          at_date: e.atDate,
          payload: e.payload,
          created_at: e.createdAt,
        })),
        error: null,
      }
    },
  }
}

// ============================================================================
// Test plan #10 — Replay determinism (substrate hash is byte-identity stable)
// ============================================================================

describe('WorldQuery — replay determinism (test plan #10)', () => {
  it('100 runs of same world+events produce byte-identical substrate hash', async () => {
    const data: MockData = {
      worlds: new Map([['world-1', makeWorld()]]),
      events: [
        makeEvent({
          id: 1n,
          atDate: '2026-04-29',
          kind: 'WorldCreated',
          payload: {
            name: 'The Burnt March',
            tileSlug: 'earth-patagonia',
            magicLevel: 'standard',
            masterSeed: 'deadbeef',
          },
        }),
        makeEvent({
          id: 2n,
          atDate: '2026-05-15',
          kind: 'GeographyMutation',
          payload: {
            variant: 'volcanic_uplift',
            polygonId: 'demo',
            elevationDelta: 400,
          },
        }),
      ],
    }

    const seenHashes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
      const snap = await wq.getWorldAsOf('world-1', '2026-06-01')
      seenHashes.add(snap.substrateHash)
    }
    expect(seenHashes.size).toBe(1)
  })
})

// ============================================================================
// Test plan #11 — As-of correctness across event boundary
// ============================================================================

describe('WorldQuery — as-of correctness (test plan #11)', () => {
  const data: MockData = {
    worlds: new Map([['world-1', makeWorld()]]),
    events: [
      makeEvent({
        id: 1n,
        atDate: '2026-04-29',
        kind: 'WorldCreated',
        payload: {
          name: 'The Burnt March',
          tileSlug: 'earth-patagonia',
          magicLevel: 'standard',
          masterSeed: 'deadbeef',
        },
      }),
      makeEvent({
        id: 2n,
        atDate: '2026-05-15',
        kind: 'GeographyMutation',
        payload: {
          variant: 'volcanic_uplift',
          polygonId: 'demo',
          elevationDelta: 400,
        },
      }),
    ],
  }

  it('asOfDate before T2 includes only WorldCreated (1 event applied)', async () => {
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    const snap = await wq.getWorldAsOf('world-1', '2026-05-14')
    expect(snap.appliedEventCount).toBe(1)
  })

  it('asOfDate at T2 includes both events (2 events applied)', async () => {
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    const snap = await wq.getWorldAsOf('world-1', '2026-05-15')
    expect(snap.appliedEventCount).toBe(2)
  })

  it('asOfDate after T2 includes both events', async () => {
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    const snap = await wq.getWorldAsOf('world-1', '2026-12-31')
    expect(snap.appliedEventCount).toBe(2)
  })

  it('produces DIFFERENT substrate hash for asOfDate before vs after T2', async () => {
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    const before = await wq.getWorldAsOf('world-1', '2026-05-14')
    const after = await wq.getWorldAsOf('world-1', '2026-05-15')
    expect(before.substrateHash).not.toBe(after.substrateHash)
  })
})

// ============================================================================
// Test plan #12 — Initial state behavior
// ============================================================================

describe('WorldQuery — initial state (test plan #12)', () => {
  it('throws WorldNotYetCreatedError for asOfDate before world creation', async () => {
    const data: MockData = {
      worlds: new Map([
        ['world-1', makeWorld({ createdAt: '2026-04-29T12:00:00.000Z' })],
      ]),
      events: [],
    }
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    await expect(
      wq.getWorldAsOf('world-1', '2026-04-28'),
    ).rejects.toBeInstanceOf(WorldNotYetCreatedError)
  })
})

// ============================================================================
// Test plan #13 — Not-found
// ============================================================================

describe('WorldQuery — not-found (test plan #13)', () => {
  it('throws WorldNotFoundError when worldId does not exist', async () => {
    const data: MockData = { worlds: new Map(), events: [] }
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    await expect(
      wq.getWorldAsOf('nonexistent', '2026-04-29'),
    ).rejects.toBeInstanceOf(WorldNotFoundError)
  })

  it('throws WorldNotFoundError when RLS hides the row (mock returns null)', async () => {
    // RLS blocking is functionally identical to "row doesn't exist" from
    // the client's perspective — Supabase returns data: null with no error.
    const data: MockData = { worlds: new Map(), events: [] }
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    await expect(
      wq.getWorldAsOf('rls-blocked', '2026-04-29'),
    ).rejects.toBeInstanceOf(WorldNotFoundError)
  })
})

// ============================================================================
// WorldSnapshot shape sanity
// ============================================================================

describe('WorldQuery — snapshot shape', () => {
  it('returns a WorldSnapshot with all expected fields populated', async () => {
    const data: MockData = {
      worlds: new Map([['world-1', makeWorld()]]),
      events: [
        makeEvent({
          id: 1n,
          atDate: '2026-04-29',
          kind: 'WorldCreated',
          payload: {
            name: 'The Burnt March',
            tileSlug: 'earth-patagonia',
            magicLevel: 'standard',
            masterSeed: 'deadbeef',
          },
        }),
      ],
    }
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())
    const snap = await wq.getWorldAsOf('world-1', '2026-04-29')

    expect(snap.worldId).toBe('world-1')
    expect(snap.asOfDate).toBe('2026-04-29')
    expect(snap.tileSlug).toBe('earth-patagonia')
    expect(snap.appliedEventCount).toBe(1)
    expect(snap.substrateHash).toMatch(/^[0-9a-f]{64}$/) // SHA256 hex
    expect(snap.renderUrl).toBe(`/api/render/${snap.substrateHash}.png`)
  })
})

// ============================================================================
// Test plan #15 — Factory env-var validation
// ============================================================================

describe('WorldQuery factories — env var guards (test plan #15)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('worldQueryForServiceRole throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    expect(() => worldQueryForServiceRole()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY env var not set/,
    )
  })

  it('worldQueryForServiceRole throws when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    expect(() => worldQueryForServiceRole()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL env var not set/,
    )
  })

  it('worldQueryForUser throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    const req = new Request('https://app.example/test', {
      headers: { cookie: '' },
    })
    expect(() => worldQueryForUser(req)).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })
})

// ============================================================================
// WorldQuery — NationCreated (substrate-hash invariant, test plan #16)
// ============================================================================

describe('WorldQuery — NationCreated', () => {
  it('replayAsOf folds NationCreated events without changing substrate hash', async () => {
    // Arrange: world with one WorldCreated event using in-world fantasy dates.
    // data.events is a live reference; the mock client reads it on every call,
    // so we can push NationCreated between the two replayAsOf invocations
    // without rebuilding the WorldQuery or the mock client.
    const data: MockData = {
      worlds: new Map([['world-1', makeWorld()]]),
      events: [
        makeEvent({
          id: 1n,
          atDate: '1247-01-01',
          kind: 'WorldCreated',
          payload: {
            name: 'The Burnt March',
            tileSlug: 'earth-patagonia',
            magicLevel: 'standard',
            masterSeed: 'deadbeef',
          },
        }),
      ],
    }
    const wq = new WorldQuery(makeMockClient(data), new InMemoryTileLoader())

    const beforeNation = await wq.replayAsOf('world-1', '1247-05-01')
    const hashBefore = beforeNation.substrateHash

    // Act: push a NationCreated event into the live ledger
    const nationEvent: NationCreatedEvent = {
      kind: 'NationCreated',
      atDate: '1247-06-01',
      payload: {
        name: 'Iron Duchy',
        polygon: {
          type: 'Polygon',
          coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]],
        },
        interview: {
          D: 5, C: 6, M: 7, E: 4, I: 3, I2: 5,
          government: 'feudal', religion: 'pantheon', civTier: 'iron',
          species: 'human', currency: 'Gold Pieces',
        },
      },
    }
    data.events.push(
      makeEvent({
        id: 2n,
        atDate: nationEvent.atDate,
        kind: 'NationCreated',
        payload: nationEvent.payload,
      }),
    )

    // Assert: substrate hash is unchanged; appliedEventCount increments by 1
    const afterNation = await wq.replayAsOf('world-1', '1247-07-01')
    expect(afterNation.substrateHash).toBe(hashBefore)
    expect(afterNation.appliedEventCount).toBe(beforeNation.appliedEventCount + 1)
  })
})
