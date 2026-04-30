// scripts/prep-tiles.ts
//
// Offline DEM-prep pipeline: read raw DEMs from mauro-sources/DEM-Downloads/,
// crop + resample + radiometrically calibrate to a uniform 2048×2048 16-bit
// grayscale heightmap PNG, generate is-land mask, render hillshade, write
// tile.json metadata. Output to mauro-sources/DEM-Downloads/_processed/{slug}/.
//
// Run via: pnpm --filter @mauro/scripts prep-tiles
//
// Per-tile gates: missing source files mean the tile is skipped with a clear
// message. The script is idempotent — safe to re-run; outputs are overwritten.
//
// Radiometric calibration (CARRY_FORWARD.md):
//   #000000 (0)     → trench / lowest possible elevation (-32768 m)
//   #808080 (32768) → datum sea level / mean radius
//   #FFFFFF (65535) → highest peak (+32767 m above datum)
// One unit per meter. Earth, Mars, and Moon all fit comfortably in this range.
//
// What this script does NOT do (yet):
//   - Mars MOLA: source still downloading; pipeline scaffolded but skipped.
//   - Moon SLDEM2015: wrong dataset currently targeted in download_dems.py
//     (LOLA-Kaguya Shade is pre-rendered hillshade, not raw elevation).
//     Update the Python downloader, then re-run this script.
//   - Norway Copernicus GLO-30: source not yet downloaded.
//   - Supabase Storage upload: outputs land locally; manual upload step
//     follows tile-prep day.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import sharp from 'sharp'
import { fromArrayBuffer } from 'geotiff'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { computeHillshade, type HillshadeParams } from '@mauro/geo'
import type {
  DemoPolygon,
  TileMetadata,
  TileSlug,
  TileSourceProvenance,
} from '@mauro/sim'

// ============================================================================
// Paths
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(REPO_ROOT, 'mauro-sources', 'DEM-Downloads')
const OUT_DIR = path.join(SOURCE_DIR, '_processed')

// Pull Supabase creds from apps/web/.env.local (single source of truth — same
// values the running web app uses).
loadDotenv({ path: path.join(REPO_ROOT, 'apps', 'web', '.env.local') })

const TARGET_W = 2048
const TARGET_H = 2048

// Sea level / datum offset. Pixels at this value = "sea level."
// Pixels above = land/mountain. Pixels below = ocean/basin.
const DATUM_OFFSET = 32768

// Storage buckets (created by supabase/migrations/0004_storage_buckets.sql).
const TILES_BUCKET = 'tiles'
const RENDERED_BUCKET = 'tiles-rendered'

const SHOULD_UPLOAD = !process.env.PREP_SKIP_UPLOAD

// ============================================================================
// Manifest — the 5 v0 tiles, with per-tile sources, bounds, and parameters.
// Edit demoPolygon coords after picking them visually in QGIS on the
// processed _processed/{slug}/heightmap.png output.
// ============================================================================

interface SrtmSpec {
  type: 'srtm-tiles'
  /** Each path is a 1°×1° GeoTIFF in EPSG:4326 (latitude/longitude). */
  paths: string[]
}

interface GeotiffRegionSpec {
  type: 'geotiff-region'
  /** A single GeoTIFF that already covers the target region. */
  path: string
  /** Whether sea-level offset has been applied (false = data is meters above datum). */
  isOffsetApplied?: boolean
}

interface SkipSpec {
  type: 'skip'
  reason: string
}

type SourceSpec = SrtmSpec | GeotiffRegionSpec | SkipSpec

interface TileEntry {
  slug: TileSlug
  body: 'earth' | 'mars' | 'moon'
  sourceRegion: TileMetadata['sourceRegion']
  /** [latMin, latMax, lonMin, lonMax]. Used to crop the source mosaic. */
  cropBounds: [number, number, number, number]
  cellSizeMeters: number
  hillshadeParams: HillshadeParams
  demoPolygon: DemoPolygon
  source: SourceSpec
  provenance: Omit<TileSourceProvenance, 'fileChecksum'>
}

