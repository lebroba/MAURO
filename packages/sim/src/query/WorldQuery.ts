import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EventRow,
  SubstrateState,
  TileMetadata,
  TileSlug,
  World,
  WorldEvent,
  WorldSnapshot,
} from '../types'
import { applyEvent } from '../events/applyEvent'
import { xoshiro256ss } from '../rng/xoshiro256'
import type { TileLoader } from './tile-loader'

// WorldQuery — the read-side replay engine.
//
// Per the eng-reviewed design, every read of a world's state is a fresh
// replay-from-events. v0 has 2 events per world max so this costs ~50ms of
// arithmetic + ~500ms of network if the source heightmap isn't cached
// locally yet. The TileLoader caches PNG bytes per Vercel function instance,
// so subsequent reads in the same instance hit ~50ms.
//
// Design doc references:
//   - "Replay determinism" (test plan #10)
//   - "As-of correctness" (test plan #11)
//   - "Initial state" (test plan #12)
//   - "Not-found" (test plan #13)
//   - Architecture Principle #2: WorldQuery is the FOUNDATION; all reads go
//     through it. Pipeline stages don't reach sideways into raw event tables.
//   - Architecture Principle #4: same (masterSeed, tileSlug, eventSequence)
//     produces byte-identical heightmap output → byte-identical SHA256.

export class WorldNotFoundError extends Error {
  constructor(public readonly worldId: string) {
    super(`World not found or not accessible: ${worldId}`)
    this.name = 'WorldNotFoundError'
  }
}

export class WorldNotYetCreatedError extends Error {
  constructor(
    public readonly worldId: string,
    public readonly asOfDate: string,
    public readonly createdAt: string,
  ) {
    super(
      `World ${worldId} was not yet created as of ${asOfDate} (created ${createdAt})`,
    )
    this.name = 'WorldNotYetCreatedError'
  }
}

/**
 * Full result of a replay — includes the post-replay substrate state and
 * tile metadata. Returned by `replayAsOf()` for callers that need to
 * render a hillshade or otherwise consume the substrate (e.g. the
 * write-time render path that takes the new state and produces a PNG).
 *
 * `getWorldAsOf()` returns a smaller `WorldSnapshot` for callers that
 * only need the substrate hash + render URL.
 */
export interface WorldReplay {
  worldId: string
  asOfDate: string
  tileSlug: TileSlug
  tileMeta: TileMetadata
  /** Post-replay substrate. Heightmap is mutated; mask is unchanged. */
  state: SubstrateState
  substrateHash: string
  appliedEventCount: number
}

/**
 * SPHERE-SUBSTRATE AUDIT (2026-05-01):
 * - Operates on single-tile rectangular pixel substrate (Uint16Array
 *   heightmap + mask, fixed width × height). MVP-safe assumption.
 * - v1 multi-tile composition will need a new GlobalField abstraction
 *   built on packages/sim/src/sphere/. WorldQuery's public API
 *   (getWorldAsOf, replayAsOf) will gain a multi-tile variant rather
 *   than mutate this one.
 * - No false-flat-Earth math here today — tile coords are treated as
 *   tile-local pixels throughout, and lat/lon only appears in
 *   TileMetadata.sourceRegion which is descriptive metadata only.
 */
export class WorldQuery {
  constructor(
    private readonly db: SupabaseClient,
    private readonly tileLoader: TileLoader,
  ) {}

  /**
   * Fetch + replay a world up to `asOfDate`, returning a snapshot with the
   * substrate hash and a render URL. Pure read operation. Use this when
   * you only need the URL — e.g. on the world detail page.
   *
   * Throws WorldNotFoundError if the world doesn't exist or RLS hides it.
   * Throws WorldNotYetCreatedError if asOfDate is before the world's creation.
   */
  async getWorldAsOf(worldId: string, asOfDate: string): Promise<WorldSnapshot> {
    const replay = await this.replayAsOf(worldId, asOfDate)
    return {
      worldId: replay.worldId,
      asOfDate: replay.asOfDate,
      tileSlug: replay.tileSlug,
      substrateHash: replay.substrateHash,
      renderUrl: `/api/render/${replay.substrateHash}.png`,
      appliedEventCount: replay.appliedEventCount,
    }
  }

