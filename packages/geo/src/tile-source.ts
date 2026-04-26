export interface TileSource {
  readonly id: 'srtm' | 'etopo' | 'gebco'
  readonly displayName: string
  readonly license: 'public-domain'
  readonly description: string
}

export const TILE_SOURCES: readonly TileSource[] = [
  {
    id: 'srtm',
    displayName: 'NASA SRTM (1 arc-second land)',
    license: 'public-domain',
    description: 'Land elevation, ~30 m resolution, near-global coverage.',
  },
  {
    id: 'etopo',
    displayName: 'NOAA ETOPO',
    license: 'public-domain',
    description: 'Combined land + ocean global relief, 1 arc-minute.',
  },
  {
    id: 'gebco',
    displayName: 'GEBCO Bathymetry',
    license: 'public-domain',
    description: 'Ocean depth grid, 15 arc-second.',
  },
]

export function getTileSource(id: string): TileSource | undefined {
  return TILE_SOURCES.find((source) => source.id === id)
}
