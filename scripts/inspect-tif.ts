// scripts/inspect-tif.ts
//
// Quick diagnostic for source DEM TIFFs — dumps width, height, bbox, data
// type, value range, and the GeoKeys / nodata tag. Used to figure out why
// prep-tiles produced flat-grey outputs for Mars and Norway.
//
// Run: pnpm --filter @mauro/scripts inspect <path-relative-to-mauro-sources/DEM-Downloads>
// Or:  tsx inspect-tif.ts <relative-path>

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromArrayBuffer } from 'geotiff'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = path.resolve(
  __dirname,
  '..',
  'mauro-sources',
  'DEM-Downloads',
)

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: tsx inspect-tif.ts <path-relative-to-DEM-Downloads/>')
    console.error('Example: tsx inspect-tif.ts Earth/SRTM/Norway/N62E007_COP30.tif')
    process.exit(1)
  }

  const abs = path.join(SOURCE_DIR, arg)
  const buf = await readFile(abs)
  const tiff = await fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  )

  const imageCount = await tiff.getImageCount()
  console.log(`\n=== ${arg} ===`)
  console.log(`File size: ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
  console.log(`Image count: ${imageCount}`)

  for (let i = 0; i < imageCount; i++) {
    const image = await tiff.getImage(i)
    console.log(`\n--- image[${i}] ---`)
    console.log(`width × height: ${image.getWidth()} × ${image.getHeight()}`)
    console.log(`samples per pixel: ${image.getSamplesPerPixel()}`)
    console.log(`bits per sample: ${image.getBitsPerSample()}`)
    console.log(`sample format: ${image.getSampleFormat()}`)
    const bbox = image.getBoundingBox()
    console.log(`bbox [west, south, east, north]: ${JSON.stringify(bbox)}`)
    const resolution = image.getResolution()
    console.log(`resolution (units/px): ${JSON.stringify(resolution)}`)

    const fileDirectory = image.fileDirectory as Record<string, unknown>
    const nodata = (fileDirectory.GDAL_NODATA as string | undefined)?.replace(
      /\0/g,
      '',
    )
    console.log(`GDAL_NODATA: ${nodata ?? '(not set)'}`)
    const projection = fileDirectory.ProjectionGeoKey
    console.log(`ProjectionGeoKey: ${projection ?? '(not set)'}`)
    const geoKeys = (image.geoKeys ?? {}) as Record<string, unknown>
    console.log(`GeographicTypeGeoKey: ${geoKeys.GeographicTypeGeoKey ?? '(not set)'}`)
    console.log(`ProjectedCSTypeGeoKey: ${geoKeys.ProjectedCSTypeGeoKey ?? '(not set)'}`)
    console.log(`GeogAngularUnitsGeoKey: ${geoKeys.GeogAngularUnitsGeoKey ?? '(not set)'}`)
    console.log(`ProjLinearUnitsGeoKey: ${geoKeys.ProjLinearUnitsGeoKey ?? '(not set)'}`)

    // Sample a small window of values to understand the data range.
    // Read just a 200×200 window from the center to keep it fast on huge tifs.
    const w = image.getWidth()
    const h = image.getHeight()
    const sampleW = Math.min(200, w)
    const sampleH = Math.min(200, h)
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)
    const window = [
      Math.max(0, cx - sampleW / 2),
      Math.max(0, cy - sampleH / 2),
      Math.min(w, cx + sampleW / 2),
      Math.min(h, cy + sampleH / 2),
    ]
    const rasters = await image.readRasters({ window, interleave: false })
    const data = rasters[0] as
      | Int16Array
      | Int32Array
      | Uint16Array
      | Float32Array
      | Float64Array
    let min = Infinity
    let max = -Infinity
    let sum = 0
    let nonZero = 0
    for (let j = 0; j < data.length; j++) {
      const v = data[j]!
      if (v < min) min = v
      if (v > max) max = v
      sum += v
      if (v !== 0) nonZero++
    }
    console.log(`data type: ${data.constructor.name}`)
    console.log(
      `center ${sampleW}×${sampleH} window: min=${min}, max=${max}, mean=${(sum / data.length).toFixed(1)}, nonzero=${nonZero}/${data.length}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