const MANIFEST: TileEntry[] = [
  {
    slug: 'earth-patagonia',
    body: 'earth',
    sourceRegion: {
      name: 'Patagonian fjords (Cordillera Darwin)',
      lat: -50.75,
      lon: -73,
      widthDeg: 1.5,
      heightDeg: 1.5,
    },
    cropBounds: [-51.5, -50.0, -73.75, -72.25],
    cellSizeMeters: 80,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 45,
      zFactor: 1.0,
      cellSizeMeters: 80,
    },
    demoPolygon: {
      polygonId: 'demo',
      // Placeholder square in the lower-right quadrant. Replace with QGIS-picked
      // polygon coords for the real demo location once the visual is in hand.
      pixels: [
        [1100, 1100],
        [1500, 1100],
        [1500, 1500],
        [1100, 1500],
      ],
      description: 'TODO: pick a coastal lowland polygon in QGIS',
    },
    source: {
      type: 'srtm-tiles',
      paths: [
        'Earth/SRTM/Patagonia/S50W073.tif',
        'Earth/SRTM/Patagonia/S51W073.tif',
        'Earth/SRTM/Patagonia/S51W074.tif',
      ],
    },
    provenance: {
      dataset: 'SRTM',
      datasetVersion: 'SRTMGL1.003',
      downloadUrl:
        'https://step.esa.int/auxdata/dem/SRTMGL1/ (mirrored from USGS)',
      license: 'public-domain',
      attribution: 'Courtesy of NASA / USGS — SRTM v3.0 (1 arc-second global)',
    },
  },
  {
    slug: 'earth-pamirs',
    body: 'earth',
    sourceRegion: {
      name: 'Pamir massif (Hindu Kush eastern flank)',
      lat: 38.5,
      lon: 73.5,
      widthDeg: 1.5,
      heightDeg: 1.5,
    },
    cropBounds: [38.0, 39.5, 73.25, 74.75],
    cellSizeMeters: 80,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 35,
      zFactor: 1.0,
      cellSizeMeters: 80,
    },
    demoPolygon: {
      polygonId: 'demo',
      pixels: [
        [800, 800],
        [1200, 800],
        [1200, 1200],
        [800, 1200],
      ],
      description: 'TODO: pick a high-relief ridge polygon in QGIS',
    },
    source: {
      type: 'srtm-tiles',
      paths: [
        'Earth/SRTM/Pamir/N38E073.tif',
        'Earth/SRTM/Pamir/N38E074.tif',
        'Earth/SRTM/Pamir/N39E073.tif',
        'Earth/SRTM/Pamir/N39E074.tif',
      ],
    },
    provenance: {
      dataset: 'SRTM',
      datasetVersion: 'SRTMGL1.003',
      downloadUrl:
        'https://step.esa.int/auxdata/dem/SRTMGL1/ (mirrored from USGS)',
      license: 'public-domain',
      attribution: 'Courtesy of NASA / USGS — SRTM v3.0 (1 arc-second global)',
    },
  },
  {
    slug: 'earth-norway',
    body: 'earth',
    sourceRegion: {
      name: 'Norwegian fjord coast (Sunnmøre)',
      lat: 62.5,
      lon: 6.5,
      widthDeg: 1.5,
      heightDeg: 1.5,
    },
    cropBounds: [62.0, 63.5, 6.0, 7.5],
    cellSizeMeters: 30,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 45,
      zFactor: 1.5,
      cellSizeMeters: 30,
    },
    demoPolygon: {
      polygonId: 'demo',
      pixels: [
        [800, 800],
        [1200, 800],
        [1200, 1200],
        [800, 1200],
      ],
      description: 'TODO: pick a fjord-mouth polygon in QGIS',
    },
    source: {
      type: 'srtm-tiles',
      paths: [
        'Earth/SRTM/Norway/N62E006_COP30.tif',
        'Earth/SRTM/Norway/N62E007_COP30.tif',
        'Earth/SRTM/Norway/N63E006_COP30.tif',
        'Earth/SRTM/Norway/N63E007_COP30.tif',
      ],
    },
    provenance: {
      dataset: 'COP30',
      datasetVersion: 'GLO-30',
      downloadUrl: 'https://copernicus-dem-30m.s3.amazonaws.com/',
      license: 'public-domain',
      attribution:
        'Copernicus GLO-30 © DLR / ESA / EU. Mirror via opentopography AWS.',
    },
  },
  {
    slug: 'mars-tharsis',
    body: 'mars',
    sourceRegion: {
      name: 'Tharsis Montes & Olympus Mons',
      lat: 10,
      lon: -120,
      widthDeg: 40,
      heightDeg: 30,
    },
    cropBounds: [-5, 25, -140, -100],
    cellSizeMeters: 463,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 25,
      zFactor: 0.5,
      cellSizeMeters: 463,
    },
    demoPolygon: {
      polygonId: 'demo',
      pixels: [
        [800, 800],
        [1200, 800],
        [1200, 1200],
        [800, 1200],
      ],
      description: 'TODO: pick a flank-of-Olympus-Mons polygon in QGIS',
    },
    source: {
      type: 'geotiff-region',
      path: 'Mars/MOLA/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif',
      isOffsetApplied: false,
    },
    provenance: {
      dataset: 'MOLA',
      datasetVersion: 'MOLA-MEGDR-128px',
      downloadUrl:
        'https://astrogeology.usgs.gov/search/map/Mars/GlobalSurveyor/MOLA/Mars_MGS_MOLA_DEM_mosaic_global_463m',
      license: 'public-domain',
      attribution: 'NASA / MOLA Science Team — MGS MOLA MEGDR (Mars 2000 datum)',
    },
  },
  {
    slug: 'moon-imbrium',
    body: 'moon',
    sourceRegion: {
      name: 'Mare Imbrium & Apennines',
      lat: 35,
      lon: -5,
      widthDeg: 30,
      heightDeg: 30,
    },
    cropBounds: [20, 50, -20, 10],
    cellSizeMeters: 60,
    hillshadeParams: {
      azimuthDeg: 315,
      altitudeDeg: 20,
      zFactor: 1.0,
      cellSizeMeters: 60,
    },
    demoPolygon: {
      polygonId: 'demo',
      pixels: [
        [800, 800],
        [1200, 800],
        [1200, 1200],
        [800, 1200],
      ],
      description: 'TODO: pick a mare-rim polygon in QGIS',
    },
    source: {
      type: 'skip',
      reason:
        'Currently-targeted dataset (LOLA-Kaguya Shade) is pre-rendered ' +
        'hillshade, not raw elevation. Update download_dems.py to fetch ' +
        'SLDEM2015 from PDS Geosciences Node (https://pgda.gsfc.nasa.gov/products/54).',
    },
    provenance: {
      dataset: 'SLDEM2015',
      datasetVersion: 'SLDEM2015',
      downloadUrl: 'https://pgda.gsfc.nasa.gov/products/54',
      license: 'public-domain',
      attribution:
        'Barker et al. 2016 (Icarus). LRO LOLA + SELENE TC fusion DEM.',
    },
  },
]

