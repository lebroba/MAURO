# Sphere Substrate Audit — 2026-05-01

Single-page audit performed as part of the sphere substrate spec
(`docs/superpowers/specs/2026-05-01-sphere-substrate-design.md`).
Confirms existing `packages/sim/` code has no load-bearing flat-Earth
assumptions that will block v1 work, and documents single-tile
assumptions that are correct at MVP scale but will need revisiting at v1.

## Files audited

- `packages/sim/src/query/WorldQuery.ts`
- `packages/sim/src/query/tile-loader.ts`
- `packages/sim/src/events/applyEvent.ts`
- `packages/sim/src/types.ts` (review only — no code changes)

## Files explicitly out of scope

- `apps/web/src/app/poc/stitch/page.tsx` — public sandbox demo, untouched.
- `packages/sim/src/rng/*` — pure number theory, no geometric assumptions.

## Findings — per file

### `WorldQuery.ts`

**MVP-safe assumptions:**
- Operates on single-tile rectangular pixel substrate. Heightmap +
  mask are `Uint16Array` / `Uint8Array` over fixed `width × height`.
  At 1° × 1° tile scale, cosine distortion is negligible.
- Per-event mutation is in tile-pixel space.

**v1 touchpoints:**
- Multi-tile composition needs a new `GlobalField` abstraction built
  on `packages/sim/src/sphere/`. `WorldQuery` will gain a multi-tile
  variant (e.g., `replayGlobalAsOf`) rather than mutate the existing
  single-tile path.

**Flat-Earth bugs found:** None.

### `tile-loader.ts`

**MVP-safe assumptions:**
- Loads opaque tile bytes + metadata. No geometric operations.
- `sourceRegion` (lat, lon, widthDeg, heightDeg) is descriptive
  metadata only.

**v1 touchpoints:**
- Multi-tile composition reads `sourceRegion` through
  `packages/sim/src/sphere/coords.ts:lonLatToTilePixel` /
  `tilePixelToLonLat`.

**Flat-Earth bugs found:** None.

### `applyEvent.ts`

**MVP-safe assumptions:**
- `GeographyMutation` polygons are defined in tile-local pixel space
  (`DemoPolygon.pixels`). At single-tile scale, polygons cannot span
  boundaries.
- `pointInPolygon` is a pure 2D polygon test (even-odd ray casting),
  not a geographic operation. No flat-Earth concern.

**v1 touchpoints:**
- v1 multi-tile composition needs polygons in `(lon, lat)` coords,
  converted to per-tile pixel space at apply-time via
  `packages/sim/src/sphere/coords.ts:lonLatToTilePixel`.

**Flat-Earth bugs found:** None.

### `types.ts`

**Review only — no changes.**

`SubstrateState` is single-tile rectangular by design (correct at MVP).
`TileMetadata.sourceRegion` already exposes (lat, lon, widthDeg,
heightDeg) — the natural bridge to sphere coords. No type changes
needed; v1 will add new types (e.g., `GlobalField`) alongside.

## Summary

No load-bearing flat-Earth bugs found. All four files are MVP-safe.
Three contain single-tile assumptions that v1 multi-tile composition
will revisit; those assumptions are now documented inline as JSDoc
comments and listed above as "v1 touchpoints" so they're not silently
load-bearing later.

The substrate library at `packages/sim/src/sphere/` is the foundation
v1 will use to address each touchpoint. No retrofit work needed at MVP.
