"""
upload_to_storage.py — push stitch-poc output PNGs to Supabase Storage.

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local
(same source the web app uses) and uploads the comparison + hillshade
PNGs to the public `tiles-rendered/poc/` prefix.

Usage:
  python upload_to_storage.py earth-pamirs earth-patagonia
  python upload_to_storage.py earth-pamirs mars-tharsis
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

REPO_ROOT = Path(__file__).resolve().parents[2]
STITCHED_DIR = REPO_ROOT / "mauro-sources" / "DEM-Downloads" / "_processed_stitched"
ENV_PATH = REPO_ROOT / "apps" / "web" / ".env.local"
BUCKET = "tiles-rendered"
PREFIX = "poc"


def load_env() -> dict[str, str]:
    if not ENV_PATH.exists():
        raise FileNotFoundError(f"Missing {ENV_PATH}")
    out: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def upload_one(supabase_url: str, service_key: str, object_path: str, file_path: Path) -> str:
    """Upload one file, return its public URL.

    Uses the Storage REST API directly to avoid pulling in the Python
    supabase-py client just for one upload.
    """
    api = f"{supabase_url}/storage/v1/object/{BUCKET}/{object_path}"
    body = file_path.read_bytes()
    req = Request(
        api,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "image/png",
            "x-upsert": "true",
            "Cache-Control": "public, max-age=300",
        },
    )
    try:
        with urlopen(req, timeout=120) as resp:
            _ = resp.read()
    except HTTPError as e:
        # Already-exists is fine when upsert worked; for any other error,
        # surface the body so the caller can see what Storage said.
        body_text = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Upload failed for {object_path}: HTTP {e.code} — {body_text}")
    return f"{supabase_url}/storage/v1/object/public/{BUCKET}/{object_path}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("slug_a")
    p.add_argument("slug_b")
    args = p.parse_args()

    env = load_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in "
            f"{ENV_PATH}",
            file=sys.stderr,
        )
        return 1

    combo = f"{args.slug_a}-x-{args.slug_b}"
    src_dir = STITCHED_DIR / combo
    if not src_dir.exists():
        print(f"No stitched output at {src_dir}", file=sys.stderr)
        return 1

    files = ["comparison.png", "hillshade.png", "colored.png"]
    print(f"Uploading {combo}/ to {BUCKET}/{PREFIX}/{combo}/")
    for fname in files:
        local = src_dir / fname
        if not local.exists():
            print(f"  skip {fname} (not present)")
            continue
        object_path = f"{PREFIX}/{combo}/{fname}"
        url = upload_one(supabase_url, service_key, object_path, local)
        print(f"  {fname} ({local.stat().st_size // 1024} KB)\n    {url}")

    # Web-optimized JPEGs — the source PNGs are 11-21 MB which is rough on
    # browsers. Make a half-resolution JPEG version of each so the POC
    # page loads fast.
    print(f"\nWeb-optimized JPEGs (half-res, q=85):")
    from PIL import Image
    for fname in files:
        local = src_dir / fname
        if not local.exists():
            continue
        img = Image.open(local).convert("RGB")
        new_size = (img.width // 2, img.height // 2)
        img = img.resize(new_size, Image.Resampling.LANCZOS)
        web_path = src_dir / fname.replace(".png", "_web.jpg")
        img.save(web_path, format="JPEG", quality=85, optimize=True, progressive=True)
        object_path = f"{PREFIX}/{combo}/{web_path.name}"
        url = upload_one(supabase_url, service_key, object_path, web_path)
        print(f"  {web_path.name} ({web_path.stat().st_size // 1024} KB)\n    {url}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