// ============================================================================
// Main entry point
// ============================================================================

async function main() {
  console.log(`MAURO tile prep — output → ${OUT_DIR}\n`)

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const entry of MANIFEST) {
    const banner = `[${entry.slug.padEnd(18)}]`
    console.log(`${banner} ${entry.sourceRegion.name}`)

    try {
      const result = await processTile(entry)
      if (result.skipped) {
        console.log(`${banner}   ⏭  skipped: ${result.reason}\n`)
        skipped++
        continue
      }
      const uploadNote = result.uploaded
        ? `   ↗ uploaded to Storage (substrateHash: ${result.substrateHash?.slice(0, 12)}…)`
        : '   (upload skipped via PREP_SKIP_UPLOAD)'
      console.log(`${banner}   ✓ done — ${result.outputDir}\n${banner}${uploadNote}\n`)
      processed++
    } catch (err) {
      console.error(
        `${banner}   ✗ error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      failed++
    }
  }

  console.log(`Summary: ${processed} processed, ${skipped} skipped, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

interface ProcessResult {
  outputDir?: string
  skipped: boolean
  reason?: string
  substrateHash?: string
  uploaded?: boolean
}

async function processTile(entry: TileEntry): Promise<ProcessResult> {
  if (entry.source.type === 'skip') {
    return { skipped: true, reason: entry.source.reason }
  }

  // Verify all source files exist before doing any work.
  const sourcePaths = collectSourcePaths(entry.source)
  for (const rel of sourcePaths) {
    const abs = path.join(SOURCE_DIR, rel)
    try {
      await stat(abs)
    } catch {
      return {
        skipped: true,
        reason: `source file missing: ${rel} (download not yet complete)`,
      }
    }
  }

  // Read + mosaic the elevation data into a single Int16 grid covering the
  // bounding box of all sources, in source resolution. cropBounds is used by
  // the windowed reader to avoid materializing huge global rasters.
  const mosaic = await readSourceMosaic(entry.source, entry.cropBounds)

  // Crop the mosaic to entry.cropBounds, then resize to the target output
  // resolution (2048×2048).
  const cropped = await cropAndResize(mosaic, entry.cropBounds, TARGET_W, TARGET_H)

  // Convert from Int16 (meters above datum) to Uint16 (meters + DATUM_OFFSET).
  const heightmap = applyDatumOffset(cropped)

  // Generate is-land mask. For Earth: land = elevation >= sea level (>= DATUM_OFFSET).
  // For Mars/Moon (no oceans): all pixels are surface (mask = 1).
  const mask = generateMask(heightmap, entry.body)

  // Render hillshade preview using the same module the runtime route uses.
  const hillshadeRgba = computeHillshade(
    heightmap,
    mask,
    TARGET_W,
    TARGET_H,
    entry.hillshadeParams,
  )

  // Write outputs.
  const outDir = path.join(OUT_DIR, entry.slug)
  await mkdir(outDir, { recursive: true })

  await writeHeightmapPng(heightmap, TARGET_W, TARGET_H, path.join(outDir, 'heightmap.png'))
  await writeMaskPng(mask, TARGET_W, TARGET_H, path.join(outDir, 'mask.png'))
  await writeHillshadePng(
    hillshadeRgba,
    TARGET_W,
    TARGET_H,
    path.join(outDir, 'hillshade.png'),
  )

  // Compute SHA256 of all source files (for provenance).
  const fileChecksum = await computeSourcesChecksum(sourcePaths)

  // Compute the substrate hash for the WORLD-CREATED state (no events
  // applied yet) the SAME WAY WorldQuery's TileLoader computes it at read
  // time: read the on-disk heightmap.png bytes we're about to upload,
  // decode through sharp.toColourspace('grey16').raw({ depth: 'ushort' })
  // — byte-identical to TileLoader.fetchAndCache() — and hash the decoded
  // Uint16Array. Hashing the pre-encode bytes diverges from TileLoader's
  // post-decode hash because sharp's grey16 → PNG → grey16 round-trip
  // isn't bit-identical to the input. Using the same PNG buffer Storage
  // serves guarantees the read-side hash matches.
  const heightmapPngBuf = await readFile(path.join(outDir, 'heightmap.png'))
  const heightmapDecoded = await sharp(heightmapPngBuf)
    .toColourspace('grey16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const roundTrippedHeightmap = new Uint16Array(
    heightmapDecoded.data.buffer,
    heightmapDecoded.data.byteOffset,
    heightmapDecoded.data.byteLength / 2,
  )
  const substrateHash = sha256OfHeightmap(roundTrippedHeightmap)

  const tileMeta: TileMetadata = {
    slug: entry.slug,
    body: entry.body,
    sourceRegion: entry.sourceRegion,
    cellSizeMeters: entry.cellSizeMeters,
    hillshadeParams: entry.hillshadeParams,
    demoPolygon: entry.demoPolygon,
    source: { ...entry.provenance, fileChecksum },
    sourceSubstrateHash: substrateHash,
  }
  const tileJsonStr = JSON.stringify(tileMeta, null, 2) + '\n'
  await writeFile(path.join(outDir, 'tile.json'), tileJsonStr, 'utf8')

  // Upload to Supabase Storage so MapLibre + the /api/render route can fetch.
  if (SHOULD_UPLOAD) {
    const supabase = getSupabase()
    const maskBuf = await readFile(path.join(outDir, 'mask.png'))
    const hillshadeBuf = await readFile(path.join(outDir, 'hillshade.png'))

    await uploadObject(supabase, TILES_BUCKET, `${entry.slug}/heightmap.png`, heightmapPngBuf, 'image/png')
    await uploadObject(supabase, TILES_BUCKET, `${entry.slug}/mask.png`, maskBuf, 'image/png')
    await uploadObject(supabase, TILES_BUCKET, `${entry.slug}/tile.json`, Buffer.from(tileJsonStr, 'utf8'), 'application/json')
    await uploadObject(supabase, RENDERED_BUCKET, `${substrateHash}.png`, hillshadeBuf, 'image/png')

    return {
      outputDir: outDir,
      skipped: false,
      substrateHash,
      uploaded: true,
    }
  }

  return { outputDir: outDir, skipped: false, substrateHash, uploaded: false }
}

// ============================================================================
// Storage upload
// ============================================================================

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'prep-tiles upload requires NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local. Set ' +
        'PREP_SKIP_UPLOAD=1 to run prep without uploading.',
    )
  }
  _supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _supabase
}

