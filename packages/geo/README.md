# @mauro/geo

Real-Earth tile sources and raster operations (crop / composite / mutate) for MAURO.

## MVP sources

All MVP tile sources are public-domain:

- NASA SRTM (1 arc-second land)
- NOAA ETOPO (combined land + ocean relief)
- GEBCO (bathymetry)

## Layout

- `src/tile-source.ts` — registry of MVP public-domain sources
- `src/crop.ts` — crop a region polygon out of a tile (pending — uses `sharp`)
- `src/composite.ts` — composite multiple tile crops into one heightmap (pending)
- `src/wasm-gdal/` — geotiff reads where `sharp` is insufficient (pending)
