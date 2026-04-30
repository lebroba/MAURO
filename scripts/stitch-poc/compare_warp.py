"""
compare_warp.py — side-by-side "before / after" sheet showing the same
combo with and without shape modification (mirror + rotate + domain warp).

Layout:
  +-------------------------+
  |  STITCHED — UNWARPED    |
  +-------------------------+
  |  STITCHED — WARPED      |
  +-------------------------+

Inputs come from the existing _processed_stitched/{combo} (unwarped) and
_processed_stitched/{combo}-warped (warped) directories.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[2]
STITCHED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed_stitched"


def find_font(size: int) -> ImageFont.ImageFont:
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


def label_panel(img: Image.Image, text: str, sub: str) -> None:
    draw = ImageDraw.Draw(img)
    big = find_font(28)
    small = find_font(14)
    bar_h = 64
    overlay = Image.new("RGBA", (img.width, bar_h), (0, 0, 0, 160))
    img.paste(overlay, (0, 0), overlay)
    draw.text((16, 8), text, fill=(245, 240, 225, 255), font=big)
    draw.text((16, 38), sub, fill=(180, 180, 180, 255), font=small)


def build_warp_sheet(slug_a: str, slug_b: str, output_path: Path) -> None:
    base_combo = f"{slug_a}-x-{slug_b}"
    unwarped = (STITCHED_DIR / base_combo / "hillshade.png")
    warped = (STITCHED_DIR / f"{base_combo}-warped" / "hillshade.png")
    if not unwarped.exists() or not warped.exists():
        raise FileNotFoundError(
            f"Need both {unwarped} and {warped}; run stitch.py for both versions first."
        )

    img_u = Image.open(unwarped).convert("RGBA")
    img_w = Image.open(warped).convert("RGBA")

    # Match widths.
    target_w = max(img_u.width, img_w.width)

    def fit_w(img: Image.Image, w: int) -> Image.Image:
        if img.width == w:
            return img
        ratio = w / img.width
        return img.resize((w, int(img.height * ratio)), Image.Resampling.LANCZOS)

    img_u = fit_w(img_u, target_w)
    img_w = fit_w(img_w, target_w)

    label_panel(
        img_u,
        "STITCHED — original shapes",
        f"{slug_a} + {slug_b}: real-Earth/Mars data, no shape modification",
    )
    label_panel(
        img_w,
        "STITCHED — shapes modified",
        "mirror + rotate per source tile, domain-warp on stitched canvas",
    )

    gap = 6
    caption_h = 48
    sheet = Image.new(
        "RGBA",
        (target_w, img_u.height + gap + img_w.height + gap + caption_h),
        (22, 21, 19, 255),
    )
    sheet.paste(img_u, (0, 0))
    sheet.paste(img_w, (0, img_u.height + gap))

    draw = ImageDraw.Draw(sheet)
    cap_font = find_font(14)
    caption = (
        "MAURO  |  same source data, two passes.  "
        "Top: tiles placed and blended as-is — recognizable Earth/Mars features survive.  "
        "Bottom: per-tile mirror+rotation, then 50px-amplitude fractal domain warp on the stitched canvas — coasts and ridges no longer match anything specific."
    )
    draw.text(
        (16, img_u.height + gap + img_w.height + gap + 14),
        caption,
        fill=(180, 175, 165, 255),
        font=cap_font,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(output_path, format="PNG", optimize=True)
    print(f"[done] -> {output_path} ({sheet.width}x{sheet.height})")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("slug_a")
    p.add_argument("slug_b")
    args = p.parse_args()
    out = STITCHED_DIR / f"{args.slug_a}-x-{args.slug_b}-warped" / "comparison.png"
    build_warp_sheet(args.slug_a, args.slug_b, out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