async function uploadObject(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
    contentType,
    upsert: true,
  })
  if (error) {
    throw new Error(
      `Storage upload failed (${bucket}/${objectPath}): ${error.message}`,
    )
  }
}

function sha256OfHeightmap(heightmap: Uint16Array): string {
  const buffer = Buffer.from(
    heightmap.buffer,
    heightmap.byteOffset,
    heightmap.byteLength,
  )
  return createHash('sha256').update(buffer).digest('hex')
}

function collectSourcePaths(source: Exclude<SourceSpec, SkipSpec>): string[] {
  if (source.type === 'srtm-tiles') return source.paths
  if (source.type === 'geotiff-region') return [source.path]
  return []
}

// ============================================================================
// Source mosaic — read each source GeoTIFF, lay out pixels in a unified grid
// ============================================================================

interface MosaicGrid {
  /** Int16 elevation values in meters above the body's datum. */
  data: Int16Array
  width: number
  height: number
  /** [latMin, latMax, lonMin, lonMax] of the mosaic. */
  bounds: [number, number, number, number]
  /** Pixels per degree of LONGITUDE. Copernicus reduces this at high latitudes. */
  pixelsPerDegreeX: number
  /** Pixels per degree of LATITUDE. */
  pixelsPerDegreeY: number
}

