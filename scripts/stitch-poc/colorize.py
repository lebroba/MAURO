"""
colorize.py — apply atlas-style hypsometric tint to a stitched heightmap.

Separate stage from stitch.py: takes an existing _processed_stitched/{combo}/
heightmap.png and produces colored.png — the same terrain rendered with a
real-map color scheme instead of grayscale relief shading.

Pipeline:
  1. Load 16-bit heightmap.
  2. Choose a sea-level threshold (percentile-based, default bottom 25%).
  3. Build a hypsometric look-up table mapping elevation -> RGB:
       below sea  -> deep navy fading to coastal teal
       sea + 1    -> forest green
       lowlands   -> highland green
       hills      -> tan / ochre
       mountains  -> warm brown
       peaks      -> snow white
  4. Apply the LUT pixel-wise.
  5. Compute Horn's-method hillshade luminance (0..1).
  6. Multiply colored * hillshade — relief-shaded color, atlas-style.
  7. Save 8-bit RGB PNG.

This is the cheapest visual upgrade between "topographic survey" and
"map you'd find in a real atlas." No biomes, no labels, no rivers — just
elevation-driven color with relief shading.

Usage:
  python colorize.py earth-pamirs-x-mars-tharsis
  python colorize.py earth-pamirs-x-mars-tharsis-warped --sea-level-pct 30
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

REPO_ROOT = Path(__file__).resolve().parents[2]
STITCHED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed_stitched"


# ----------------------------------------------------------------------
# Hypsometric colormap — percentile-based
# ----------------------------------------------------------------------
#
# Color stops are placed by PERCENTILE of the heightmap distribution, not
# absolute elevation. This is how real atlases work: the color spread
# matches the data's actual range, regardless of how the heightmap's
# values happen to be packed. A tile clustered in [30000, 35000] gets
# the full color palette spread across that range, not stuck on one tone.
#
# Palette: National Geographic-style desaturated atlas register —
# rich-but-warm blues for water, greens / tans / warm browns / cream
# for land. No neon GIS-software colors.

# Below sea level: deep ocean blue -> shallow coastal blue
# t in [0, 1] = (rank - 0) / (sea_level_pct/100)
WATER_STOPS: list[tuple[float, tuple[int, int, int]]] = [
    (0.00, (16, 38, 70)),     # abyssal
    (0.45, (28, 72, 124)),    # mid ocean
    (0.85, (84, 142, 180)),   # continental shelf
    (1.00, (146, 188, 206)),  # immediate coastal
]

# Above sea level: forest -> highland -> tan -> warm brown -> snow
# t in [0, 1] = (rank - sea_level_pct/100) / (1 - sea_level_pct/100)
LAND_STOPS: list[tuple[float, tuple[int, int, int]]] = [
    (0.00, (102, 142, 88)),   # immediate coast / coastal forest
    (0.20, (148, 172, 104)),  # rolling green lowland
    (0.40, (188, 184, 122)),  # mixed grassland / pasture
    (0.58, (210, 184, 130)),  # warm tan foothill
    (0.74, (172, 134, 92)),   # warm brown mountain
    (0.88, (140, 110, 86)),   # high ridge
    (1.00, (242, 236, 224)),  # snow / peak
]


def colorize_by_percentile(
    heightmap: np.ndarray,
    sea_level_pct: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Map every pixel to a color by its rank in the heightmap distribution.

    Returns (colored_rgb_float32 in [0, 255], is_water_bool_mask).

    Computing per-pixel rank is O(N log N) (sort + searchsorted) but only
    runs once per render — well under a second on a 3700×2048 input.
    """
    h, w = heightmap.shape
    flat = heightmap.ravel()

    # Per-pixel percentile rank in [0, 1].
    sorted_flat = np.sort(flat)
    ranks = np.searchsorted(sorted_flat, flat, side="left").astype(np.float32)
    ranks /= max(1, flat.size - 1)

    sea_t = sea_level_pct / 100.0
    is_water_flat = ranks < sea_t

    colored = np.zeros((flat.size, 3), dtype=np.float32)

    # Water band
    if is_water_flat.any() and sea_t > 0:
        water_local_t = ranks[is_water_flat] / sea_t
        colored[is_water_flat] = _interp_stops(water_local_t, WATER_STOPS)

    # Land band
    is_land_flat = ~is_water_flat
    if is_land_flat.any() and sea_t < 1.0:
        land_local_t = (ranks[is_land_flat] - sea_t) / (1.0 - sea_t)
        colored[is_land_flat] = _interp_stops(land_local_t, LAND_STOPS)

    return colored.reshape(h, w, 3), is_water_flat.reshape(h, w)


