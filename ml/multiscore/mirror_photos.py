"""Mirrors every player photo in api/app/data/players.json into
web/public/players/ as small local webp files, and rewrites players.json
to point at them.

Why: the photos were being hotlinked straight from Wikimedia thumb.wikimedia.org
on every page load. Each one loads fine on its own (a few hundred ms), but a
match page with 20+ shots or the /jugadores grid with 60 avatars fires that
many parallel cross-origin requests, and the perceived "photos take forever"
was really "20 sequential-feeling Wikimedia round trips competing for
bandwidth". Serving small (96px/256px) webp files from the same Vercel
origin as everything else turns that into a handful of KB each, cached
forever, no cross-origin request at all.

The original Wikimedia URL, license and author are kept in players.json
(as `source_url`) so /creditos can still credit and link the original.

Usage:
    uv run python -m multiscore.mirror_photos
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PLAYERS_JSON = ROOT / "api" / "app" / "data" / "players.json"
OUT_DIR = ROOT / "web" / "public" / "players"
OUT_DIR_LG = OUT_DIR / "lg"

USER_AGENT = "MultiScore/0.1 (student project; https://github.com/miguel-acha/MultiScore)"
SMALL_PX = 96
LARGE_PX = 256
MAX_WORKERS = 3
MAX_RETRIES = 4


def _crop_square_top_weighted(img: Image.Image) -> Image.Image:
    """Square-crop an arbitrary-aspect portrait, biased towards the top
    third (where a headshot's face usually sits) rather than dead center,
    which for tall crowd-sourced action shots often crops out the face.
    """
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = max(0, min(h - side, int((h - side) * 0.15)))
    return img.crop((left, top, left + side, top + side))


def _fetch_and_convert(pid: str, url: str, client: httpx.Client) -> tuple[str, bool]:
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.get(url)
            if resp.status_code == 429:
                raise httpx.HTTPStatusError("429", request=resp.request, response=resp)
            resp.raise_for_status()
            img = Image.open(BytesIO(resp.content)).convert("RGB")
            square = _crop_square_top_weighted(img)

            small = square.resize((SMALL_PX, SMALL_PX), Image.LANCZOS)
            small.save(OUT_DIR / f"{pid}.webp", "WEBP", quality=80)

            large = square.resize((LARGE_PX, LARGE_PX), Image.LANCZOS)
            large.save(OUT_DIR_LG / f"{pid}.webp", "WEBP", quality=82)
            return pid, True
        except Exception as exc:  # noqa: BLE001 - one bad photo shouldn't kill the run
            if attempt < MAX_RETRIES - 1:
                time.sleep(2.0 * (attempt + 1))
                continue
            print(f"  [warn] player {pid} failed after {MAX_RETRIES} attempts: {exc}")
            return pid, False


def mirror_photos() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR_LG.mkdir(parents=True, exist_ok=True)

    with open(PLAYERS_JSON) as f:
        players = json.load(f)

    # A previous run may have already rewritten thumb_url to a local
    # "/players/..." path - use source_url (the original Wikimedia URL) in
    # that case so a re-run (e.g. to pick up ones that 429'd) doesn't try
    # to httpx.get() a relative local path, and skip anything whose output
    # file already exists so re-running only fetches what's still missing.
    with_photo = {
        pid: (v.get("source_url") or v["thumb_url"])
        for pid, v in players.items()
        if v and v.get("thumb_url") and not (OUT_DIR / f"{pid}.webp").exists()
    }
    already_done = sum(1 for pid, v in players.items() if v and v.get("thumb_url") and (OUT_DIR / f"{pid}.webp").exists())
    print(f"Mirroring {len(with_photo)} player photos ({already_done} already done)...")

    ok = 0
    with (
        httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20.0, follow_redirects=True) as client,
        ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool,
    ):
        futures = {pool.submit(_fetch_and_convert, pid, url, client): pid for pid, url in with_photo.items()}
        for i, future in enumerate(as_completed(futures)):
            pid, success = future.result()
            if success:
                v = players[pid]
                v["source_url"] = v["thumb_url"]
                v["thumb_url"] = f"/players/{pid}.webp"
                v["thumb_url_lg"] = f"/players/lg/{pid}.webp"
                ok += 1
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{len(with_photo)}")

    with open(PLAYERS_JSON, "w") as f:
        json.dump(players, f, indent=2)

    print(f"Mirrored {ok}/{len(with_photo)} photos -> {OUT_DIR}")
    print(f"Updated -> {PLAYERS_JSON}")


if __name__ == "__main__":
    mirror_photos()