async function readSourceMosaic(
  source: Exclude<SourceSpec, SkipSpec>,
  cropBounds: [number, number, number, number],
): Promise<MosaicGrid> {
  if (source.type === 'srtm-tiles') {
    return await readSrtmMosaic(source.paths)
  }
  // 'geotiff-region': single source — windowed read avoids materializing
  // huge global rasters (MOLA is 2GB / 1B samples, would OOM Node otherwise).
  return await readSingleGeotiff(source.path, cropBounds)
}

async function readSrtmMosaic(relPaths: string[]): Promise<MosaicGrid> {
  // Read each tile, get its bbox + per-axis resolution, find the union,
  // allocate a single grid, copy pixels into the right location.
  //
  // Critical: Copernicus GLO-30 tiles above ~50° latitude have NON-SQUARE
  // pixels (e.g., 1800×3600 covering 1°×1°), so ppdX ≠ ppdY. SRTM is square.
  // Code below tracks both axes separately to handle either case.
  type Tile = {
    data: Int16Array
    width: number
    height: number
    bounds: [number, number, number, number] // [latMin, latMax, lonMin, lonMax]
    ppdX: number
    ppdY: number
  }
  const tiles: Tile[] = []
  for (const rel of relPaths) {
    const abs = path.join(SOURCE_DIR, rel)
    const buf = await readFile(abs)
    const tiff = await fromArrayBuffer(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    )
    const image = await tiff.getImage()
    const bbox = image.getBoundingBox() // [west, south, east, north] (lon/lat)
    const rasters = await image.readRasters({ interleave: false })
    const data = rasters[0]
    if (
      !data ||
      !(
        data instanceof Int16Array ||
        data instanceof Uint16Array ||
        data instanceof Float32Array
      )
    ) {
      throw new Error(`Unexpected raster type for ${rel}: ${data?.constructor?.name}`)
    }
    const width = image.getWidth()
    const height = image.getHeight()
    const lonRange = bbox[2]! - bbox[0]! // east - west
    const latRange = bbox[3]! - bbox[1]! // north - south
    const ppdX = (width - 1) / lonRange
    const ppdY = (height - 1) / latRange
    // Cast Float32 (Copernicus) → Int16 by rounding. Sub-meter precision is
    // acceptable for the 16-bit calibration we apply later.
    const i16 =
      data instanceof Int16Array
        ? data
        : data instanceof Float32Array
          ? Int16Array.from(data, (v) => Math.round(v))
          : Int16Array.from(data as Uint16Array)
    tiles.push({
      data: i16,
      width,
      height,
      bounds: [bbox[1]!, bbox[3]!, bbox[0]!, bbox[2]!],
      ppdX,
      ppdY,
    })
  }

  // Compute union bbox.
  let latMin = Infinity
  let latMax = -Infinity
  let lonMin = Infinity
  let lonMax = -Infinity
  for (const t of tiles) {
    if (t.bounds[0] < latMin) latMin = t.bounds[0]
    if (t.bounds[1] > latMax) latMax = t.bounds[1]
    if (t.bounds[2] < lonMin) lonMin = t.bounds[2]
    if (t.bounds[3] > lonMax) lonMax = t.bounds[3]
  }

  // Use the FIRST tile's per-axis resolution as the mosaic's resolution.
  // For SRTM all tiles are equal; for Copernicus, all tiles at a given
  // latitude band are equal too (the same horizontal compression applies
  // uniformly). If a future mosaic spans multiple latitude bands with
  // different ppdX values, this would need upsample/downsample.
  const ppdX = tiles[0]!.ppdX
  const ppdY = tiles[0]!.ppdY

  const mosaicWidth = Math.round((lonMax - lonMin) * ppdX) + 1
  const mosaicHeight = Math.round((latMax - latMin) * ppdY) + 1
  const data = new Int16Array(mosaicWidth * mosaicHeight)
  data.fill(0)

  for (const t of tiles) {
    const xOffset = Math.round((t.bounds[2] - lonMin) * ppdX)
    const yOffset = Math.round((latMax - t.bounds[1]) * ppdY)
    for (let ty = 0; ty < t.height; ty++) {
      const dstY = yOffset + ty
      if (dstY < 0 || dstY >= mosaicHeight) continue
      const srcRow = ty * t.width
      const dstRow = dstY * mosaicWidth + xOffset
      for (let tx = 0; tx < t.width; tx++) {
        const dstX = xOffset + tx
        if (dstX < 0 || dstX >= mosaicWidth) continue
        const v = t.data[srcRow + tx]!
        // SRTM uses -32768 as "no data"; Copernicus uses no GDAL_NODATA tag
        // but spurious negatives in ocean areas (saw min=-0.84). Treat the
        // SRTM sentinel as 0 (sea level) and let real negatives pass through
        // (they get clipped by the datum-offset clamp downstream).
        data[dstRow + tx] = v === -32768 ? 0 : v
      }
    }
  }

  return {
    data,
    width: mosaicWidth,
    height: mosaicHeight,
    bounds: [latMin, latMax, lonMin, lonMax],
    pixelsPerDegreeX: ppdX,
    pixelsPerDegreeY: ppdY,
  }
}

