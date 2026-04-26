import { describe, expect, it } from 'vitest'
import { TILE_SOURCES, getTileSource } from './tile-source'

describe('TILE_SOURCES', () => {
  it('includes SRTM, ETOPO, and GEBCO as the MVP public-domain sources', () => {
    expect(TILE_SOURCES.map((s) => s.id)).toEqual(['srtm', 'etopo', 'gebco'])
  })

  it('every source has a license field set to "public-domain"', () => {
    for (const source of TILE_SOURCES) {
      expect(source.license).toBe('public-domain')
    }
  })
})

describe('getTileSource', () => {
  it('returns the source by id', () => {
    const source = getTileSource('srtm')
    expect(source?.id).toBe('srtm')
  })

  it('returns undefined for unknown ids', () => {
    expect(getTileSource('mars')).toBeUndefined()
  })
})