def _interp_stops(
    t: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]
) -> np.ndarray:
    """Linear-interpolate per-channel through a sorted list of (t, rgb) stops.

    t: 1D array of values in [0, 1]. Returns shape (len(t), 3).
    """
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    rgb = np.array([s[1] for s in stops], dtype=np.float32)
    out = np.empty((t.size, 3), dtype=np.float32)
    for ch in range(3):
        out[:, ch] = np.interp(t, xs, rgb[:, ch])
    return out


# ----------------------------------------------------------------------
# Hillshade (Horn's method) — same as stitch.py's, returning a 0..1 mask
# ----------------------------------------------------------------------


def hillshade_luminance(
    heightmap: np.ndarray,
    sun_az_deg: float = 315.0,
    sun_alt_deg: float = 45.0,
    z_factor: float = 1.0,
    cell_size: float = 80.0,
) -> np.ndarray:
    """Return the hillshade as a (H, W) float32 array in [0, 1]."""
    z = heightmap.astype(np.float32) * z_factor
    p = np.pad(z, 1, mode="edge")
    dz_dx = (
        (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:])
        - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    ) / (8.0 * cell_size)
    dz_dy = (
        (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:])
        - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    ) / (8.0 * cell_size)
    slope = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    aspect = np.arctan2(dz_dy, -dz_dx)
    aspect = np.where(aspect < 0, aspect + 2 * np.pi, aspect)
    az = np.deg2rad(360.0 - sun_az_deg + 90.0)
    alt = np.deg2rad(sun_alt_deg)
    shaded = np.cos(alt) * np.sin(slope) * np.cos(az - aspect) + np.sin(alt) * np.cos(slope)
    return np.clip(shaded, 0.0, 1.0).astype(np.float32)


# ----------------------------------------------------------------------
# Pipeline driver
# ----------------------------------------------------------------------


def colorize(
    combo: str,
    sea_level_pct: float = 25.0,
    hillshade_strength: float = 0.55,
    coast_softness: float = 0.0,
) -> Path:
    combo_dir = STITCHED_DIR / combo
    height_path = combo_dir / "heightmap.png"
    if not height_path.exists():
        raise FileNotFoundError(f"No heightmap at {height_path}")

    print(f"[1/5] Loading {height_path}...")
    img = Image.open(height_path)
    if img.mode != "I;16":
        raise ValueError(f"{height_path} mode={img.mode}; expected I;16")
    h_arr = np.array(img, dtype=np.uint16)
    print(f"      shape={h_arr.shape}, range=[{h_arr.min()}, {h_arr.max()}]")

    print(
        f"[2/5] Percentile-based coloring (sea level at {sea_level_pct}th pct)..."
    )
    colored, is_water = colorize_by_percentile(h_arr, sea_level_pct)
    print(f"      water pixels: {is_water.sum() / is_water.size * 100:.1f}%")

    if coast_softness > 0:
        # Optional: softly blend the LUT discontinuity at sea level. Atlas
        # register actually wants a sharp coast, so default 0.
        for ch in range(3):
            colored[..., ch] = gaussian_filter(colored[..., ch], sigma=coast_softness)

    print("[3/5] Computing hillshade luminance...")
    hs = hillshade_luminance(h_arr)

    print("[4/5] Mixing color * hillshade (water stays flat)...")
    hs_mix = (1.0 - hillshade_strength) + hillshade_strength * hs
    # Real maps don't shade water — flat blue regardless of submarine slope.
    # Keep water at 1.0 (full color) and only apply the shading mix to land.
    hs_mix = np.where(is_water, 1.0, hs_mix)
    final = colored * hs_mix[..., None]
    final = np.clip(final, 0, 255).astype(np.uint8)

    print("[5/5] Saving colored.png...")
    out_path = combo_dir / "colored.png"
    Image.fromarray(final, mode="RGB").save(out_path)
    print(f"      ->{out_path}")
    return out_path


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "combo",
        help="Combo dir name, e.g. earth-pamirs-x-mars-tharsis or *-warped.",
    )
    p.add_argument(
        "--sea-level-pct",
        type=float,
        default=25.0,
        help="Percentile of heightmap distribution used as sea level (0-100). Default 25.",
    )
    p.add_argument(
        "--hillshade-strength",
        type=float,
        default=0.55,
        help="0 = no relief shading, 1 = full (very dark slopes). Default 0.55.",
    )
    p.add_argument(
        "--coast-softness",
        type=float,
        default=0.0,
        help="Gaussian sigma to soften the sea-level color discontinuity. 0 = sharp coast (default).",
    )
    args = p.parse_args()
    colorize(
        args.combo,
        sea_level_pct=args.sea_level_pct,
        hillshade_strength=args.hillshade_strength,
        coast_softness=args.coast_softness,
    )
    print("\n[done]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
