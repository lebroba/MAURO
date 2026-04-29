import { NextResponse } from 'next/server'
import sharp from 'sharp'
import * as GeoTIFF from 'geotiff'

// Vercel runtime configuration. Node, not Edge — sharp is libvips-bound and
// will not load on the Edge runtime. 30s timeout gives the cold-start path
// breathing room while we measure it.
export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// Module-load timestamp is recorded once when the function instance boots.
// Subtract from handler-entry to get cold-start time. On warm invocations the
// delta will be small; on a fresh cold start it includes sharp's libvips load.
const MODULE_LOADED_AT = Date.now()

// Touch the geotiff import so it isn't tree-shaken out — we need to know the
// dependency loads cleanly even though we don't decode a real TIFF in this spike.
const GEOTIFF_FROM_ARRAY_BUFFER = GeoTIFF.fromArrayBuffer

const W = 2048
const H = 2048

function generateSyntheticHeightmap(): Uint16Array {
  // Sin-cos surface with cross gradients so the hillshade pass has actual
  // work to do (a flat heightmap short-circuits Horn's method).
  const buf = new Uint16Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 4
      const v = (y / H) * Math.PI * 4
      const elev = (Math.sin(u) * Math.cos(v) + 1) * 0.5 // 0..1
      const ridge = Math.sin(u * 2.7) * Math.cos(v * 1.3) * 0.3
      buf[y * W + x] = Math.max(0, Math.min(65535, Math.round((elev + ridge) * 50000)))
    }
  }
  return buf
}

function generateSyntheticMask(): Uint8Array {
  // All-land mask with a lake circle so the ocean-color path also runs.
  const buf = new Uint8Array(W * H)
  const cx = W * 0.7
  const cy = H * 0.55
  const r2 = (W * 0.12) ** 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx
      const dy = y - cy
      buf[y * W + x] = dx * dx + dy * dy > r2 ? 1 : 0
    }
  }
  return buf
}

// Horn's-method hillshade — same algorithm the production module will run.
// Edge replication on the 1-pixel border. Ocean pixels (mask=0) render as the
// fixed verdigris color from DESIGN.md (#3B6B5A) so the ocean path is exercised.
function computeHillshade(
  heightmap: Uint16Array,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const azimuthDeg = 315
  const altitudeDeg = 45
  const zFactor = 1.0
  const cellSize = 30 // meters

  const azRad = (azimuthDeg * Math.PI) / 180
  const altRad = (altitudeDeg * Math.PI) / 180
  const sunX = Math.cos(altRad) * Math.sin(azRad)
  const sunY = Math.cos(altRad) * Math.cos(azRad)
  const sunZ = Math.sin(altRad)

  const out = new Uint8Array(width * height * 4)

  // Ocean color from DESIGN.md verdigris #3B6B5A.
  const OCEAN_R = 0x3b
  const OCEAN_G = 0x6b
  const OCEAN_B = 0x5a

  for (let y = 0; y < height; y++) {
    const yp = y === 0 ? 0 : y - 1
    const yn = y === height - 1 ? height - 1 : y + 1
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const oi = idx * 4

      if (mask[idx] === 0) {
        out[oi] = OCEAN_R
        out[oi + 1] = OCEAN_G
        out[oi + 2] = OCEAN_B
        out[oi + 3] = 255
        continue
      }

      const xp = x === 0 ? 0 : x - 1
      const xn = x === width - 1 ? width - 1 : x + 1

      // Reads are bounded by yp/yn/xp/xn clamping above; non-null asserts are safe.
      const a = heightmap[yp * width + xp]!
      const b = heightmap[yp * width + x]!
      const c = heightmap[yp * width + xn]!
      const d = heightmap[y * width + xp]!
      const f = heightmap[y * width + xn]!
      const g = heightmap[yn * width + xp]!
      const h = heightmap[yn * width + x]!
      const i = heightmap[yn * width + xn]!

      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSize)
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cellSize)

      // Surface normal, scaled by zFactor on the vertical.
      const nx = -dzdx * zFactor
      const ny = -dzdy * zFactor
      const nz = 1
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)

      let dot = (nx * sunX + ny * sunY + nz * sunZ) / nLen
      if (dot < 0) dot = 0
      if (dot > 1) dot = 1

      const shade = Math.round(dot * 255)
      out[oi] = shade
      out[oi + 1] = shade
      out[oi + 2] = shade
      out[oi + 3] = 255
    }
  }

  return out
}

function snapMemMB() {
  const m = process.memoryUsage()
  return {
    rss: Math.round(m.rss / 1024 / 1024),
    heapTotal: Math.round(m.heapTotal / 1024 / 1024),
    heapUsed: Math.round(m.heapUsed / 1024 / 1024),
    external: Math.round(m.external / 1024 / 1024),
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wantImage = url.searchParams.get('image') === '1'

  const handlerStart = Date.now()
  const coldStartMs = handlerStart - MODULE_LOADED_AT
  const processUptimeAtEntryMs = Math.round(process.uptime() * 1000)

  const memBefore = snapMemMB()

  // Stage 1: synthesize heightmap + mask
  const t0 = Date.now()
  const heightmap = generateSyntheticHeightmap()
  const mask = generateSyntheticMask()
  const synthMs = Date.now() - t0
  const memAfterSynth = snapMemMB()

  // Stage 2: hillshade
  const t1 = Date.now()
  const rgba = computeHillshade(heightmap, mask, W, H)
  const hillshadeMs = Date.now() - t1
  const memAfterHillshade = snapMemMB()

  // Stage 3: encode to palette PNG via sharp
  const t2 = Date.now()
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .png({ palette: true, quality: 90, effort: 7 })
    .toBuffer()
  const encodeMs = Date.now() - t2
  const memAfterEncode = snapMemMB()

  const totalMs = Date.now() - handlerStart

  if (wantImage) {
    return new Response(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'x-spike-cold-start-ms': String(processUptimeAtEntryMs),
        'x-spike-total-ms': String(totalMs),
        'x-spike-png-bytes': String(png.length),
      },
    })
  }

  return NextResponse.json({
    spike: 'render-envelope',
    cold: {
      moduleLoadedAtMs: MODULE_LOADED_AT,
      handlerStartMs: handlerStart,
      coldStartDeltaMs: coldStartMs,
      processUptimeAtEntryMs,
      isLikelyColdStart: processUptimeAtEntryMs < 2000,
    },
    timing: {
      synthMs,
      hillshadeMs,
      encodeMs,
      totalMs,
    },
    memoryMB: {
      before: memBefore,
      afterSynth: memAfterSynth,
      afterHillshade: memAfterHillshade,
      afterEncode: memAfterEncode,
    },
    output: {
      pngBytes: png.length,
      pngBytesKB: Math.round(png.length / 1024),
      width: W,
      height: H,
    },
    deps: {
      sharpVersion: sharp.versions ? Object.fromEntries(Object.entries(sharp.versions)) : 'unknown',
      geotiffLoaded: typeof GEOTIFF_FROM_ARRAY_BUFFER === 'function',
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      vercelEnv: process.env.VERCEL_ENV ?? 'local',
      vercelRegion: process.env.VERCEL_REGION ?? 'unknown',
    },
  })
}
