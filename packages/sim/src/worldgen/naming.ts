import type { Xoshiro256 } from '../rng/xoshiro256'

/**
 * Greek-alphabet placeholder names. The product team has already accepted
 * "placeholder" as the v1 quality bar — narrative-flavored names land in
 * a future iteration.
 */
const NAME_POOL: ReadonlyArray<string> = [
  'Continent Alpha',
  'Continent Beta',
  'Continent Gamma',
  'Continent Delta',
  'Continent Epsilon',
  'Continent Zeta',
  'Continent Eta',
  'Continent Theta',
  'Continent Iota',
  'Continent Kappa',
  'Continent Lambda',
  'Continent Mu',
  'Continent Nu',
  'Continent Xi',
  'Continent Omicron',
  'Continent Pi',
  'Continent Rho',
  'Continent Sigma',
  'Continent Tau',
  'Continent Upsilon',
  'Continent Phi',
  'Continent Chi',
  'Continent Psi',
  'Continent Omega',
]

/**
 * Cartographic-intelligence palette — same as NationColorPicker's swatches,
 * with verdigris (#3B6B5A) excluded because it's reserved as the ocean fill.
 */
const COLOR_PALETTE: ReadonlyArray<string> = [
  '#B8442C', // stamp red
  '#9C3848', // crimson
  '#3B4D6B', // indigo
  '#C77E2D', // saffron
  '#5B3A4F', // plum
  '#7C8A66', // sage
  '#7A5A2F', // bronze
  '#4A4D52', // slate
]

function nextU64Index(rng: Xoshiro256, modulus: number): number {
  return Number(rng.next() % BigInt(modulus))
}

export function generatePlaceholderName(rng: Xoshiro256): string {
  return NAME_POOL[nextU64Index(rng, NAME_POOL.length)]!
}

export function pickContinentColor(rng: Xoshiro256): string {
  return COLOR_PALETTE[nextU64Index(rng, COLOR_PALETTE.length)]!
}
