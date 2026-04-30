"""
stitch.py — methodology validation for multi-tile world assembly.

Takes two _processed/{slug}/heightmap.png inputs and produces a single
seamless heightmap + hillshade that combines them. See README.md for
the why.

Pipeline:
  1. Load both 16-bit grayscale PNGs.
  2. Histogram-match B → A so the two distributions agree before stitching.
  3. Place side-by-side on a single canvas with 20% horizontal overlap.
  4. Compute a min-cost seam through the overlap zone (DP min-cost path,
     where cost = |h_a - h_b| at each pixel).
  5. Build a binary seam mask (1 left of seam, 0 right of seam).
  6. Laplacian-pyramid blend along the seam — low frequencies blend across
     a wide buffer (smooth elevation transition); high frequencies blend
     at the sharp seam (preserves local terrain detail).
  7. WhiteboxTools BreachDepressions to repair any "puddles" introduced by
     the blend (real hydrology cleanup; not full erosion simulation).
  8. Final histogram-match against the original A reference for global
     coherence.
  9. Sea-level threshold + Horn's-method hillshade for visual verdict.

Usage:
  python stitch.py earth-pamirs earth-patagonia

Outputs land in mauro-sources/DEM-Downloads/_processed_stitched/
{slug-a}-x-{slug-b}/ and include intermediate diagnostics for every
step so you can see exactly where the pipeline succeeds or fails.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, zoom

# WhiteboxTools is heavy (downloads a binary on first use) — import lazily
# so --help works without it.


# ----------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed"
OUTPUT_ROOT = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed_stitched"


# ----------------------------------------------------------------------
# I/O — 16-bit grayscale PNG round-trip
# ----------------------------------------------------------------------


def load_heightmap(slug: str) -> np.ndarray:
    """Load _processed/{slug}/heightmap.png as a 2D uint16 array."""
    path = PROCESSED_DIR / slug / "heightmap.png"
    if not path.exists():
        raise FileNotFoundError(f"No heightmap for slug={slug}: {path}")
    img = Image.open(path)
    if img.mode != "I;16":
        raise ValueError(f"{path} mode={img.mode}; expected I;16 (16-bit grayscale)")
    arr = np.array(img, dtype=np.uint16)
    if arr.ndim != 2:
        raise ValueError(f"{path} shape={arr.shape}; expected 2D")
    return arr


def save_heightmap(arr: np.ndarray, path: Path) -> None:
    """Save a uint16 2D array as a 16-bit grayscale PNG."""
    if arr.dtype != np.uint16:
        arr = np.clip(arr, 0, 65535).astype(np.uint16)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, mode="I;16").save(path)


def save_hillshade(rgba: np.ndarray, path: Path) -> None:
    """Save an (H,W,4) uint8 array as a PNG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(path)


# ----------------------------------------------------------------------
# Step 2 — Histogram matching
# ----------------------------------------------------------------------


