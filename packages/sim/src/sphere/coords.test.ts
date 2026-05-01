import { describe, expect, it } from 'vitest'
import {
  cartesianToLonLat,
  clampLat,
  ecefToLonLat,
  lonLatToCartesian,
  lonLatToECEF,
  lonLatToTilePixel,
  normalizeLon,
  tilePixelToLonLat,
  type Cartesian3,
  type ECEF,
  type LonLat,
  type TilePixel,
  type TileRegion,
} from './coords'

describe('LonLat ↔ unit-sphere Cartesian conversions', () => {
  it('maps (0, 0) to (1, 0, 0) — equator at prime meridian', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 0 })
    expect(c.x).toBeCloseTo(1, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (90, 0) to (0, 1, 0) — equator at +90° lon', () => {
    const c = lonLatToCartesian({ lonDeg: 90, latDeg: 0 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(1, 12)
    expect(c.z).toBeCloseTo(0, 12)
  })

  it('maps (0, 90) to (0, 0, 1) — north pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: 90 })
    expect(c.x).toBeCloseTo(0, 12)
    expect(c.y).toBeCloseTo(0, 12)
    expect(c.z).toBeCloseTo(1, 12)
  })

  it('maps (0, -90) to (0, 0, -1) — south pole', () => {
    const c = lonLatToCartesian({ lonDeg: 0, latDeg: -90 })
    expect(c.z).toBeCloseTo(-1, 12)
  })

  it('round-trips 1000 random points within 1e-12 degrees', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 32; j++) {
        const lonDeg = -180 + (360 * i) / 32 + 0.123
        const latDeg = -90 + (180 * (j + 0.5)) / 32
        const c = lonLatToCartesian({ lonDeg, latDeg })
        const back = cartesianToLonLat(c)
        maxLonErr = Math.max(maxLonErr, Math.abs(normalizeLon(back.lonDeg - lonDeg)))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.latDeg - latDeg))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-12)
    expect(maxLatErr).toBeLessThan(1e-12)
  })

  it('produces unit-length Cartesian vectors for any LonLat', () => {
    const samples: LonLat[] = [
      { lonDeg: 0, latDeg: 0 },
      { lonDeg: -73.5, latDeg: 40.7 },
      { lonDeg: 179.99, latDeg: 89.99 },
      { lonDeg: -179.99, latDeg: -89.99 },
    ]
    for (const ll of samples) {
      const c = lonLatToCartesian(ll)
      const lengthSq = c.x * c.x + c.y * c.y + c.z * c.z
      expect(lengthSq).toBeCloseTo(1, 12)
    }
  })
})

describe('normalizeLon', () => {
  it('returns input unchanged when already in [-180, 180)', () => {
    expect(normalizeLon(0)).toBe(0)
    expect(normalizeLon(-180)).toBe(-180)
    expect(normalizeLon(179.999)).toBe(179.999)
  })

  it('wraps +180 to -180 (canonical wrap point)', () => {
    expect(normalizeLon(180)).toBe(-180)
  })

  it('wraps values just past +180 back into range', () => {
    expect(normalizeLon(180.0001)).toBeCloseTo(-179.9999, 10)
  })

  it('wraps values just past -180 back into range', () => {
    expect(normalizeLon(-180.0001)).toBeCloseTo(179.9999, 10)
  })

  it('handles multi-revolution inputs', () => {
    expect(normalizeLon(720)).toBe(0)
    expect(normalizeLon(-540)).toBe(-180)
  })
})

describe('clampLat', () => {
  it('returns input unchanged when in [-90, 90]', () => {
    expect(clampLat(0)).toBe(0)
    expect(clampLat(90)).toBe(90)
    expect(clampLat(-90)).toBe(-90)
  })

  it('clamps values above +90', () => {
    expect(clampLat(90.001)).toBe(90)
    expect(clampLat(180)).toBe(90)
  })

  it('clamps values below -90', () => {
    expect(clampLat(-90.001)).toBe(-90)
  })
})

