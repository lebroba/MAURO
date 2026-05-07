// MAURO hillshade — Horn's-method hillshade with cartographic color tinting.
//
// Reference: USGS GDAL gdaldem implements the same Horn 1981 method.
// We re-implement in TypeScript so we can run it inside Vercel functions
// (where shelling out to gdaldem isn't available) and inside the offline
// scripts/prep-tiles.ts pipeline. Same code path means the prep-time and
// render-time outputs are pixel-identical for an unchanged heightmap —
// asserted by Test #22 (prep ↔ render parity) in the eng-review test plan.
//
// Validated by a Day-1 spike (since retired):
//   - 2048×2048 heightmap → ~200ms compute on Vercel x86 Node 24
//   - Memory peak ~130MB, well under Vercel Hobby's 1GB ceiling
// Both numbers were measured against the grayscale prototype; the colored
// per-pixel ramp adds ~3 multiplies and one ramp lookup per land cell —
// arithmetic, well within the same envelope.
//
// Algorithm:
//   1. Pre-pass: find min/max elevation among land pixels for normalization.
//   2. For each pixel, compute slope (dz/dx, dz/dy) via Sobel-like
//      convolution against the 3×3 elevation neighborhood, scaled by
//      cellSizeMeters and zFactor.
//   3. Build a surface normal from those gradients.
//   4. Dot-product with the sun direction (from azimuth + altitude).
//   5. Sample a cartographic color ramp at the normalized elevation
//      (sand → grass → forest → highland → peak), then modulate by the
//      hillshade dot product so relief still reads. The modulation is
//      compressed to [0.55, 1.0] so shadow valleys keep their hue rather
//      than going pitch-black.
//   6. Ocean pixels (mask=0) get a fixed verdigris (#3B6B5A) per DESIGN.md.
//   7. Edge pixels use replicate-padding for the convolution to avoid
//      black borders.

export interface HillshadeParams {
  /** Sun azimuth in degrees, 0=N, 90=E. Cartographic convention is 315 (NW). */
  azimuthDeg: number
  /** Sun altitude above horizon (0–90). Default 45. */
  altitudeDeg: number
  /** Vertical exaggeration. 1.0 = true scale; raise for low-relief tiles
   * (lunar maria), lower for extreme-relief tiles (Mars Tharsis). */
  zFactor: number
  /** Ground distance per pixel in meters. Drives slope calculation. */
  cellSizeMeters: number
}

/** Ocean color — DESIGN.md verdigris #3B6B5A. RGB tuple. */
const OCEAN_COLOR = { r: 0x3b, g: 0x6b, b: 0x5a }

/** Cartographic color ramp for land. Elevation-normalized stops in [0, 1].
 * Tones picked from a paper-friendly atlas palette: warm-sand lowland →
 * pale-grass plain → forest → highland brown → snow-tinged peak. */
const LAND_RAMP: ReadonlyArray<{ t: number; r: number; g: number; b: number }> = [
  { t: 0.0, r: 0xd4, g: 0xb8, b: 0x96 }, // sand / coastal lowland
  { t: 0.15, r: 0xc4, g: 0xc4, b: 0x90 }, // grassland
  { t: 0.4, r: 0x88, g: 0x9d, b: 0x6e }, // forest
  { t: 0.7, r: 0x8c, g: 0x6f, b: 0x4f }, // highland brown
  { t: 1.0, r: 0xe8, g: 0xdc, b: 0xc4 }, // alpine / snowline
]

function rampSample(t: number): { r: number; g: number; b: number } {
  if (t <= LAND_RAMP[0]!.t) {
    return { r: LAND_RAMP[0]!.r, g: LAND_RAMP[0]!.g, b: LAND_RAMP[0]!.b }
  }
  for (let i = 1; i < LAND_RAMP.length; i++) {
    const b = LAND_RAMP[i]!
    if (t <= b.t) {
      const a = LAND_RAMP[i - 1]!
      const f = (t - a.t) / (b.t - a.t)
      return {
        r: Math.round(a.r + (b.r - a.r) * f),
        g: Math.round(a.g + (b.g - a.g) * f),
        b: Math.round(a.b + (b.b - a.b) * f),
      }
    }
  }
  const last = LAND_RAMP[LAND_RAMP.length - 1]!
  return { r: last.r, g: last.g, b: last.b }
}

