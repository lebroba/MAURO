# Procedural Continent Worldgen — Design Spec

**Status:** approved during brainstorming session 2026-05-07. Ready for implementation plan.
**Author:** brainstorming session with lebroba
**Spike timeline:** 5 working days

## Goal

Validate the **Continent entity model + procedural placement architecture** by shipping a slice of the actual product: the user clicks **Create World**, picks a master seed, and sees a unique 2D world map of N filled continent polygons on a verdigris ocean. Earth-statistics-bounded randomness produces "Earth-credible but not Earth" worlds — same seed always produces the same world.

This is the precursor to terrain rendering (planned next), archetype tagging (planned after that), and the eventual full planetary substrate.

## Context — why this shape

A previous brainstorming branch proposed validating Wave Function Collapse on patch-based terrain synthesis. That was algorithm validation, not product validation, and was discarded. The reframe (driven by user pushback): a continent is the unit of definition the GM thinks in. Define it as an entity with declared inputs and derived consequences, render it lazily, and we have a substrate-first architecture that scales naturally toward a full 28,800-tile planet.

The spike validates the **declarative-continent model** + **Earth-stats-informed procgen** before any terrain rendering work. If the topology and entity model are wrong, every downstream layer is built on sand.

## Non-goals (explicit)

- **No terrain rendering.** The world is verdigris ocean + flat colored continent polygons. No hillshade, no elevation, no biomes.
- **No archetype tagging.** Continents have a name, color, and polygon — no Linear Barrier / Eroded Relic / etc. Archetypes come in the next iteration.
- **No nation creation flow on procgen worlds.** Nations stay scoped to the existing tile-based worlds for now. Adding them to procgen worlds is a follow-up.
- **No parameter knobs.** User input is a single master seed. Earth-default statistics are baked. Preset selectors and power-user sliders come later.
- **No spherical-render UI changes.** The current MapLibre 2D projection stays. Polar zones remain render-distortion zones per AP §10. The spike does not address spherical visualization beyond the existing `(lon, lat)` substrate.
- **No deletion of the existing tile-based world flow.** Tile-based worlds (Patagonia, Norway, etc.) remain available alongside procgen worlds. The new flow is purely additive.

## Earth statistics — the constraint envelope

The procgen function `generateWorld(seed)` defaults to these values, codified as constants in `packages/sim/src/worldgen/earth-stats.ts`:

| Constant | Value | Source / rationale |
|---|---|---|
| `LAND_COVERAGE_FRACTION` | `0.29` | Earth's actual land:ocean ratio |
| `CONTINENT_COUNT_DISTRIBUTION` | `[(4, 0.15), (5, 0.40), (6, 0.35), (7, 0.10)]` | Weighted toward 5–6 continents (Earth has 5–7 depending on convention) |
| `HEMISPHERIC_BIAS_NORTH` | `0.68` | Earth's actual N:S land split (~68/32) |
| `LATITUDINAL_WEIGHTING` | Discrete PDF over 18 latitude bands (10° each) | Computed once from Natural Earth continent polygons; hard-coded as a 18-element array |
| `SIZE_DISTRIBUTION_ALPHA` | `1.4` (Pareto α) | Calibrated so the largest continent is ~3× the median, matching Earth's Eurasia-vs-others ratio |
| `COASTLINE_COMPLEXITY_RANGE` | `[1.05, 1.5]` | Fractal dimension D, sampled per-continent. 1.05 = smooth (Africa-like), 1.5 = highly fractal (Norway-like) |

These constants are tunable as a unit if defaults turn out wrong, but **not exposed to the user in the spike's UI**. Future preset selectors (Earth-like / Pangaean / Archipelago) become alternative constant tables that override these defaults.

## Architecture

### Entity: `Continent`

New first-class entity, sibling to `Nation`:

```ts
interface Continent {
  id: string                       // uuid v4 from seeded RNG
  name: string                     // generated; placeholder e.g. "Continent Theta"
  color: string                    // hex from a curated heraldic palette
  polygon: GeoJSONPolygon          // ring on the sphere; vertices in (lon, lat)
}
```

