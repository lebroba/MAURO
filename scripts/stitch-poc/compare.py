"""
compare.py — build a single PNG comparison sheet for the GM demo.

Layout:
  +------------------------+------------------------+
  |   PAMIRS (original)    |  PATAGONIA (original)  |    top row
  +------------------------+------------------------+
  |        STITCHED + ERODED (full width)           |    bottom row
  +-------------------------------------------------+

With overlay text labels on each panel. Single PNG you can drop in a DM.

Usage:
  python compare.py earth-pamirs earth-patagonia
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed"
STITCHED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed_stitched"


def load_rgba(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    return img


def find_font(size: int) -> ImageFont.ImageFont:
    """Try a few common fonts; fall back to default if none found."""
    candidates = [
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/seguiui.ttf",
        "/System/Library/Fonts/Menlo.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _tile_subcaption(slug: str) -> str:
    """Read the tile.json sourceRegion.name + body for the panel sub-caption."""
    import json

    p = PROCESSED_DIR / slug / "tile.json"
    if not p.exists():
        return slug
    try:
        meta = json.loads(p.read_text(encoding="utf-8"))
        body = (meta.get("body") or "").title()
        region = (meta.get("sourceRegion") or {}).get("name", "")
        if body and region:
            return f"{region} ({body})"
        return region or slug
    except Exception:
        return slug


def label_panel(img: Image.Image, text: str, sub: str) -> None:
    """Stamp a top-left label onto an image in-place."""
    draw = ImageDraw.Draw(img)
    big = find_font(28)
    small = find_font(14)
    pad = 16
    # Background bar — semi-transparent dark for legibility on hillshade.
    bar_h = 64
    overlay = Image.new("RGBA", (img.width, bar_h), (0, 0, 0, 160))
    img.paste(overlay, (0, 0), overlay)
    draw.text((pad, 8), text, fill=(245, 240, 225, 255), font=big)
    draw.text((pad, 38), sub, fill=(180, 180, 180, 255), font=small)


def build_sheet(slug_a: str, slug_b: str, output_path: Path) -> None:
    pamirs = load_rgba(PROCESSED_DIR / slug_a / "hillshade.png")
    patagonia = load_rgba(PROCESSED_DIR / slug_b / "hillshade.png")
    stitched = load_rgba(STITCHED_DIR / f"{slug_a}-x-{slug_b}" / "hillshade.png")

    # Top row: two originals side by side, half-width each.
    # Bottom row: stitched at full width.
    target_top_h = 1024
    panel_w = stitched.width // 2

    # Resize originals to match top-row panel size, preserving aspect.
    def fit_to(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
        return img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    top_a = fit_to(pamirs, panel_w, target_top_h)
    top_b = fit_to(patagonia, panel_w, target_top_h)

    # Resize stitched proportionally to fill the bottom (full width = panel_w*2).
    stitched_w = panel_w * 2
    stitched_h = int(stitched.height * (stitched_w / stitched.width))
    bottom = fit_to(stitched, stitched_w, stitched_h)

    # Pull the friendly names from each tile's tile.json so the panel sub-
    # captions actually describe what's there.
    sub_a = _tile_subcaption(slug_a)
    sub_b = _tile_subcaption(slug_b)
    label_panel(top_a, slug_a.upper(), sub_a)
    label_panel(top_b, slug_b.upper(), sub_b)
    label_panel(
        bottom,
        f"{slug_a} + {slug_b}",
        "Histogram-matched + min-cost seam + multi-band blend (no erosion)",
    )

    sheet_w = stitched_w
    gap = 4
    # Caption strip at the very bottom.
    caption_h = 48
    sheet_h = target_top_h + gap + bottom.height + gap + caption_h
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (22, 21, 19, 255))

    sheet.paste(top_a, (0, 0))
    sheet.paste(top_b, (panel_w, 0))
    sheet.paste(bottom, (0, target_top_h + gap))

    # Caption text.
    draw = ImageDraw.Draw(sheet)
    cap_font = find_font(14)
    caption = (
        "MAURO  |  proof-of-concept multi-tile stitch.  "
        "Two real-Earth heightmaps, no hand-painting, no AI.  "
        "Pure CDF-matching + dynamic-programming seam + Burt-Adelson Laplacian-pyramid blend."
    )
    draw.text(
        (16, target_top_h + gap + bottom.height + gap + 14),
        caption,
        fill=(180, 175, 165, 255),
        font=cap_font,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path, format="PNG", optimize=True)
    print(f"[done] -> {output_path} ({sheet.width}x{sheet.height})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug_a")
    parser.add_argument("slug_b")
    parser.add_argument(
        "--out",
        default=None,
        help="Output PNG path. Defaults to ../{a}-x-{b}/comparison.png",
    )
    args = parser.parse_args()
    out = (
        Path(args.out)
        if args.out
        else STITCHED_DIR / f"{args.slug_a}-x-{args.slug_b}" / "comparison.png"
    )
    build_sheet(args.slug_a, args.slug_b, out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