describe('LonLat ↔ ECEF (WGS84) conversions', () => {
  it('maps (0, 0) at h=0 to (A, 0, 0) — equator at prime meridian', () => {
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 0 })
    expect(e.x).toBeCloseTo(6378137.0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(0, 3)
  })

  it('maps (0, 90) at h=0 to (0, 0, B) — north pole', () => {
    // B = A(1-F) ≈ 6356752.3
    const e = lonLatToECEF({ lonDeg: 0, latDeg: 90 })
    expect(e.x).toBeCloseTo(0, 3)
    expect(e.y).toBeCloseTo(0, 3)
    expect(e.z).toBeCloseTo(6356752.3142, 2)
  })

  it('round-trips 100 lat-lon points + heights from -500 to +8848 m', () => {
    let maxLonErr = 0
    let maxLatErr = 0
    let maxHeightErr = 0
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        const lonDeg = -180 + (360 * i) / 10 + 0.7
        const latDeg = -85 + (170 * j) / 10
        const heightMeters = -500 + (8848 + 500) * (i + j) / 20
        const e = lonLatToECEF({ lonDeg, latDeg }, heightMeters)
        const back = ecefToLonLat(e)
        maxLonErr = Math.max(maxLonErr, Math.abs(back.lonLat.lonDeg - lonDeg))
        maxLatErr = Math.max(maxLatErr, Math.abs(back.lonLat.latDeg - latDeg))
        maxHeightErr = Math.max(maxHeightErr, Math.abs(back.heightMeters - heightMeters))
      }
    }
    expect(maxLonErr).toBeLessThan(1e-9)
    expect(maxLatErr).toBeLessThan(1e-9)
    expect(maxHeightErr).toBeLessThan(1e-3)
  })
})

// Synthetic 1° × 1° tile centered at (lon=10, lat=20), 1024×1024 pixels.
const TEST_REGION: TileRegion = {
  lat: 20,
  lon: 10,
  widthDeg: 1,
  heightDeg: 1,
}
const PIXEL_WIDTH = 1024
const PIXEL_HEIGHT = 1024

describe('LonLat ↔ TilePixel conversions', () => {
  it('maps the tile center (10, 20) to (512, 512)', () => {
    const px = lonLatToTilePixel(
      { lonDeg: 10, latDeg: 20 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px).not.toBeNull()
    expect(px!.px).toBeCloseTo(512, 6)
    expect(px!.py).toBeCloseTo(512, 6)
  })

  it('maps the NW corner (lon=9.5, lat=20.5) to (0, 0)', () => {
    // Convention: px=0 is west edge, py=0 is north edge (top of image).
    const px = lonLatToTilePixel(
      { lonDeg: 9.5, latDeg: 20.5 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px!.px).toBeCloseTo(0, 6)
    expect(px!.py).toBeCloseTo(0, 6)
  })

  it('maps the SE corner (lon=10.5, lat=19.5) to (1024, 1024)', () => {
    const px = lonLatToTilePixel(
      { lonDeg: 10.5, latDeg: 19.5 },
      TEST_REGION,
      PIXEL_WIDTH,
      PIXEL_HEIGHT,
    )
    expect(px!.px).toBeCloseTo(1024, 6)
    expect(px!.py).toBeCloseTo(1024, 6)
  })

  it('returns null for points outside the tile', () => {
    expect(
      lonLatToTilePixel(
        { lonDeg: 11, latDeg: 20 },
        TEST_REGION,
        PIXEL_WIDTH,
        PIXEL_HEIGHT,
      ),
    ).toBeNull()
    expect(
      lonLatToTilePixel(
        { lonDeg: 10, latDeg: 19 },
        TEST_REGION,
        PIXEL_WIDTH,
        PIXEL_HEIGHT,
      ),
    ).toBeNull()
  })

  it('round-trips arbitrary tile-pixel coordinates within 1e-9 degrees', () => {
    let maxErr = 0
    for (let py = 0; py <= 1024; py += 64) {
      for (let px = 0; px <= 1024; px += 64) {
        const ll = tilePixelToLonLat({ px, py }, TEST_REGION, PIXEL_WIDTH, PIXEL_HEIGHT)
        const back = lonLatToTilePixel(ll, TEST_REGION, PIXEL_WIDTH, PIXEL_HEIGHT)
        if (back === null) continue
        maxErr = Math.max(
          maxErr,
          Math.abs(back.px - px),
          Math.abs(back.py - py),
        )
      }
    }
    expect(maxErr).toBeLessThan(1e-9)
  })
})
