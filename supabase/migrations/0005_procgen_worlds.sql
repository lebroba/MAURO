-- 0005_procgen_worlds.sql
--
-- Adds procgen_seed column to worlds. A world is now either tile-based
-- (tile_slug set) OR procgen (procgen_seed set). The CHECK constraint
-- enforces exactly-one-of-the-two at DB level.
--
-- Existing worlds are unaffected: tile_slug is still NOT NULL on every
-- pre-migration row, and procgen_seed defaults to NULL.
--
-- Idempotency: this migration is a one-shot ALTER. If re-run, it errors
-- on the column add. Supabase migration runner handles that via the
-- migrations table.

BEGIN;

-- 1. Allow tile_slug to be NULL (procgen worlds don't have one).
ALTER TABLE worlds
  ALTER COLUMN tile_slug DROP NOT NULL;

-- 2. New column for the procgen master seed (hex-encoded xoshiro state).
ALTER TABLE worlds
  ADD COLUMN procgen_seed TEXT NULL;

-- 3. Exactly one of (tile_slug, procgen_seed) must be set on every row.
ALTER TABLE worlds
  ADD CONSTRAINT worlds_kind_consistent CHECK (
    (tile_slug IS NULL) <> (procgen_seed IS NULL)
  );

-- 4. Index for procgen lookups (rare but cheap).
CREATE INDEX IF NOT EXISTS worlds_procgen_seed_idx
  ON worlds (procgen_seed)
  WHERE procgen_seed IS NOT NULL;

COMMIT;