def histogram_match(source: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Remap `source` so its CDF matches `reference`'s.

    Both arrays are uint16. Output dtype matches input. The transform is:
    for each value v in source, find the percentile p of v in source's
    distribution, then return the value at percentile p in reference.
    """
    src_flat = source.ravel()
    ref_flat = reference.ravel()
    src_values, src_inv, src_counts = np.unique(
        src_flat, return_inverse=True, return_counts=True
    )
    ref_values, ref_counts = np.unique(ref_flat, return_counts=True)

    src_cdf = np.cumsum(src_counts).astype(np.float64) / src_flat.size
    ref_cdf = np.cumsum(ref_counts).astype(np.float64) / ref_flat.size

    # For each unique source value, find the reference value with the same
    # percentile. np.interp gives us the inverse-CDF lookup in one shot.
    interp_values = np.interp(src_cdf, ref_cdf, ref_values)
    remapped = interp_values[src_inv].reshape(source.shape)
    return np.clip(remapped, 0, 65535).astype(np.uint16)


# ----------------------------------------------------------------------
# Step 3 — Canvas placement
# ----------------------------------------------------------------------


def place_side_by_side(
    h_a: np.ndarray, h_b: np.ndarray, overlap: int
) -> tuple[np.ndarray, np.ndarray, int, int]:
    """Place A on the left, B on the right with `overlap` columns of overlap.

    Returns (canvas_a_full, canvas_b_full, overlap_x_start, overlap_x_end).
    Both canvases have the full output width — outside the overlap, only
    one of them is non-zero. We keep both as full-canvas arrays so the
    pyramid blender can pull from either.
    """
    h, w = h_a.shape
    if h_b.shape != h_a.shape:
        raise ValueError(f"Tile shape mismatch: A={h_a.shape}, B={h_b.shape}")
    canvas_w = w * 2 - overlap
    canvas_a = np.zeros((h, canvas_w), dtype=np.uint16)
    canvas_b = np.zeros((h, canvas_w), dtype=np.uint16)
    canvas_a[:, :w] = h_a
    canvas_b[:, canvas_w - w :] = h_b
    overlap_start = canvas_w - w  # = w - overlap
    overlap_end = w  # exclusive
    return canvas_a, canvas_b, overlap_start, overlap_end


# ----------------------------------------------------------------------
# Step 4 — Min-cost seam (dynamic programming)
# ----------------------------------------------------------------------


def min_cost_seam(cost: np.ndarray) -> np.ndarray:
    """Find the minimum-cost vertical seam through `cost` (shape HxW).

    Returns a 1D array of length H giving the seam column for each row.
    The seam goes top-to-bottom. Each step can move down-left, down, or
    down-right (8-connected vertical paths).
    """
    h, w = cost.shape
    cost = cost.astype(np.float64)
    # cumulative cost
    cum = np.zeros_like(cost)
    cum[0] = cost[0]
    # backpointer: 0 = same column, -1 = left, +1 = right
    back = np.zeros_like(cost, dtype=np.int8)
    for y in range(1, h):
        # build candidate predecessors
        prev = cum[y - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        stacked = np.stack([left, prev, right])  # (3, w)
        argmin = np.argmin(stacked, axis=0)  # 0=left, 1=same, 2=right
        cum[y] = cost[y] + np.choose(argmin, stacked)
        back[y] = argmin - 1  # -1=left, 0=same, +1=right
    # backtrack from the bottom row
    seam = np.zeros(h, dtype=np.int32)
    seam[-1] = int(np.argmin(cum[-1]))
    for y in range(h - 1, 0, -1):
        seam[y - 1] = seam[y] + back[y, seam[y]]
        seam[y - 1] = max(0, min(w - 1, seam[y - 1]))
    return seam


def build_seam_mask(
    canvas_w: int, canvas_h: int, overlap_start: int, seam: np.ndarray
) -> np.ndarray:
    """Build a binary mask (float32 0..1) where 1 = use tile A, 0 = use tile B.

    Outside the overlap the mask is hard 0 or 1. Inside the overlap, the
    mask is 1 left of the seam column and 0 right of it. The pyramid
    blender will softly feather this binary mask at each frequency band.
    """
    mask = np.zeros((canvas_h, canvas_w), dtype=np.float32)
    # Outside the overlap on the left: A wins (mask = 1).
    mask[:, :overlap_start] = 1.0
    # Inside the overlap: 1 to the left of the per-row seam column, 0 to
    # the right. seam[y] is in overlap-local coordinates, so add overlap_start
    # to get a canvas column.
    for y in range(canvas_h):
        seam_x = overlap_start + int(seam[y])
        mask[y, overlap_start:seam_x] = 1.0
        # mask[y, seam_x:] stays 0 (B wins)
    return mask


# ----------------------------------------------------------------------
# Step 6 — Laplacian-pyramid (multi-band) blending
# ----------------------------------------------------------------------


def gaussian_pyramid(img: np.ndarray, levels: int) -> list[np.ndarray]:
    """Standard Gaussian pyramid via repeated blur + downsample by 2."""
    pyr = [img.astype(np.float32)]
    cur = img.astype(np.float32)
    for _ in range(levels - 1):
        cur = gaussian_filter(cur, sigma=1.0)
        cur = cur[::2, ::2]
        pyr.append(cur.copy())
    return pyr


def laplacian_pyramid(img: np.ndarray, levels: int) -> list[np.ndarray]:
    """Standard Laplacian pyramid: each level is the difference between the
    Gaussian pyramid at that level and the upsampled-from-next level."""
    g_pyr = gaussian_pyramid(img, levels)
    l_pyr: list[np.ndarray] = []
    for i in range(levels - 1):
        # Upsample g_pyr[i+1] back to g_pyr[i]'s shape and subtract.
        up = upsample_to(g_pyr[i + 1], g_pyr[i].shape)
        l_pyr.append(g_pyr[i] - up)
    l_pyr.append(g_pyr[-1])  # coarsest level kept as-is
    return l_pyr


def upsample_to(img: np.ndarray, target_shape: tuple[int, int]) -> np.ndarray:
    """Upsample to an exact target_shape via bilinear zoom + smoothing.

    Has to handle non-power-of-2 dimensions because the canvas can be any
    width (e.g. 3687 = 2048+2048-409). scipy.ndimage.zoom with order=1
    gives bilinear interpolation to an exact target via per-axis factors,
    then we lightly Gaussian-blur the result to match the visual character
    of a "blur after upsample" pyramid step.
    """
    if img.shape == target_shape:
        return img.astype(np.float32)
    fy = target_shape[0] / img.shape[0]
    fx = target_shape[1] / img.shape[1]
    out = zoom(img.astype(np.float32), (fy, fx), order=1, prefilter=False)
    # zoom can be off by one pixel from rounding; crop or pad to exact.
    if out.shape != target_shape:
        oh = min(out.shape[0], target_shape[0])
        ow = min(out.shape[1], target_shape[1])
        fixed = np.zeros(target_shape, dtype=np.float32)
        fixed[:oh, :ow] = out[:oh, :ow]
        out = fixed
    return gaussian_filter(out, sigma=1.0)


def collapse_pyramid(l_pyr: list[np.ndarray]) -> np.ndarray:
    """Collapse a Laplacian pyramid back into a single image."""
    cur = l_pyr[-1]
    for lvl in range(len(l_pyr) - 2, -1, -1):
        up = upsample_to(cur, l_pyr[lvl].shape)
        cur = up + l_pyr[lvl]
    return cur


def multi_band_blend(
    img_a: np.ndarray, img_b: np.ndarray, mask: np.ndarray, levels: int = 5
) -> np.ndarray:
    """Burt & Adelson 1983 multi-band image blending.

    Builds Laplacian pyramids of A and B, a Gaussian pyramid of the mask,
    then blends each level via mask * a_level + (1-mask) * b_level. The
    Gaussian-blurred mask at each level naturally widens the blend buffer
    for low-frequency bands and narrows it for high-frequency bands —
    smooth elevation transitions across a wide region; sharp local
    detail preserved at the seam.
    """
    la = laplacian_pyramid(img_a, levels)
    lb = laplacian_pyramid(img_b, levels)
    gm = gaussian_pyramid(mask, levels)
    blended = []
    for level in range(levels):
        m = gm[level]
        blended.append(m * la[level] + (1.0 - m) * lb[level])
    out = collapse_pyramid(blended)
    return out


# ----------------------------------------------------------------------
# Step 7 — WhiteboxTools cleanup (BreachDepressions)
# ----------------------------------------------------------------------


def breach_depressions(heightmap: np.ndarray) -> np.ndarray:
    """Run WhiteboxTools BreachDepressions on a heightmap.

    Cleans up artificial pits/puddles introduced by the blending pass.
    Hydraulic erosion proper would be a separate pass; this is just the
    'fix invalid drainage' cleanup. Real erosion simulation is parked
    until the post-POC build.

    BreachDepressions wants a GeoTIFF input. We write a temp .tif, run
    the tool, read the result back. Floating-point heightmap throughout
    so we don't lose precision.
    """
    import whitebox

    wbt = whitebox.WhiteboxTools()
    wbt.set_verbose_mode(False)
    work_dir = Path(tempfile.mkdtemp(prefix="stitch_wbt_"))
    in_path = work_dir / "in.tif"
    out_path = work_dir / "out.tif"
    try:
        # Write input as a 32-bit float GeoTIFF (no georeferencing — WBT
        # tolerates this for tools that don't need projection).
        save_geotiff_float(heightmap.astype(np.float32), in_path)
        ret = wbt.breach_depressions(str(in_path), str(out_path))
        if ret != 0:
            raise RuntimeError(f"WBT breach_depressions returned {ret}")
        out = load_geotiff_float(out_path)
        # WBT may pad or shape differently — ensure same shape.
        if out.shape != heightmap.shape:
            out = out[: heightmap.shape[0], : heightmap.shape[1]]
        return out
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def save_geotiff_float(arr: np.ndarray, path: Path) -> None:
    """Write a 2D float32 array as a minimal GeoTIFF that WBT will accept."""
    from PIL import Image as PILImage

    # WBT accepts 32-bit float TIFFs. Pillow can write these.
    PILImage.fromarray(arr.astype(np.float32), mode="F").save(str(path), format="TIFF")


def load_geotiff_float(path: Path) -> np.ndarray:
    """Read a 32-bit float TIFF as a 2D float32 array."""
    from PIL import Image as PILImage

    img = PILImage.open(str(path))
    arr = np.array(img, dtype=np.float32)
    return arr


# ----------------------------------------------------------------------
# Step 9 — Hillshade (Horn's method)
# ----------------------------------------------------------------------


def hillshade_horn(
    heightmap: np.ndarray,
    sun_az_deg: float = 315.0,
    sun_alt_deg: float = 45.0,
    z_factor: float = 1.0,
    cell_size: float = 80.0,
) -> np.ndarray:
    """Standard Horn's-method hillshade. Returns RGBA uint8.

    Same algorithm as the production geo package, reimplemented in numpy
    here so the POC runs without crossing a TS<->PY boundary.
    """
    h, w = heightmap.shape
    z = heightmap.astype(np.float32) * z_factor
    # Sobel-like 3x3 gradients (Horn's formulation)
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
    # Aspect: 0 = north, increasing CW. Numpy atan2 gives -π..π; remap.
    aspect = np.arctan2(dz_dy, -dz_dx)
    aspect = np.where(aspect < 0, aspect + 2 * np.pi, aspect)

    az = np.deg2rad(360.0 - sun_az_deg + 90.0)
    alt = np.deg2rad(sun_alt_deg)
    shaded = np.cos(alt) * np.sin(slope) * np.cos(az - aspect) + np.sin(alt) * np.cos(slope)
    shaded = np.clip(shaded, 0.0, 1.0)
    # Tint slightly warm (matches the production aesthetic).
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0] = (shaded * 235).astype(np.uint8)  # R
    out[..., 1] = (shaded * 225).astype(np.uint8)  # G
    out[..., 2] = (shaded * 200).astype(np.uint8)  # B
    out[..., 3] = 255
    return out


# ----------------------------------------------------------------------
# Shape modification — random rigid transforms + fractal domain warping
# ----------------------------------------------------------------------
#
# Real-Earth tiles have recognizable coastlines. Patagonia looks like
# Patagonia; the Pamirs read as the Pamirs. To break that recognition
# without losing geological character, two cheap-but-effective layers:
#
#   1. Per-tile rigid transforms (mirror, 90° rotate). Lossless. Eliminates
#      the strongest "I know that coast" signal at zero data cost.
#   2. Fractal domain warping on the final stitched canvas. Sample the
#      heightmap at warped coordinates, where the warp field is multi-octave
#      smooth noise. Coastlines bend organically; the warp crosses the
#      seam so it distorts both halves coherently and hides the seam even
#      further.
#
# Combine the two: tile A might be flipped horizontally, tile B might be
# rotated 270°, then the entire blended canvas warped by ~60-pixel
# amplitude noise. The output reads as a continent that exists nowhere.


def random_rigid_transform(
    heightmap: np.ndarray, mirror: bool, rotate_quarters: int
) -> np.ndarray:
    """Apply mirror + 90° rotation. Lossless on square tiles.

    rotate_quarters: 0/1/2/3 — number of CCW 90° rotations. For a square
    2048×2048 input the output is still 2048×2048.
    """
    out = heightmap
    if mirror:
        out = np.fliplr(out)
    if rotate_quarters:
        out = np.rot90(out, k=rotate_quarters % 4)
    return np.ascontiguousarray(out)


def fractal_noise_2d(shape: tuple[int, int], octaves: int, seed: int) -> np.ndarray:
    """Multi-octave smooth noise via stacked Gaussian-filtered random fields.

    Returns float32 array roughly normalized to [-1, 1]. Lower octaves
    contribute large smooth features; higher octaves add finer detail.
    No external noise library — Gaussian-filtered white noise gets you
    most of Perlin's perceptual character at a fraction of the deps.
    """
    rng = np.random.default_rng(seed)
    h, w = shape
    out = np.zeros((h, w), dtype=np.float32)
    amp = 1.0
    # sigma decreases per octave: octave 0 has the largest features
    # (sigma ~ 64 for 2k tiles), octave N has the finest.
    base_sigma = max(h, w) / 32.0
    for octave in range(octaves):
        sigma = max(1.0, base_sigma / (2**octave))
        noise = rng.standard_normal((h, w)).astype(np.float32)
        smoothed = gaussian_filter(noise, sigma=sigma)
        out += smoothed * amp
        amp *= 0.5
    peak = np.abs(out).max()
    if peak > 0:
        out /= peak
    return out


def domain_warp(
    heightmap: np.ndarray,
    amp_pixels: float,
    octaves: int = 4,
    seed: int = 42,
) -> np.ndarray:
    """Apply 2D fractal domain warping.

    For each output pixel (y, x), sample input at (y + dy(y,x), x + dx(y,x))
    where dy and dx are independent fractal noise fields scaled by
    amp_pixels. Bilinear interpolation via scipy.ndimage.map_coordinates.

    amp_pixels: maximum displacement magnitude. ~30 = subtle, ~80 = strong,
    ~150 = aggressive (coastlines may break apart). Default in the CLI is
    moderate so the result is recognizable as the same world but not as
    the same continent shape.
    """
    h, w = heightmap.shape
    dy_field = fractal_noise_2d((h, w), octaves=octaves, seed=seed) * amp_pixels
    dx_field = fractal_noise_2d((h, w), octaves=octaves, seed=seed + 17) * amp_pixels
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    coords = np.stack([yy + dy_field, xx + dx_field])
    warped = map_coordinates(
        heightmap.astype(np.float32),
        coords,
        order=1,  # bilinear
        mode="reflect",
    )
    return np.clip(warped, 0, 65535).astype(np.uint16)


# ----------------------------------------------------------------------
# Pipeline driver
# ----------------------------------------------------------------------


def run_pipeline(
    slug_a: str,
    slug_b: str,
    overlap_pct: float = 0.20,
    levels: int = 6,
    *,
    mirror_a: bool = False,
    mirror_b: bool = False,
    rotate_a: int = 0,
    rotate_b: int = 0,
    warp_amp: float = 0.0,
    warp_octaves: int = 4,
    warp_seed: int = 42,
    out_suffix: str = "",
) -> Path:
    combo = f"{slug_a}-x-{slug_b}"
    if out_suffix:
        combo = f"{combo}-{out_suffix}"
    out_dir = OUTPUT_ROOT / combo
    intermediates = out_dir / "intermediate"
    intermediates.mkdir(parents=True, exist_ok=True)

    print(f"[1/9] Loading {slug_a} + {slug_b}...")
    h_a = load_heightmap(slug_a)
    h_b_raw = load_heightmap(slug_b)
    if mirror_a or rotate_a:
        h_a = random_rigid_transform(h_a, mirror=mirror_a, rotate_quarters=rotate_a)
        print(f"      tile A: mirror={mirror_a}, rot90x{rotate_a}")
    if mirror_b or rotate_b:
        h_b_raw = random_rigid_transform(
            h_b_raw, mirror=mirror_b, rotate_quarters=rotate_b
        )
        print(f"      tile B: mirror={mirror_b}, rot90x{rotate_b}")
    h, w = h_a.shape
    print(f"      shape={h}x{w}, dtype={h_a.dtype}")

    print(f"[2/9] Histogram-matching {slug_b} -> {slug_a}'s distribution...")
    h_b = histogram_match(h_b_raw, h_a)
    save_heightmap(h_b_raw, intermediates / "01_b_raw.png")
    save_heightmap(h_b, intermediates / "02_b_histmatched.png")

    print(f"[3/9] Placing side-by-side with {int(overlap_pct*100)}% overlap...")
    overlap = int(w * overlap_pct)
    canvas_a, canvas_b, overlap_start, overlap_end = place_side_by_side(h_a, h_b, overlap)
    canvas_w = canvas_a.shape[1]
    print(
        f"      canvas={canvas_w}x{h}, overlap=cols [{overlap_start}, {overlap_end}) "
        f"= {overlap} px wide"
    )
    save_heightmap(canvas_a, intermediates / "03_canvas_a.png")
    save_heightmap(canvas_b, intermediates / "04_canvas_b.png")

    print("[4/9] Computing min-cost seam through overlap...")
    overlap_a = canvas_a[:, overlap_start:overlap_end]
    overlap_b = canvas_b[:, overlap_start:overlap_end]
    cost = np.abs(overlap_a.astype(np.int32) - overlap_b.astype(np.int32))
    seam = min_cost_seam(cost)
    print(f"      seam range: x in [{int(seam.min())}, {int(seam.max())}] (overlap-local)")

    print("[5/9] Building seam mask...")
    mask = build_seam_mask(canvas_w, h, overlap_start, seam)
    # Diagnostic visualization — multiply by 65535 for 16-bit save.
    save_heightmap((mask * 65535).astype(np.uint16), intermediates / "05_mask_binary.png")

    print(f"[6/9] Multi-band blending ({levels} pyramid levels)...")
    # Convert to float32 for the pyramid math.
    a_f = canvas_a.astype(np.float32)
    b_f = canvas_b.astype(np.float32)
    blended_f = multi_band_blend(a_f, b_f, mask, levels=levels)
    blended = np.clip(blended_f, 0, 65535).astype(np.uint16)
    save_heightmap(blended, intermediates / "06_blended.png")

    print("[7/9] Running WhiteboxTools BreachDepressions cleanup...")
    try:
        cleaned_f = breach_depressions(blended)
        cleaned = np.clip(cleaned_f, 0, 65535).astype(np.uint16)
        save_heightmap(cleaned, intermediates / "07_breached.png")
    except Exception as e:
        print(f"      ! WBT failed ({e}); falling back to gaussian_filter cleanup.")
        cleaned = gaussian_filter(blended.astype(np.float32), sigma=0.5)
        cleaned = np.clip(cleaned, 0, 65535).astype(np.uint16)
        save_heightmap(cleaned, intermediates / "07_breached_fallback.png")

    print(f"[8/9] Final histogram-match against {slug_a} reference...")
    final = histogram_match(cleaned, h_a)
    save_heightmap(final, intermediates / "08_final_pre_warp.png")

    if warp_amp > 0:
        print(
            f"      domain-warping (amp={warp_amp}px, octaves={warp_octaves}, seed={warp_seed})..."
        )
        final = domain_warp(
            final, amp_pixels=warp_amp, octaves=warp_octaves, seed=warp_seed
        )
        save_heightmap(final, intermediates / "09_warped.png")

    save_heightmap(final, out_dir / "heightmap.png")
    print(f"      ->{out_dir / 'heightmap.png'}")

    print("[9/9] Rendering hillshade...")
    rgba = hillshade_horn(
        final, sun_az_deg=315.0, sun_alt_deg=45.0, z_factor=1.0, cell_size=80.0
    )
    save_hillshade(rgba, out_dir / "hillshade.png")
    print(f"      ->{out_dir / 'hillshade.png'}")

    # Diagnostic: hillshade of the un-cleaned blend, so we can see what
    # BreachDepressions actually changed.
    rgba_pre = hillshade_horn(blended)
    save_hillshade(rgba_pre, intermediates / "08_hillshade_pre_cleanup.png")

    return out_dir


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("slug_a", help="Left tile slug (e.g. earth-pamirs)")
    parser.add_argument("slug_b", help="Right tile slug (e.g. earth-patagonia)")
    parser.add_argument(
        "--overlap",
        type=float,
        default=0.20,
        help="Overlap fraction (0..1) between the two tiles. Default 0.20.",
    )
    parser.add_argument(
        "--levels",
        type=int,
        default=6,
        help="Pyramid levels for multi-band blend. Default 6.",
    )
    # Shape-modification flags. Default off so the unwarped pipeline runs
    # unchanged when these aren't passed.
    parser.add_argument(
        "--mirror-a", action="store_true", help="Mirror tile A horizontally before stitching."
    )
    parser.add_argument(
        "--mirror-b", action="store_true", help="Mirror tile B horizontally before stitching."
    )
    parser.add_argument(
        "--rotate-a",
        type=int,
        default=0,
        choices=[0, 1, 2, 3],
        help="Rotate tile A by N*90° CCW before stitching.",
    )
    parser.add_argument(
        "--rotate-b",
        type=int,
        default=0,
        choices=[0, 1, 2, 3],
        help="Rotate tile B by N*90° CCW before stitching.",
    )
    parser.add_argument(
        "--warp-amp",
        type=float,
        default=0.0,
        help="Domain-warp amplitude in pixels. 0 = off (default). 30 subtle, 80 strong, 150 aggressive.",
    )
    parser.add_argument(
        "--warp-octaves",
        type=int,
        default=4,
        help="Octaves for the domain-warp noise field. Default 4.",
    )
    parser.add_argument(
        "--warp-seed", type=int, default=42, help="Seed for warp noise. Default 42."
    )
    parser.add_argument(
        "--out-suffix",
        default="",
        help="Suffix appended to output dir name (e.g. 'warped'). Default empty.",
    )
    args = parser.parse_args()
    out_dir = run_pipeline(
        args.slug_a,
        args.slug_b,
        overlap_pct=args.overlap,
        levels=args.levels,
        mirror_a=args.mirror_a,
        mirror_b=args.mirror_b,
        rotate_a=args.rotate_a,
        rotate_b=args.rotate_b,
        warp_amp=args.warp_amp,
        warp_octaves=args.warp_octaves,
        warp_seed=args.warp_seed,
        out_suffix=args.out_suffix,
    )
    print(f"\n[done] Open: {out_dir / 'hillshade.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