async function readSingleGeotiff(
  rel: string,
  cropBounds: [number, number, number, number],
): Promise<MosaicGrid> {
  const abs = path.join(SOURCE_DIR, rel)
  const buf = await readFile(abs)
  const tiff = await fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  )
  const image = await tiff.getImage()
  const rawBbox = image.getBoundingBox() // [west, south, east, north] in source CRS units
  const fileDirectory = image.fileDirectory as Record<string, unknown>
  const geoKeys = (image.geoKeys ?? {}) as Record<string, unknown>
  const fullWidth = image.getWidth()
  const fullHeight = image.getHeight()

  // Detect projected (meters) vs geographic (degrees).
  // ProjLinearUnitsGeoKey 9001 = meter (EPSG). MOLA uses Mars equirectangular
  // in meters; we convert to degrees using the body's equatorial radius so
  // cropBounds (in degrees) can intersect the raster.
  const projUnits = geoKeys.ProjLinearUnitsGeoKey
  let bbox = rawBbox
  let metersPerDegree: number | null = null
  if (projUnits === 9001 || Math.abs(rawBbox[0]!) > 360) {
    // Body detection by bbox magnitude.
    const halfWidth = Math.abs(rawBbox[2]!)
    const equatorialRadiusM =
      halfWidth > 15_000_000
        ? 6378137 // Earth WGS84
        : halfWidth > 8_000_000
          ? 3389500 // Mars (MOLA datum)
          : 1737400 // Moon (LRO datum)
    metersPerDegree = (Math.PI * equatorialRadiusM) / 180
    bbox = [
      rawBbox[0]! / metersPerDegree,
      rawBbox[1]! / metersPerDegree,
      rawBbox[2]! / metersPerDegree,
      rawBbox[3]! / metersPerDegree,
    ]
  }

  const lonRange = bbox[2]! - bbox[0]!
  const latRange = bbox[3]! - bbox[1]!
  const ppdX = (fullWidth - 1) / lonRange
  const ppdY = (fullHeight - 1) / latRange

  // Compute the windowed read box in PIXEL coords.
  // cropBounds is [latMin, latMax, lonMin, lonMax]. Source y-axis origin is
  // top (north). Apply a 1-tile margin so the window definitely contains the
  // full crop after resampling.
  const [cropLatMin, cropLatMax, cropLonMin, cropLonMax] = cropBounds
  const xPxStart = Math.max(0, Math.floor((cropLonMin - bbox[0]!) * ppdX) - 2)
  const xPxEnd = Math.min(fullWidth, Math.ceil((cropLonMax - bbox[0]!) * ppdX) + 2)
  const yPxStart = Math.max(0, Math.floor((bbox[3]! - cropLatMax) * ppdY) - 2)
  const yPxEnd = Math.min(fullHeight, Math.ceil((bbox[3]! - cropLatMin) * ppdY) + 2)

  if (xPxEnd <= xPxStart || yPxEnd <= yPxStart) {
    throw new Error(
      `Crop bounds [${cropBounds.join(',')}] don't intersect source ` +
        `[lat ${bbox[1]}..${bbox[3]}, lon ${bbox[0]}..${bbox[2]}] of ${rel}`,
    )
  }

  // Windowed read — only materializes the cropped region. Critical for MOLA
  // (2GB / 1B samples global) which would OOM Node otherwise.
  const window: [number, number, number, number] = [xPxStart, yPxStart, xPxEnd, yPxEnd]
  const rasters = await image.readRasters({ interleave: false, window })
  const raw = rasters[0]
  if (!raw) throw new Error(`No raster band in ${rel}`)

  const winWidth = xPxEnd - xPxStart
  const winHeight = yPxEnd - yPxStart

  const nodataStr = (fileDirectory.GDAL_NODATA as string | undefined)?.replace(
    /\0/g,
    '',
  )
  const nodata = nodataStr ? Number(nodataStr) : null

  const data =
    raw instanceof Int16Array
      ? Int16Array.from(raw, (v) => (nodata !== null && v === nodata ? 0 : v))
      : raw instanceof Float32Array
        ? Int16Array.from(raw, (v) =>
            nodata !== null && v === nodata ? 0 : Math.round(v),
          )
        : Int16Array.from(raw as ArrayLike<number>)

  // The MosaicGrid bounds describe the window we read, not the full source.
  const winLonMin = bbox[0]! + xPxStart / ppdX
  const winLonMax = bbox[0]! + xPxEnd / ppdX
  const winLatMax = bbox[3]! - yPxStart / ppdY
  const winLatMin = bbox[3]! - yPxEnd / ppdY

  return {
    data,
    width: winWidth,
    height: winHeight,
    bounds: [winLatMin, winLatMax, winLonMin, winLonMax],
    pixelsPerDegreeX: ppdX,
    pixelsPerDegreeY: ppdY,
  }
}

