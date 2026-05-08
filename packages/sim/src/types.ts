// MAURO substrate types — single source of truth for the data shapes that
// flow between the database, the WorldQuery API, the reducer, and the UI.
//
// Source of truth: docs/superpowers/specs/2026-04-28-first-feature-pick-design.md
//
// IMPORTANT: changing these types is a determinism-contract break. The pinned
// reference vectors in the RNG and reducer tests assume these shapes. If you
// add a new event variant or tile slug, also update the SQL migrations and
// the test plan.

// ----------------------------------------------------------------------------
// Tile catalog — v0 ships 5 tiles across 3 bodies.
// ----------------------------------------------------------------------------

export type TileSlug =
  | 'earth-patagonia'
  | 'earth-norway'
  | 'earth-pamirs'
  | 'mars-tharsis'
  | 'moon-imbrium'

export type CelestialBody = 'earth' | 'mars' | 'moon'

export type SourceDataset =
  | 'SRTM' // NASA Shuttle Radar Topography Mission (Earth land, ≤60°N)
  | 'COP30' // Copernicus GLO-30 (Earth land, including >60°N where SRTM has no coverage)
  | 'GEBCO' // General Bathymetric Chart of the Oceans (Earth bathymetry)
  | 'ETOPO' // NOAA Earth Topo (Earth combined)
  | 'MOLA' // Mars Orbiter Laser Altimeter
  | 'LOLA' // Lunar Orbiter Laser Altimeter
  | 'SLDEM2015' // LOLA + SELENE TC fusion DEM

// ----------------------------------------------------------------------------
// Magic level — picked at world creation, never mutated.
// ----------------------------------------------------------------------------

export type MagicLevel = 'low' | 'standard' | 'high' | 'wild'

// ----------------------------------------------------------------------------
// Workspace / World / Event row shapes — match supabase migration 0001+0002.
// ----------------------------------------------------------------------------

export interface Workspace {
  id: string // uuid
  ownerUserId: string // auth.users.id
  createdAt: string // ISO8601
}

export interface World {
  id: string
  workspaceId: string
  name: string
  tileSlug: TileSlug
  magicLevel: MagicLevel
  /** Hex string. Determinism contract input. */
  masterSeed: string
  createdAt: string
  /** ISO8601. Used by the scrubber to bound its range. */
  latestEventAt: string
}

// ----------------------------------------------------------------------------
// World events — discriminated union of every event kind.
// Append-only. No UPDATE / DELETE in the database.
// ----------------------------------------------------------------------------

export interface WorldCreatedEvent {
  kind: 'WorldCreated'
  /** In-world calendar date the event happens at. */
  atDate: string
  payload: {
    name: string
    tileSlug: TileSlug
    magicLevel: MagicLevel
    masterSeed: string
  }
}

export interface GeographyMutationEvent {
  kind: 'GeographyMutation'
  atDate: string
  payload: {
    /** v0 ships only volcanic_uplift. Future variants land alongside. */
    variant: 'volcanic_uplift'
    /** References a polygon defined in the world's tile metadata. */
    polygonId: string
    /** Signed delta in 16-bit elevation units. Positive = uplift, negative = subsidence. */
    elevationDelta: number
  }
}

// ----------------------------------------------------------------------------
// NationCreatedEvent — emitted when a GM finalizes the DIME-Plus interview.
// Substrate (heightmap + mask) is unchanged by this event; only the
// nation list grows. See docs/superpowers/specs/2026-05-04-dime-thin-slice-design.md.
// ----------------------------------------------------------------------------

export interface GeoJSONPolygon {
  type: 'Polygon'
  /** GeoJSON convention: outer ring + optional holes. Coordinates are [lon, lat]
   * pairs in WGS84. First and last coordinate of each ring must be identical. */
  coordinates: Array<Array<[number, number]>>
}

/**
 * A procgen continent — an entity that lives on a procgen-kind world.
 * Polygon is a closed ring on the sphere in (lon, lat) order. Interior
 * coordinates are kept simple — a single outer ring, no holes — for v1.
 */
export interface Continent {
  /** uuid v4, generated deterministically from the world seed. */
  id: string
  /** Placeholder generative name, e.g. "Continent Theta". */
  name: string
  /** Hex color used for both fill and (darker variant) stroke. */
  color: string
  /** Closed ring on the sphere; first vertex repeated as last. */
  polygon: GeoJSONPolygon
}

export interface WorldGeneratedPayload {
  /** Hex-encoded master seed (4 × u64) used to produce the continents. */
  seed: string
  /** Continents pinned at world-creation time — see determinism spec §determinism. */
  continents: Continent[]
}

export type GovernmentKey =
  | 'anarchic' | 'feudal' | 'magocracy' | 'theocracy' | 'totalitarian'

export type ReligionKey =
  | 'pantheon' | 'sovereign' | 'cult' | 'secular'

