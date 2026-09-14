"""Player photos for the web UI, sourced from Wikimedia (Wikidata + Commons)
only - never generated, never scraped from a site whose terms forbid it.

For each player: search Wikidata for a matching human tagged as a
footballer (P106 = Q937857, "association football player"), optionally
disambiguated by nationality, pull their "image" claim (P18), then ask the
Commons API for a small thumbnail URL plus the license and author so the
web app can show proper attribution next to the photo.

Not every player will resolve to a confident match - StatsBomb names are
sometimes truncated/localized differently than Wikidata labels, and many
lower-profile players simply have no Commons photo. Those get no entry
here; the web app falls back to an initials avatar (see PlayerAvatar).

configs/player_overrides.yaml lets a person hand-fix a wrong or missing
match without touching this script (map player_id -> wikidata_id, or
player_id -> "skip" to force the avatar fallback).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
OUT_PATH = ROOT / "api" / "app" / "data" / "players.json"
OVERRIDES_PATH = ROOT / "configs" / "player_overrides.yaml"

USER_AGENT = "MultiScore/0.1 (student project; https://github.com/miguel-acha/MultiScore)"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
FOOTBALLER_QID = "Q937857"
HUMAN_QID = "Q5"
SLEEP_BETWEEN_REQUESTS_S = 0.2
THUMB_WIDTH_PX = 256


def _load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    with open(OVERRIDES_PATH) as f:
        return yaml.safe_load(f) or {}


def _search_wikidata(name: str, client: httpx.Client) -> str | None:
    """Return the best-guess Wikidata QID for a football player's name, or
    None if nothing confident was found."""
    resp = client.get(
        WIKIDATA_API,
        params={
            "action": "wbsearchentities",
            "search": name,
            "language": "en",
            "type": "item",
            "limit": 5,
            "format": "json",
        },
    )
    resp.raise_for_status()
    candidates = resp.json().get("search", [])
    for c in candidates:
        qid = c["id"]
        claims_resp = client.get(
            WIKIDATA_API,
            params={"action": "wbgetclaims", "entity": qid, "property": "P106", "format": "json"},
        )
        occupations = claims_resp.json().get("claims", {}).get("P106", [])
        for occ in occupations:
            value = occ.get("mainsnak", {}).get("datavalue", {}).get("value", {})
            if value.get("id") == FOOTBALLER_QID:
                return qid
    return None


def _wikidata_image_filename(qid: str, client: httpx.Client) -> str | None:
    resp = client.get(
        WIKIDATA_API,
        params={"action": "wbgetclaims", "entity": qid, "property": "P18", "format": "json"},
    )
    claims = resp.json().get("claims", {}).get("P18", [])
    if not claims:
        return None
    return claims[0]["mainsnak"]["datavalue"]["value"]


def _commons_image_info(filename: str, client: httpx.Client) -> dict | None:
    resp = client.get(
        COMMONS_API,
        params={
            "action": "query",
            "titles": f"File:{filename}",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": THUMB_WIDTH_PX,
            "format": "json",
        },
    )
    pages = resp.json().get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        return None
    meta = info.get("extmetadata", {})
    return {
        "thumb_url": info.get("thumburl"),
        "license": meta.get("LicenseShortName", {}).get("value"),
        "artist_html": meta.get("Artist", {}).get("value"),
    }


def build_player_photos(players: pd.DataFrame, force: bool = False) -> dict:
    """players: DataFrame with at least player_id, player_name,
    player_nickname (one row per unique player across all browsable
    matches). Returns {player_id: {thumb_url, license, artist_html,
    wikidata_id} | None} and writes it to api/app/data/players.json.
    """
    existing = {}
    if OUT_PATH.exists() and not force:
        with open(OUT_PATH) as f:
            existing = json.load(f)

    overrides = _load_overrides()
    result = dict(existing)

    to_fetch = players[~players["player_id"].astype(str).isin(existing.keys())]
    print(f"Fetching photos for {len(to_fetch)} new players (of {len(players)} total)...")

    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=15.0) as client:
        for i, row in enumerate(to_fetch.itertuples()):
            # str(int(...)) rather than str(...) so a stray float64 dtype
            # (e.g. "5503.0") can never desync these keys from the plain
            # int player_id the API looks them up by - see export.py.
            pid = str(int(row.player_id))
            override = overrides.get(pid)
            if override == "skip":
                result[pid] = None
                continue

            qid = override if override else None
            search_name = row.player_nickname or row.player_name
            try:
                if qid is None:
                    qid = _search_wikidata(search_name, client)
                if qid is None:
                    result[pid] = None
                    continue
                filename = _wikidata_image_filename(qid, client)
                if filename is None:
                    result[pid] = None
                    continue
                info = _commons_image_info(filename, client)
                if info is None or not info.get("thumb_url"):
                    result[pid] = None
                    continue
                result[pid] = {**info, "wikidata_id": qid}
            except Exception as exc:  # noqa: BLE001 - one bad player shouldn't kill the run
                print(f"  [warn] {search_name} ({pid}) failed: {exc}")
                result[pid] = None

            time.sleep(SLEEP_BETWEEN_REQUESTS_S)
            if (i + 1) % 20 == 0:
                print(f"  {i + 1}/{len(to_fetch)}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    n_found = sum(1 for v in result.values() if v)
    print(f"Saved {len(result)} player entries ({n_found} with a photo) -> {OUT_PATH}")
    return result