/**
 * Compute a hillshade-rendered RGBA image from a 16-bit elevation heightmap.
 *
 * @param heightmap  Length must be width * height.
 * @param mask       Same length as heightmap. 1 = land, 0 = ocean/void.
 * @param width      Image width in pixels.
 * @param height     Image height in pixels.
 * @param params     Sun/scale parameters. Per-tile values come from tile.json.
 * @returns          RGBA buffer, length = width * height * 4.
 */
export function computeHillshade(
  heightmap: Uint16Array,
  mask: Uint8Array,
  width: number,
  height: number,
  params: HillshadeParams,
): Uint8Array {
  const { azimuthDeg, altitudeDeg, zFactor, cellSizeMeters } = params

  const azRad = (azimuthDeg * Math.PI) / 180
  const altRad = (altitudeDeg * Math.PI) / 180
  const sunX = Math.cos(altRad) * Math.sin(azRad)
  const sunY = Math.cos(altRad) * Math.cos(azRad)
  const sunZ = Math.sin(altRad)

  // Pre-pass: find land-elevation range for color-ramp normalization.
  // Single linear scan; ~10% of total cost. Skipped pixels (mask=0) ignored
  // so coastal lowlands don't get pulled toward the seafloor.
  let minH = 0xffff
  let maxH = 0
  let landSeen = false
  for (let i = 0; i < heightmap.length; i++) {
    if (mask[i] === 1) {
      const h = heightmap[i]!
      if (h < minH) minH = h
      if (h > maxH) maxH = h
      landSeen = true
    }
  }
  // Degenerate cases (all-ocean, single-elevation flat plane). Pin to a
  // valid range so the divide doesn't NaN; the ramp samples a single
  // mid-tone color in this case.
  if (!landSeen) {
    minH = 0
    maxH = 1
  }
  const range = Math.max(1, maxH - minH)

  const out = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y++) {
    const yp = y === 0 ? 0 : y - 1
    const yn = y === height - 1 ? height - 1 : y + 1
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const oi = idx * 4

      if (mask[idx] === 0) {
        out[oi] = OCEAN_COLOR.r
        out[oi + 1] = OCEAN_COLOR.g
        out[oi + 2] = OCEAN_COLOR.b
        out[oi + 3] = 255
        continue
      }

      const xp = x === 0 ? 0 : x - 1
      const xn = x === width - 1 ? width - 1 : x + 1

      // 3×3 neighborhood, replicate-padded at borders.
      const a = heightmap[yp * width + xp]!
      const b = heightmap[yp * width + x]!
      const c = heightmap[yp * width + xn]!
      const d = heightmap[y * width + xp]!
      const f = heightmap[y * width + xn]!
      const g = heightmap[yn * width + xp]!
      const h = heightmap[yn * width + x]!
      const i = heightmap[yn * width + xn]!

      // Horn's method gradients.
      const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * cellSizeMeters)
      const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * cellSizeMeters)

      // Surface normal, scaled by zFactor on the vertical.
      const nx = -dzdx * zFactor
      const ny = -dzdy * zFactor
      const nz = 1
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)

      let dot = (nx * sunX + ny * sunY + nz * sunZ) / nLen
      if (dot < 0) dot = 0
      if (dot > 1) dot = 1

      // Sample the cartographic ramp at this pixel's normalized elevation.
      const t = (heightmap[idx]! - minH) / range
      const base = rampSample(t)

      // Compress dot to [0.55, 1.0] so shadow slopes keep their hue rather
      // than going pitch-black. Without this, a flat ocean-coast valley
      // reads as a uniform sand-colored band; with it, relief still
      // shows but the color identity of the ramp survives.
      const lum = 0.55 + 0.45 * dot

      out[oi] = Math.min(255, Math.round(base.r * lum))
      out[oi + 1] = Math.min(255, Math.round(base.g * lum))
      out[oi + 2] = Math.min(255, Math.round(base.b * lum))
      out[oi + 3] = 255
    }
  }

  return out
}