export type CivTierKey =
  | 'bone' | 'iron' | 'stone' | 'aether'

export type SpeciesKey =
  | 'human' | 'elf' | 'dwarf' | 'halfling' | 'dragonborn' | 'gnome'
  | 'half-elf' | 'half-orc' | 'tiefling' | 'aasimar' | 'goliath' | 'orc'

export interface InterviewState {
  /** Each slider 1..10. */
  D: number; C: number; M: number; E: number; I: number; I2: number
  government: GovernmentKey
  religion: ReligionKey
  civTier: CivTierKey
  species: SpeciesKey
  currency: string
}

export interface NationCreatedEvent {
  kind: 'NationCreated'
  atDate: string
  payload: {
    name: string
    polygon: GeoJSONPolygon
    interview: InterviewState
  }
}

export interface WorldGeneratedEvent {
  kind: 'WorldGenerated'
  atDate: string
  payload: WorldGeneratedPayload
}

export type WorldEvent =
  | WorldCreatedEvent
  | GeographyMutationEvent
  | NationCreatedEvent
  | WorldGeneratedEvent
export type WorldEventKind = WorldEvent['kind']

/** Database row as returned by Supabase (matches `events` table schema). */
export interface EventRow {
  id: bigint
  worldId: string
  workspaceId: string
  kind: WorldEventKind
  atDate: string
  payload: WorldEvent['payload']
  createdAt: string
}

// ----------------------------------------------------------------------------
// In-memory substrate state — the bytes the reducer mutates during replay.
// ----------------------------------------------------------------------------

export interface SubstrateState {
  /** 16-bit elevation values, length = width * height. Per AP §6 the mask is
   * the source-of-truth for is-land; elevation only provides relief. */
  heightmap: Uint16Array
  /** 1 = land/surface, 0 = ocean/void. Length = width * height.
   * IMMUTABLE in v0 (no event mutates the mask; coastline-shift events were
   * explicitly cut from v0 because they would force a mask-edit code path). */
  mask: Uint8Array
  width: number
  height: number
}

// ----------------------------------------------------------------------------
// Tile metadata — sibling JSON next to each tile's heightmap+mask in Storage.
// Produced by scripts/prep-tiles.ts; consumed by WorldQuery and the render
// route. Provenance fields are required (NASA / USGS attribution + checksum
// pin per AP §8 byte-affecting-deps policy).
// ----------------------------------------------------------------------------

export interface HillshadeParams {
  /** Sun azimuth in degrees, 0=N, 90=E. Cartographic convention is 315 (NW). */
  azimuthDeg: number
  /** Sun altitude above horizon, 0–90. Default 45. */
  altitudeDeg: number
  /** Vertical exaggeration. 1.0 = true scale; raise for low-relief tiles. */
  zFactor: number
  /** Ground distance per pixel in meters. Drives slope calculation. */
  cellSizeMeters: number
}

export interface DemoPolygon {
  polygonId: string
  /** Closed polygon in tile-local pixel space. Last vertex implicitly connects
   * to first. Use even-odd rule for inside-test. */
  pixels: Array<[number, number]>
  /** UI label, e.g. "Coastal lowland east of Skyhold". */
  description: string
}

export interface TileSourceProvenance {
  dataset: SourceDataset
  datasetVersion: string
  downloadUrl: string
  /** SHA256 of the original downloaded source file. AP §8 byte-affecting-deps. */
  fileChecksum: string
  license: 'public-domain'
  /** Surfaced in UI footer per body. */
  attribution: string
}

export interface TileMetadata {
  slug: TileSlug
  body: CelestialBody
  sourceRegion: {
    name: string
    lat: number
    lon: number
    widthDeg: number
    heightDeg: number
  }
  cellSizeMeters: number
  hillshadeParams: HillshadeParams
  demoPolygon: DemoPolygon
  source: TileSourceProvenance
  /** SHA256 of the source heightmap bytes (the substrate hash for the
   * WorldCreated state, before any GeographyMutation events have been
   * applied). The hillshade PNG is uploaded to
   * tiles-rendered/{sourceSubstrateHash}.png at prep time. The world
   * detail page reads this from tile.json to construct the initial
   * `/api/render/{hash}.png` URL without running the full WorldQuery
   * replay path. */
  sourceSubstrateHash: string
}

// ----------------------------------------------------------------------------
// WorldSnapshot — what WorldQuery.getWorldAsOf returns to the caller.
// ----------------------------------------------------------------------------

export interface WorldSnapshot {
  worldId: string
  /** ISO8601 in-world date the snapshot is computed for. */
  asOfDate: string
  tileSlug: TileSlug
  /** SHA256 of heightmap bytes after replay. Determinism contract output. */
  substrateHash: string
  /** Same-origin URL the renderer serves the hillshade PNG from. */
  renderUrl: string
  /** For debug + UI badging (e.g. "T+0042" = 42nd event). */
  appliedEventCount: number
}