Stored on the world's event log via a new event type `WorldGenerated`:

```ts
interface WorldGeneratedPayload {
  seed: string                     // hex string of the master seed (xoshiro state)
  continents: Continent[]          // pinned at creation time — see "Determinism" below
}
```

**Why pin continents in the payload rather than regenerate from seed on every read:**

The procgen function is deterministic, but its implementation may evolve. Storing the output at creation time fixes the world for all future reads, even after code changes. This matches the existing pattern of pinning substrate hashes for tile-based worlds.

### Procgen function

Lives at `packages/sim/src/worldgen/generate-world.ts`. Pure function, no I/O:

```ts
export function generateWorld(seed: string): {
  seed: string
  continents: Continent[]
}
```

**Pipeline (deterministic from seed, all RNG via xoshiro256ss seeded by splitmix64 per AP §2):**

1. **RNG init** — `xoshiro256ssFromState(splitmix64(seed))` per existing convention in `packages/sim/src/rng/`.
2. **Continent count** — sample from `CONTINENT_COUNT_DISTRIBUTION` → `n`.
3. **Seed-point placement** — generate `n` points on the unit sphere via Fibonacci spiral, then perturb each toward the northern hemisphere with `HEMISPHERIC_BIAS_NORTH` weighting, then perturb again by `LATITUDINAL_WEIGHTING`.
4. **Spherical Voronoi tessellation** — partition the sphere into `n` cells around the seed points. Implementation: hand-rolled spherical Delaunay → Voronoi. ~150 lines of pure-numeric TS. (No GPL libraries; clean-room per CLAUDE.md hard rule #1.)
5. **Size budgeting** — for each cell, sample a target area from `Pareto(SIZE_DISTRIBUTION_ALPHA)` such that total cell area sums to `LAND_COVERAGE_FRACTION × 4πR²`. Trim each cell's polygon inward toward its centroid until area matches target.
6. **Coastline fractalization** — for each cell's boundary ring, run a Brownian-bridge midpoint-displacement subdivision pass with per-continent fractal dimension sampled from `COASTLINE_COMPLEXITY_RANGE`. This injects the irregular coastlines (fjords, peninsulas, bays) that distinguish realistic continents from polygons.
7. **Naming & coloring** — for each continent, generate a placeholder name (e.g., "Continent Theta") via a deterministic seeded list-pick, and assign a color from the existing heraldic palette in `NationColorPicker` (8 swatches; verdigris excluded since it's reserved for ocean per recent fix).
8. **Return** the seed + array of `Continent` objects.

### Render path

`apps/web/src/app/worlds/[id]/world-detail-client.tsx` already passes `savedNations` to `MapView` as a GeoJSON FeatureCollection with data-driven fill+line styling. We extend that pattern:

- New prop `continents?: Continent[]` on `MapView`
- New effect mounts a `__continents__` source + fill layer + line layer, identical structure to `__saved_nations__`
- Hillshade source layer is **conditionally absent** on procgen worlds (driven by a new field on the world prop)

**Background:** when no hillshade source is mounted, MapLibre's bottom-most layer (`bg`) is verdigris-tinted. Today the `bg` layer paints `#1a1816` (deep ink). For procgen worlds, override this to `#3B6B5A` (verdigris) so the ocean is visible without a hillshade overlay.

The line ordering bottom-to-top:
1. `bg` — verdigris ocean (procgen worlds) or ink (tile worlds — hidden under hillshade)
2. `hillshade-layer` — present only on tile worlds
3. `__saved_nations_fill__`, `__saved_nations_line__` — existing nations
4. `__continents_fill__`, `__continents_line__` — new continent polygons (only on procgen worlds)
5. Pending-polygon overlays (transient, on top)

### Database schema changes

Minimal migration. Add to existing `worlds` table:

```sql
-- migrations/0005_procgen_worlds.sql
ALTER TABLE worlds
  ADD COLUMN procgen_seed TEXT NULL,
  ADD CONSTRAINT worlds_kind_consistent CHECK (
    (tile_slug IS NULL) <> (procgen_seed IS NULL)
  );
```

Either `tile_slug` or `procgen_seed` is set, never both, never neither. The CHECK constraint enforces this at DB level. Existing worlds (all tile-based) have `procgen_seed = NULL` and are unaffected.

The `WorldGenerated` event is recorded in the existing `events` table — same shape as `WorldCreated`, `NationCreated`, etc.

### API surface

**New endpoint:** `POST /api/worlds/procgen`

Request body:
```ts
{ seed?: string }    // optional; if omitted, server picks one via crypto.randomUUID
```

Response:
```ts
{ id: string, seed: string }
```

The endpoint:
1. Auth-gates via existing user-session SELECT pattern (matches `/api/worlds/[id]/nations`)
2. Calls `generateWorld(seed)` server-side
3. Inserts a row into `worlds` with `procgen_seed` set (and `tile_slug` NULL)
4. Records two events in order: `WorldCreated` (with the world id) and `WorldGenerated` (with the seed + continents payload)
5. Returns `{ id, seed }` so the client can navigate to `/worlds/[id]`

The existing `POST /api/worlds` (for tile-based worlds) is untouched.

### UI/UX

**Home page (`/`):** the existing "New world" button stays. We add a sibling "New procgen world" button (matching style — same Inter Tight label-caps, same hairline border).

**New page `/worlds/new-procgen`:**

Single field: an optional seed input (text field; empty = "use a random seed"). One button: "Generate world." On submit, POST to `/api/worlds/procgen`, navigate to the new world's page.

The form is intentionally minimal for the spike — no preset selectors, no advanced sliders. Future iterations add the B/C-tier UX.

**World detail page (`/worlds/[id]`):**

Behavior splits on the world's kind:
- If `tile_slug` is set: existing behavior (hillshade, factbook, etc.)
- If `procgen_seed` is set: render the continents from the `WorldGenerated` event payload via the new `MapView` continents path. Top ledger shows the seed instead of the tile name. Factbook is empty initially (no nations on procgen worlds in the spike).

Most world-detail chrome (top ledger, scrubber, factbook column) reuses unchanged. Only the map content changes.

## Determinism contract

Per CLAUDE.md hard rule #2:

- All RNG flows through splitmix64 stage-seeding + xoshiro256ss output.
- The seed is stored as a hex-encoded xoshiro state (4 × u64). The user's "seed input" is hashed into this state via splitmix64 to mix entropy.
- The procgen function is **pure**: no I/O, no Date.now, no Math.random. Only the input seed.
- Continents are pinned in the `WorldGenerated` event payload at world-creation time. Re-running `generateWorld(seed)` on a world's stored seed must produce a payload byte-identical to the stored one *as of the procgen function's commit hash*. We accept that future code changes invalidate this guarantee for old worlds; the pinned payload is the source of truth.

**Test:** `packages/sim/src/worldgen/__tests__/determinism.test.ts` runs `generateWorld('cafe-1234')` twice and asserts byte-identical outputs (deep JSON equality).

## Implementation plan — 5 working days

The plan below is the spike's outline. The detailed step-by-step implementation plan with TDD scaffolding will be produced by the writing-plans skill in the next phase.

| Day | Deliverable |
|---|---|
| **1** | `earth-stats.ts` constants. Spherical Voronoi implementation in `packages/sim/src/worldgen/voronoi.ts` with characteristic-stat tests. Confirm cells correctly partition the unit sphere. |
| **2** | Hemispheric bias + size-distribution sampling. Total-area constraint + cell trimming. Output: 5 polygons that cover 29% of a sphere with realistic asymmetry. |
| **3** | Coastline fractalization. Brownian-bridge midpoint subdivision. Tunable per-continent fractal dimension. Output: ragged but closed polygons. |
| **4** | Database migration. `WorldGenerated` event type. New API endpoint. New `/worlds/new-procgen` page. World-detail page branches on `procgen_seed`. `MapView` extended with the continents prop and conditional bg color. |
| **5** | Generate ~10 sample worlds with varied seeds. Eyeball with user. Tune `LATITUDINAL_WEIGHTING` and `SIZE_DISTRIBUTION_ALPHA` until outputs feel right. Write a short results note. |

## Success criteria

The spike succeeds if:

1. **Determinism holds** — same seed produces byte-identical continent payload across two runs (automated test).
2. **Sphere-correctness** — continents do not have impossible geometries (e.g., crossing the date line incorrectly, polygons that exceed the sphere's surface). Verified by sphere-axiom characteristic tests.
3. **Visual credibility** — user inspects 10 sample worlds and at least 7 of them feel like "Earth-credible alternative planets." This is the eye-test gate.
4. **Variety** — the 10 worlds are visibly different. Not subtly different — recognizably distinct continental arrangements.
5. **Performance** — `generateWorld(seed)` runs in under 500ms on the dev machine for a 7-continent world.
6. **Integration cleanliness** — existing tile-based world creation, rendering, and nation flows are untouched and continue to pass their E2E tests.

If any of 1–5 fails, the methodology needs revisiting before scaling to terrain.
If 6 fails, the integration is fighting the existing architecture and needs decomposition.

## Future iterations (out of scope here, listed for context)

- **Naming.** Replace placeholder names with seeded generative names (consonant+vowel patterns, archetype-flavored).
- **Parameter knobs (B-tier UX).** Preset selectors: Earth-like, Pangaean, Archipelago, Polar-clustered.
- **Power-user sliders (C-tier UX).** Direct exposure of `LAND_COVERAGE_FRACTION`, `CONTINENT_COUNT_DISTRIBUTION`, etc.
- **Archetype tagging.** Each continent gets one of the 5 archetypes from `deeper_world.md`. Drives later terrain synthesis.
- **Terrain rendering.** Replace flat-color continent polygons with archetype-derived hillshaded terrain. This is the next major spec.
- **Nation creation on procgen worlds.** Reuse the existing flow — nations are polygons within continent polygons. Requires geometric containment check.
- **Spherical visualization.** Replace MapLibre's 2D projection with a globe view (cesium or three.js). Polar distortion goes away.
- **Hydraulic erosion across inter-continent ocean basins.** Already explored in the stitch-poc; reapply once terrain is in.

## Open questions (deferred)

- **Date-line crossing:** continents that span the antimeridian (lon ≈ ±180) need polygon-splitting in MapLibre. Defer until we hit a real case in the spike's eye-test.
- **Polar continents:** continents fully inside the polar render-distortion zone (>80° lat) may look stretched in the 2D MapLibre projection. AP §10 says we accept this as a render-side issue, not a substrate issue. Defer for now; revisit when globe view lands.
- **Continent vertex count:** after fractalization, polygons could have thousands of vertices. MapLibre handles this fine but storage size grows. Cap vertices at 1024 per continent for the spike; revisit if eye-test wants finer detail.

## References

- `CLAUDE.md` — hard rules #1 (GPL clean-room), #2 (determinism contract), #3 (LLM in narration only), #5 (substrate-first), #7 (sphere is canonical, 2D is render)
- `docs/ARCHITECTURE_PRINCIPLES.md` §10 — sphere-correctness rules
- `docs/deeper_world.md` — long-term vision: archetype-tagged continents
- `packages/sim/src/sphere/coords.ts` — existing sphere primitives this spike builds on
- `packages/sim/src/rng/splitmix64.ts`, `xoshiro256.ts` — RNG primitives per determinism contract
- `apps/web/src/components/MapView.tsx` — render extension target
- `apps/web/src/components/NationColorPicker.tsx` — palette source
- `scripts/stitch-poc/` — sandbox PoC, retained but unused by this spike