// ============================================================================
// Crop + resize
// ============================================================================

async function cropAndResize(
  src: MosaicGrid,
  cropBounds: [number, number, number, number],
  targetW: number,
  targetH: number,
): Promise<Int16Array> {
  const [latMin, latMax, lonMin, lonMax] = cropBounds

  const xStart = Math.max(0, Math.floor((lonMin - src.bounds[2]) * src.pixelsPerDegreeX))
  const xEnd = Math.min(
    src.width,
    Math.ceil((lonMax - src.bounds[2]) * src.pixelsPerDegreeX),
  )
  const yStart = Math.max(0, Math.floor((src.bounds[1] - latMax) * src.pixelsPerDegreeY))
  const yEnd = Math.min(
    src.height,
    Math.ceil((src.bounds[1] - latMin) * src.pixelsPerDegreeY),
  )

  const cropW = xEnd - xStart
  const cropH = yEnd - yStart
  if (cropW <= 0 || cropH <= 0) {
    throw new Error(
      `Crop bounds [${cropBounds.join(',')}] don't intersect source ` +
        `[${src.bounds.join(',')}]`,
    )
  }

  // Bilinear resize from cropW×cropH → targetW×targetH.
  const out = new Int16Array(targetW * targetH)
  for (let dy = 0; dy < targetH; dy++) {
    const sy = (dy / (targetH - 1)) * (cropH - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, cropH - 1)
    const fy = sy - y0
    for (let dx = 0; dx < targetW; dx++) {
      const sx = (dx / (targetW - 1)) * (cropW - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, cropW - 1)
      const fx = sx - x0

      const v00 = src.data[(yStart + y0) * src.width + (xStart + x0)]!
      const v01 = src.data[(yStart + y0) * src.width + (xStart + x1)]!
      const v10 = src.data[(yStart + y1) * src.width + (xStart + x0)]!
      const v11 = src.data[(yStart + y1) * src.width + (xStart + x1)]!

      const top = v00 * (1 - fx) + v01 * fx
      const bot = v10 * (1 - fx) + v11 * fx
      const v = top * (1 - fy) + bot * fy

      out[dy * targetW + dx] = Math.round(v)
    }
  }
  return out
}