  /**
   * SPHERE-SUBSTRATE AUDIT (2026-05-01):
   * - Per-event mutation pattern: each WorldEvent mutates state.heightmap
   *   in tile-pixel space (y * width + x index). MVP-safe — all events at
   *   single-tile scale are tile-local by construction (polygons defined in
   *   tile-local pixel coords; no cross-tile polygon can exist yet).
   * - v1 multi-tile composition will need polygons in (lon, lat) coords and
   *   a per-tile dispatch layer before this loop.
   *
   * Like `getWorldAsOf()` but also exposes the post-replay substrate state +
   * tile metadata. Use this when you need to render or further mutate the
   * state (e.g. the write-time render path in /api/worlds/[id]/events).
   */
  async replayAsOf(worldId: string, asOfDate: string): Promise<WorldReplay> {
    const world = await this.fetchWorld(worldId)
    if (!world) throw new WorldNotFoundError(worldId)

    const events = await this.fetchEvents(worldId, asOfDate)

    // "World not yet created" = no events exist on or before asOfDate.
    // This is the correct check — comparing asOfDate against world.createdAt
    // is wrong because asOfDate is the IN-WORLD fantasy date (e.g.
    // '1247-01-01') and createdAt is the wall-clock timestamp the row was
    // inserted (e.g. '2026-04-30'). They live in different calendars; a
    // lexical comparison always says fantasy-year < real-year.
    if (events.length === 0) {
      throw new WorldNotYetCreatedError(worldId, asOfDate, world.createdAt)
    }

    const { metadata: tileMeta, fresh: state } = await this.tileLoader.load(
      world.tileSlug,
    )

    // Replay. Each event mutates `state.heightmap` in place; mask is unchanged.
    // RNG is derived from the master seed, fresh per replay so the contract is
    // pure (function of inputs only).
    const rng = xoshiro256ss(parseSeed(world.masterSeed))
    let appliedEventCount = 0
    for (const event of events) {
      applyEvent(state, tileMeta, event, rng)
      appliedEventCount++
    }

    const substrateHash = sha256OfHeightmap(state.heightmap)

    return {
      worldId,
      asOfDate,
      tileSlug: world.tileSlug,
      tileMeta,
      state,
      substrateHash,
      appliedEventCount,
    }
  }

  // --------------------------------------------------------------------------
  // Internal: low-level Supabase queries
  // --------------------------------------------------------------------------

  private async fetchWorld(worldId: string): Promise<World | null> {
    const { data, error } = await this.db
      .from('worlds')
      .select(
        'id, workspace_id, name, tile_slug, magic_level, master_seed, created_at, latest_event_at',
      )
      .eq('id', worldId)
      .maybeSingle()

    if (error) {
      throw new Error(`WorldQuery.fetchWorld(${worldId}): ${error.message}`)
    }
    if (!data) return null

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      tileSlug: data.tile_slug as TileSlug,
      magicLevel: data.magic_level,
      masterSeed: data.master_seed,
      createdAt: data.created_at,
      latestEventAt: data.latest_event_at,
    }
  }

  private async fetchEvents(
    worldId: string,
    asOfDate: string,
  ): Promise<WorldEvent[]> {
    const { data, error } = await this.db
      .from('events')
      .select('id, world_id, workspace_id, kind, at_date, payload, created_at')
      .eq('world_id', worldId)
      .lte('at_date', asOfDate)
      .order('id', { ascending: true })

    if (error) {
      throw new Error(`WorldQuery.fetchEvents(${worldId}): ${error.message}`)
    }

    return (data ?? []).map(rowToEvent)
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function rowToEvent(row: {
  kind: string
  at_date: string
  payload: unknown
}): WorldEvent {
  // Trust the database's CHECK constraints + the Postgres function input
  // validators. Cast through the discriminated union; runtime mismatches
  // surface in the reducer's exhaustive check.
  return {
    kind: row.kind,
    atDate: row.at_date,
    payload: row.payload,
  } as WorldEvent
}

function parseSeed(hexSeed: string): bigint {
  // Accepts seeds with or without a 0x prefix. Reject empty / non-hex strings
  // — these would silently become 0n which collides every world to the same
  // RNG sequence.
  const cleaned = hexSeed.startsWith('0x') ? hexSeed.slice(2) : hexSeed
  if (cleaned.length === 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error(`Invalid masterSeed (not a hex string): "${hexSeed}"`)
  }
  return BigInt('0x' + cleaned)
}

function sha256OfHeightmap(heightmap: Uint16Array): string {
  // Hash the raw bytes of the typed array. Endianness is platform-dependent
  // for the BYTE order, but x86 + ARM both produce little-endian on Vercel /
  // GitHub Actions, so the contract holds across the runtimes we ship to.
  // Cross-arch CI (ARM verification) is parked in TODOs / v1.
  const buffer = Buffer.from(
    heightmap.buffer,
    heightmap.byteOffset,
    heightmap.byteLength,
  )
  return createHash('sha256').update(buffer).digest('hex')
}
