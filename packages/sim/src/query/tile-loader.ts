import 'server-only'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SubstrateState, TileMetadata, TileSlug } from '../types'

// TileLoader — abstraction over "give me the source heightmap, mask, and
// metadata for a given tile slug." Production impl reads from Supabase
// Storage; tests provide a synthetic in-memory loader.
//
// The loader returns a FRESH SubstrateState on each call so the reducer's
// in-place mutation doesn't pollute the cache. The cached PNG bytes are
// shared (immutable across requests); only the SubstrateState wrapper is
// per-request.

export interface LoadedTile {
  metadata: TileMetadata
  /** Fresh, mutable substrate. Caller may pass to applyEvent without copying. */
  fresh: SubstrateState
}

/**
 * SPHERE-SUBSTRATE AUDIT (2026-05-01):
 * - Loads tiles as opaque PNG bytes + JSON metadata. No geometric ops.
 * - sourceRegion (lat, lon, widthDeg, heightDeg) is the natural bridge
 *   to lat/lon — currently only descriptive; v1 multi-tile composition
 *   will read it through packages/sim/src/sphere/coords.ts:
 *   lonLatToTilePixel/tilePixelToLonLat.
 * - No false-flat assumptions found.
 */
export interface TileLoader {
  load(slug: TileSlug): Promise<LoadedTile>
}

// ----------------------------------------------------------------------------
// SupabaseTileLoader — production implementation.
//
// Reads three artifacts per tile from Supabase Storage:
//   tiles/{slug}/tile.json       — TileMetadata
//   tiles/{slug}/heightmap.png   — 16-bit grayscale PNG
//   tiles/{slug}/mask.png        — 8-bit binary PNG (1 = land, 0 = ocean/void)
//
// Caches decoded bytes per slug forever (tile assets are immutable in v0;
// regenerating tiles in v0.1 will use a new content-addressed Storage path
// so this cache will never serve stale data). ~6 MB / tile × 5 tiles = ~30 MB
// cap, well under any Vercel function memory ceiling.
// ----------------------------------------------------------------------------

interface CachedTile {
  metadata: TileMetadata
  /** Raw 16-bit elevation values; do NOT mutate. Call .slice() to make a working copy. */
  heightmapTemplate: Uint16Array
  /** Raw mask bytes; do NOT mutate. */
  maskTemplate: Uint8Array
  width: number
  height: number
}

const STORAGE_BUCKET = 'tiles'

export class SupabaseTileLoader implements TileLoader {
  private cache = new Map<TileSlug, CachedTile>()

  constructor(private readonly client: SupabaseClient) {}

  async load(slug: TileSlug): Promise<LoadedTile> {
    const cached = this.cache.get(slug) ?? (await this.fetchAndCache(slug))

    // Return a FRESH copy of the heightmap so reducer mutations don't pollute
    // the cache. The mask is shared because it's read-only (per AP §6).
    return {
      metadata: cached.metadata,
      fresh: {
        heightmap: new Uint16Array(cached.heightmapTemplate),
        mask: cached.maskTemplate,
        width: cached.width,
        height: cached.height,
      },
    }
  }

  private async fetchAndCache(slug: TileSlug): Promise<CachedTile> {
    const [metadataBlob, heightmapBlob, maskBlob] = await Promise.all([
      this.downloadAsArrayBuffer(`${slug}/tile.json`),
      this.downloadAsArrayBuffer(`${slug}/heightmap.png`),
      this.downloadAsArrayBuffer(`${slug}/mask.png`),
    ])

    const metadata = JSON.parse(
      new TextDecoder().decode(metadataBlob),
    ) as TileMetadata

    // Decode 16-bit grayscale PNG. CRITICAL: pass `depth: 'ushort'` to .raw()
    // — without it sharp's default pipeline converts 16-bit PNG to 8-bit
    // RGB(A) on output, and the Uint16Array we reinterpret from the bytes
    // contains values entirely unrelated to the original elevation data.
    // That breaks the determinism contract: prep-tiles' hash (computed on
    // the original Uint16Array before encoding) doesn't match WorldQuery's
    // hash (computed on this corrupted typed array), so /api/render/{hash}.png
    // 404s for every world.
    //
    // We also force grey16 colourspace to avoid sharp inserting an alpha
    // channel or otherwise re-interpreting the data.
    const heightmapDecoded = await sharp(Buffer.from(heightmapBlob))
      .toColourspace('grey16')
      .raw({ depth: 'ushort' })
      .toBuffer({ resolveWithObject: true })
    const heightmapTemplate = new Uint16Array(
      heightmapDecoded.data.buffer,
      heightmapDecoded.data.byteOffset,
      heightmapDecoded.data.byteLength / 2,
    )

    // Mask is 8-bit; byte buffer is the data. Force greyscale 8-bit to be
    // explicit about not getting RGB back.
    const maskDecoded = await sharp(Buffer.from(maskBlob))
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true })
    const maskTemplate = new Uint8Array(
      maskDecoded.data.buffer,
      maskDecoded.data.byteOffset,
      maskDecoded.data.byteLength,
    )

    if (
      heightmapDecoded.info.width !== maskDecoded.info.width ||
      heightmapDecoded.info.height !== maskDecoded.info.height
    ) {
      throw new Error(
        `Tile ${slug}: heightmap and mask dimensions don't match ` +
          `(${heightmapDecoded.info.width}x${heightmapDecoded.info.height} vs ` +
          `${maskDecoded.info.width}x${maskDecoded.info.height})`,
      )
    }

    const cached: CachedTile = {
      metadata,
      heightmapTemplate,
      maskTemplate,
      width: heightmapDecoded.info.width,
      height: heightmapDecoded.info.height,
    }
    this.cache.set(slug, cached)
    return cached
  }

  private async downloadAsArrayBuffer(path: string): Promise<ArrayBuffer> {
    const { data, error } = await this.client.storage
      .from(STORAGE_BUCKET)
      .download(path)
    if (error || !data) {
      throw new Error(
        `SupabaseTileLoader: failed to download ${STORAGE_BUCKET}/${path}: ${
          error?.message ?? 'no data'
        }`,
      )
    }
    return await data.arrayBuffer()
  }
}
