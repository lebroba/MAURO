// MAURO hillshade — Horn's-method hillshade, public-domain algorithm.
//
// Reference: USGS GDAL gdaldem implements the same Horn 1981 method.
// We re-implement in TypeScript so we can run it inside Vercel functions
// (where shelling out to gdaldem isn't available) and inside the offline
// scripts/prep-tiles.ts pipeline. Same code path means the prep-time and
// render-time outputs are pixel-identical for an unchanged heightmap —
// asserted by Test #22 (prep ↔ render parity) in the eng-review test plan.
//
// Validated by the Day-1 spike (apps/web/src/app/api/render-spike/route.ts):
//   - 2048×2048 grayscale heightmap → ~200ms compute on Vercel x86 Node 24
//   - Output is plausible visually (verified via ?image=1 query mode)
//   - Memory peak ~130MB, well under Vercel Hobby's 1GB ceiling
//
// Algorithm:
//   1. For each pixel, compute slope (dz/dx, dz/dy) via Sobel-like
//      convolution against the 3×3 elevation neighborhood, scaled by
//      cellSizeMeters and zFactor.
//   2. Build a surface normal from those gradients.
//   3. Dot-product with the sun direction (from azimuth + altitude).
//   4. Clamp to [0, 1], multiply by 255 → 8-bit grayscale shade.
//   5. Composite: land pixels (mask=1) get the shade as RGB; ocean pixels
//      (mask=0) get a fixed verdigris (#3B6B5A) per DESIGN.md.
//   6. Edge pixels use replicate-padding for the convolution to avoid
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

      const shade = Math.round(dot * 255)
      out[oi] = shade
      out[oi + 1] = shade
      out[oi + 2] = shade
      out[oi + 3] = 255
    }
  }

  return out
}
