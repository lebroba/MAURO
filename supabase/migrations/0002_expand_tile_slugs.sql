-- supabase/migrations/0002_expand_tile_slugs.sql
-- Expand v0 tile slugs to include 5 picks: 3 Earth + 1 Mars + 1 Moon.
--
-- Replaces the original 3 slugs (patagonia, norway, centralasia) with 5
-- planet-prefixed slugs. The planet prefix future-proofs additional bodies
-- (Mercury, Venus, more Mars/Moon regions, etc.) without renaming churn.
--
-- 'centralasia' renames to 'earth-pamirs' — same geographic feature, more
-- accurate and consistent with the new naming convention. Safe to rename
-- because no rows reference the old slug yet (no worlds exist at v0 schema
-- time).
--
-- Source of truth: docs/superpowers/specs/2026-04-28-first-feature-pick-design.md

-- Drop the old CHECK constraint (Postgres auto-named it on inline declaration).
alter table public.worlds drop constraint worlds_tile_slug_check;

-- Add the new CHECK constraint with all 5 v0 slugs.
alter table public.worlds add constraint worlds_tile_slug_check
  check (tile_slug in (
    'earth-patagonia',  -- fjord coastline, glacial topography, water-heavy
    'earth-norway',     -- fjord coastline from a different geological history
    'earth-pamirs',     -- pure mountain (Hindu Kush / Pamir massif), no ocean
    'mars-tharsis',     -- Tharsis Montes + Olympus Mons; volcanic shield, no erosion
    'moon-imbrium'      -- Mare Imbrium + Apennines; impact basin + lunar maria
  ));