// ============================================================================
// Datum offset + mask generation
// ============================================================================

function applyDatumOffset(int16: Int16Array): Uint16Array {
  const out = new Uint16Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    const offset = int16[i]! + DATUM_OFFSET
    if (offset < 0) out[i] = 0
    else if (offset > 0xffff) out[i] = 0xffff
    else out[i] = offset
  }
  return out
}

function generateMask(heightmap: Uint16Array, body: 'earth' | 'mars' | 'moon'): Uint8Array {
  const out = new Uint8Array(heightmap.length)
  if (body === 'earth') {
    // Earth: land where elevation >= sea level (>= DATUM_OFFSET).
    for (let i = 0; i < heightmap.length; i++) {
      out[i] = heightmap[i]! >= DATUM_OFFSET ? 1 : 0
    }
  } else {
    // Mars / Moon: no oceans. Entire surface is "land."
    out.fill(1)
  }
  return out
}

// ============================================================================
// PNG output
// ============================================================================

async function writeHeightmapPng(
  heightmap: Uint16Array,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  // Sharp supports 16-bit grayscale PNG via raw input with 'ushort' depth.
  // The buffer is interpreted as little-endian 16-bit samples (matches the
  // typed array's host endianness on x86 / ARM / Vercel runtime).
  const buf = Buffer.from(
    heightmap.buffer,
    heightmap.byteOffset,
    heightmap.byteLength,
  )
  await sharp(buf, {
    raw: { width, height, channels: 1 },
  })
    .toColourspace('grey16')
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

async function writeMaskPng(
  mask: Uint8Array,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  // 1 → 255 (white land), 0 → 0 (black ocean) — easier visual inspection.
  const expanded = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) expanded[i] = mask[i] ? 255 : 0
  await sharp(expanded, {
    raw: { width, height, channels: 1 },
  })
    .png({ compressionLevel: 9, palette: true })
    .toFile(outPath)
}

async function writeHillshadePng(
  rgba: Uint8Array,
  width: number,
  height: number,
  outPath: string,
): Promise<void> {
  await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 7 })
    .toFile(outPath)
}

// ============================================================================
// SHA256 of source files (for provenance pinning)
// ============================================================================

async function computeSourcesChecksum(relPaths: string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const rel of relPaths.sort()) {
    const buf = await readFile(path.join(SOURCE_DIR, rel))
    hash.update(rel) // include filename so order matters
    hash.update(buf)
  }
  return hash.digest('hex')
}

// ============================================================================

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
