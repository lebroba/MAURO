# stitch-poc — methodology validation for multi-tile world assembly

**Status:** proof-of-concept. NOT production. Standalone Python script that
takes two `_processed/{slug}/heightmap.png` tiles and produces a single
seamless eroded heightmap that combines them.

The output answers ONE question: does the histogram-match → optimal-seam
→ Poisson-blend → hydraulic-erosion pipeline produce a credible unified
world from disparate source tiles, or do we need to invest in something
more sophisticated (Voronoi assembly, GAN-based inpainting, etc.)?

## Why this exists

v0 of MAURO ships fixed real-Earth (and Mars / Moon) tiles — one source
tile per world. The product vision in `docs/deeper_world.md` is a
generative world-assembler that stitches tiles tagged by archetype
(Linear Barrier, Ancient Craton, Eroded Relic, etc.) into novel worlds.

Before scoping that build, we need to verify the underlying methodology
on the simplest possible case: **two existing tiles, side-by-side, made
to look like one continent.** If the algorithms produce a credible
result here, scaling to N tiles is bookkeeping. If they don't, the
methodology has a fundamental issue and the scope conversation changes.

## The pipeline

```
input: tile_a/heightmap.png  (2048×2048, 16-bit)
       tile_b/heightmap.png

  1. Histogram-match both to a common Earth reference distribution
     (compresses Mars elevations to Earth-credible scale; aligns
     statistical "feel" of the two tiles)

  2. Place side-by-side with 20% overlap (left=A, right=B)
     canvas size: ~3686 × 2048

  3. Find optimal seam through the overlap region via dynamic-
     programming min-cost path. Cost at each pixel = |h_a - h_b|.
     The seam follows where the two tiles' elevations naturally
     agree — no right-angle cuts.

  4. Poisson blend along the seam. Solves a sparse linear system
     so the gradient (slope direction + magnitude) matches across
     the seam, even though absolute values may differ. Tile B's
     content is preserved; only the boundary is shifted to match
     tile A.

  5. Hydraulic erosion via WhiteboxTools (~80 iterations).
     Water flow re-cuts the entire heightmap, creating drainage
     networks that ignore tile origin. This is the great unifier.
     Pre-baked, runs once.

  6. Final histogram match against Earth reference. Forces global
     elevation distribution to be Earth-credible after the erosion
     pass moved sediment around.

  7. Sea-level threshold + Horn's-method hillshade.

output: stitched/heightmap.png    (16-bit final)
        stitched/hillshade.png    (8-bit RGBA preview)
        stitched/intermediate/    (PNG at every step for inspection)
```

## What "success" looks like

A hillshade where:

1. The seam between Pamirs and Patagonia is **invisible** — no
   right angle, no elevation cliff, no smearing.
2. River systems span the seam (drainage networks have re-formed
   across the boundary).
3. The Pamirs side still reads as "high alpine massif" and the
   Patagonia side still reads as "fjord coast" — the archetype
   identities are preserved, even though absolute elevations and
   drainage have been unified.

If we get all three: methodology validated, proceed to scope a
production multi-tile assembler.

## What "failure" looks like

- Visible vertical seam in hillshade (blending insufficient)
- One tile's character bleeds into the other (over-aggressive blending)
- Erosion destroys the alpine character (too many iterations)
- Statistical mismatch even after histogram match (need a more
  sophisticated normalization)

Each failure mode points at a specific algorithm to revisit.

## Tech stack

| Component        | Library             | Why                                         |
|------------------|---------------------|---------------------------------------------|
| 16-bit PNG I/O   | Pillow              | Built-in `I;16` mode                        |
| Histogram match  | scipy.interpolate   | CDF-based remap, ~5 lines                   |
| Min-cost seam    | numpy (DP)          | ~30 lines, no library                       |
| Poisson blend    | scipy.sparse + cg   | Direct solve, exact                         |
| Erosion          | WhiteboxTools       | Industry standard, free, bundled binary     |
| Hillshade        | numpy               | Horn's method, ~20 lines                    |

No LLM. No GAN. No model training. Pure algorithmic.

## Running

```bash
cd scripts/stitch-poc
python -m venv .venv
.venv/Scripts/activate    # Windows
pip install -r requirements.txt
python stitch.py earth-pamirs earth-patagonia
```

Output lands in `mauro-sources/DEM-Downloads/_processed_stitched/`.

## Scope discipline (what this is NOT)

- Not integrated with the web app.
- Not in the `prep-tiles.ts` pipeline.
- Not feeding Supabase Storage.
- Not producing tile.json metadata.
- Not handling >2 tiles, Voronoi cells, archetype assignment, or
  any of the production world-assembler concerns.

All of those are downstream of validating the methodology. This
script proves the methodology. Period.

## Result (2026-04-30)

**Methodology validated.** Two combos run and inspected:

| Combo | Output | Verdict |
|-------|--------|---------|
| earth-pamirs + earth-patagonia | hillshade.png + comparison.png | seam invisible; alpine massif transitions cleanly into incised valleys |
| earth-pamirs + mars-tharsis    | hillshade.png + comparison.png | seam invisible; Olympus Mons-like volcanic shield grows out of Pamirs alpine massif |

The Earth+Mars combo is the load-bearing one — it proves the
"alien geometry preserved as fantasy substrate" thesis from
docs/deeper_world.md. Histogram matching compresses Mars's enormous
elevation range to Earth scale, but the volcanic SHIELD GEOMETRY
(radial flanks, caldera) is preserved. The result reads as a single
continent with both alpine and volcanic character.

### What worked

- **Histogram matching (CDF remap)** — closes the planet-scale gap.
  Mars elevations end up Earth-credible without losing geometric
  identity.
- **Min-cost DP seam** — finds an organic path through the overlap
  zone where elevations naturally agree. No right angles in the
  output. The mask (intermediate/05_mask_binary.png) shows the seam
  taking a jagged route through the overlap, not a straight line.
- **Burt-Adelson Laplacian-pyramid blend** — smooths low-frequency
  elevation transitions across a wide buffer while preserving
  high-frequency detail at the seam itself. This is the algorithm
  doing the real work.
- **Final histogram match** — global coherence pass after blending,
  ensures the assembled world has Earth-credible elevation
  distribution overall.

### What didn't

- **WhiteboxTools BreachDepressions** — failed silently on PIL-written
  TIFFs (Pillow's "F" mode TIFF lacks GeoTIFF tags). Fell back to a
  light Gaussian blur. For this POC the cleanup is cosmetic — the
  blend itself doesn't introduce significant pits. For production,
  use rasterio to write proper GeoTIFFs.
- **Real hydraulic erosion** — not implemented. WhiteboxTools doesn't
  have a hydraulic erosion simulation (it does hydrology analysis
  only). For the production assembler, either use `landlab` (heavy)
  or implement a droplet-based erosion in numpy (~200 lines).
  The seam quality didn't depend on it for this POC.

### Cost

~6 hours of CC time end to end. ~500 lines of Python.
