-- supabase/migrations/0004_storage_buckets.sql
-- Provision the two Storage buckets v0 needs:
--
--   tiles            — source DEM artifacts (one folder per slug):
--                      tiles/{slug}/heightmap.png  (16-bit grayscale)
--                      tiles/{slug}/mask.png       (8-bit is-land mask)
--                      tiles/{slug}/tile.json      (TileMetadata)
--                      Read by WorldQuery's TileLoader. Public-read so
--                      MapLibre can fetch directly without a session.
--
--   tiles-rendered   — content-addressed hillshade PNGs:
--                      tiles-rendered/{substrateHash}.png
--                      Read by /api/render/[hash].png. Public-read so the
--                      route can be a thin proxy with no auth boundary.
--
-- Both writes happen via the service-role key from scripts/prep-tiles.ts
-- (and from the future render-on-write path in Item 8). Reads are public —
-- no PII is in tile data and the URLs are content-addressed (hash-based)
-- so unguessable for tiles-rendered.

insert into storage.buckets (id, name, public)
  values ('tiles', 'tiles', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('tiles-rendered', 'tiles-rendered', true)
  on conflict (id) do nothing;

-- The default Supabase storage RLS policies block all writes by anon /
-- authenticated. Service-role bypasses RLS, which is what prep-tiles uses.
-- Public-read works because the buckets are marked public above.
