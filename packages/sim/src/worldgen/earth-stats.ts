// Earth-statistics constants for procgen worldgen. These are the centerpoint
// values the procgen function defaults to; randomness is bounded around them.
//
// Source values: Wikipedia "Earth", "Geography of Earth", "Continent". Numbers
// are calibrated to produce Earth-credible variance, not pixel-accurate Earth.

/** Earth's land:water ratio. ~149 / 510 million km² ≈ 0.29. */
export const LAND_COVERAGE_FRACTION = 0.29

/** Distribution over (continent count, weight). Weighted toward 5–6 — Earth
 *  has 5–7 continents depending on the convention used. */
export const CONTINENT_COUNT_DISTRIBUTION: ReadonlyArray<readonly [number, number]> = [
  [4, 0.15],
  [5, 0.40],
  [6, 0.35],
  [7, 0.10],
]

/** Fraction of land area in the Northern hemisphere. Earth is ~68% N. */
export const HEMISPHERIC_BIAS_NORTH = 0.68

/**
 * Probability density over 18 latitude bands of 10° each, ordered south-to-north:
 *   bands[0] = -90°..-80°, bands[1] = -80°..-70°, ..., bands[17] = +80°..+90°
 *
 * Calibrated from Earth's actual continent area distribution: most land sits
 * 30°–70°N with a secondary cluster 0°–30°S (Africa/South America/Australia)
 * and Antarctica's contribution at the south pole.
 *
 * Sums to 1.0 (verified by test).
 */
export const LATITUDINAL_WEIGHTING: ReadonlyArray<number> = [
  0.04, 0.02, 0.01, 0.01, 0.02, 0.03, // -90 to -30
  0.05, 0.07, 0.06, 0.04, // -30 to +10
  0.06, 0.10, 0.13, 0.13, // +10 to +50
  0.10, 0.07, 0.04, 0.02, // +50 to +90
]

/** Pareto α for continent size distribution. α=1.4 produces a long-tailed
 *  distribution where the largest continent is ~3× the median. */
export const SIZE_DISTRIBUTION_ALPHA = 1.4

/** Per-continent fractal dimension D for coastline complexity.
 *  1.05 = smooth (Africa-style); 1.5 = highly fractal (Norway fjords). */
export const COASTLINE_COMPLEXITY_RANGE: readonly [number, number] = [1.05, 1.5]
