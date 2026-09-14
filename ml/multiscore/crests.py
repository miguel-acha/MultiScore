"""Team crests/flags for the web UI: club badges from Wikimedia (Wikidata +
Commons), national teams as ISO country codes for CSS flag rendering -
never generated, never a third-party sports API with trademarked logos.

For each La Liga club: search Wikidata for a matching football club
(P31 = Q476028, "association football club"), pull its logo claim (P154),
then ask Commons for a small PNG thumbnail plus license/author - same
pattern as ml/multiscore/photos.py, reusing its request helpers.

World Cup national teams don't get looked up at all: they're mapped to a
fixed ISO 3166-1 alpha-2 code (see NATIONAL_TEAM_ISO below) so the web app
can render a flag with the `flag-icons` CSS package instead of a fetched
image.

configs/team_overrides.yaml lets a person hand-fix a wrong/missing club
match without touching this script (team name -> wikidata_id, or
team name -> "skip" to force the initials badge fallback).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "api" / "app" / "data" / "teams.json"
OVERRIDES_PATH = ROOT / "configs" / "team_overrides.yaml"

USER_AGENT = "MultiScore/0.1 (student project; https://github.com/miguel-acha/MultiScore)"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikidata models "football club" inconsistently across entries - some
# clubs are typed directly as Q476028 ("association football club"), others
# only carry a narrower subclass like Q103229495 ("men's association
# football team") or a club-specific class Wikidata added later. Rather
# than chase every subclass QID, a candidate is accepted if it has EITHER
# one of these common types OR simply a logo image claim (P154) - a
# Wikidata item for a short, ambiguous team name like "Mallorca" or
# "Huesca" that also happens to have a football-club logo is, in practice,
# always the club and not the city/place.
FOOTBALL_CLUB_QIDS = {"Q476028", "Q103229495", "Q20639856"}
SLEEP_BETWEEN_REQUESTS_S = 0.2
THUMB_WIDTH_PX = 128

# World Cup 2022 national teams -> ISO 3166-1 alpha-2 (lowercase, as
# `flag-icons` expects for its `fi-xx` classes). England/Wales/Scotland use
# the subdivision codes flag-icons ships as `fi-gb-eng` etc.
NATIONAL_TEAM_ISO: dict[str, str] = {
    "Argentina": "ar", "Australia": "au", "Belgium": "be", "Brazil": "br",
    "Cameroon": "cm", "Canada": "ca", "Costa Rica": "cr", "Croatia": "hr",
    "Denmark": "dk", "Ecuador": "ec", "England": "gb-eng", "France": "fr",
    "Germany": "de", "Ghana": "gh", "Iran": "ir", "Japan": "jp",
    "Mexico": "mx", "Morocco": "ma", "Netherlands": "nl", "Poland": "pl",
    "Portugal": "pt", "Qatar": "qa", "Saudi Arabia": "sa", "Senegal": "sn",
    "Serbia": "rs", "South Korea": "kr", "Spain": "es", "Switzerland": "ch",
    "Tunisia": "tn", "United States": "us", "Uruguay": "uy", "Wales": "gb-wls",
}


def _load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    with open(OVERRIDES_PATH) as f:
        return yaml.safe_load(f) or {}


def _search_candidates(query: str, client: httpx.Client) -> list[str]:
    resp = client.get(
        WIKIDATA_API,
        params={
            "action": "wbsearchentities",
            "search": query,
            "language": "en",
            "type": "item",
            "limit": 5,
            "format": "json",
        },
    )
    resp.raise_for_status()
    return [c["id"] for c in resp.json().get("search", [])]


def _looks_like_football_club(qid: str, client: httpx.Client) -> bool:
    """A candidate counts as the club if it's typed as one of the known
    football-club QIDs, OR - the more reliable signal in practice, since
    Wikidata's club typing is inconsistent - it has a logo image (P154),
    which a city/place/person entity with the same short name won't have.
    """
    # wbgetclaims only accepts a single "property" value, so fetch all
    # claims for the entity instead of trying "P31|P154" (which silently
    # returns nothing for both).
    claims_resp = client.get(
        WIKIDATA_API,
        params={"action": "wbgetclaims", "entity": qid, "format": "json"},
    )
    claims = claims_resp.json().get("claims", {})
    instances = claims.get("P31", [])
    for inst in instances:
        value = inst.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if value.get("id") in FOOTBALL_CLUB_QIDS:
            return True
    return bool(claims.get("P154"))


def _search_club_qid(name: str, client: httpx.Client) -> str | None:
    # Try a disambiguated query first ("Huesca football club" surfaces the
    # club over the city), then fall back to the bare team name.
    for query in (f"{name} football club", name):
        for qid in _search_candidates(query, client):
            time.sleep(SLEEP_BETWEEN_REQUESTS_S)
            if _looks_like_football_club(qid, client):
                return qid
    return None


# A club's CURRENT crest is a live trademark and essentially never sits on
# Commons under a free license - a blind Commons full-text search for
# "<name> logo" was tried as a fallback and rejected: it returned wrong
# clubs entirely (Athletic Club -> a Moroccan club of a similar name),
# wrong sports (Sevilla/Valencia -> American-football team logos), and kit
# texture diagrams instead of crests. Wikidata's P154 claim is kept as the
# only source because, unlike free-text search, it's a specific claim a
# Wikidata editor attached to the exact club entity - still occasionally a
# historical crest instead of the current one, but never the wrong club.


def _wikidata_logo_filename(qid: str, client: httpx.Client) -> str | None:
    resp = client.get(
        WIKIDATA_API,
        params={"action": "wbgetclaims", "entity": qid, "property": "P154", "format": "json"},
    )
    claims = resp.json().get("claims", {}).get("P154", [])
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


def build_team_crests(club_names: list[str], force: bool = False) -> dict:
    """club_names: every distinct club team name seen in the browsable
    data (national teams are handled separately via NATIONAL_TEAM_ISO,
    no network call needed). Returns the combined {team_name: entry} dict
    covering both clubs and national teams, and writes it to
    api/app/data/teams.json.
    """
    existing: dict = {}
    if OUT_PATH.exists() and not force:
        with open(OUT_PATH) as f:
            existing = json.load(f)

    overrides = _load_overrides()
    result = dict(existing)

    for name, iso2 in NATIONAL_TEAM_ISO.items():
        result[name] = {"kind": "national", "iso2": iso2}

    to_fetch = [n for n in club_names if n not in existing or existing.get(n) is None]
    print(f"Fetching crests for {len(to_fetch)} new clubs (of {len(club_names)} total)...")

    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=15.0) as client:
        for i, name in enumerate(to_fetch):
            override = overrides.get(name)
            if override == "skip":
                result[name] = None
                continue

            qid = override if override else None
            try:
                filename = None
                if qid is None:
                    qid = _search_club_qid(name, client)
                if qid is not None:
                    filename = _wikidata_logo_filename(qid, client)
                if filename is None:
                    result[name] = None
                    continue
                info = _commons_image_info(filename, client)
                if info is None or not info.get("thumb_url"):
                    result[name] = None
                    continue
                result[name] = {"kind": "club", **info, "wikidata_id": qid}
            except Exception as exc:  # noqa: BLE001 - one bad club shouldn't kill the run
                print(f"  [warn] {name} failed: {exc}")
                result[name] = None

            time.sleep(SLEEP_BETWEEN_REQUESTS_S)
            if (i + 1) % 10 == 0:
                print(f"  {i + 1}/{len(to_fetch)}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    n_found = sum(1 for v in result.values() if v and v.get("kind") == "club")
    print(f"Saved {len(result)} team entries ({n_found} clubs with a crest, {len(NATIONAL_TEAM_ISO)} national flags) -> {OUT_PATH}")
    return result


if __name__ == "__main__":
    import pandas as pd

    shots = pd.read_parquet(ROOT / "api" / "app" / "data" / "shots.parquet")
    all_teams = sorted(set(shots["home_team"]) | set(shots["away_team"]))
    clubs = [t for t in all_teams if t not in NATIONAL_TEAM_ISO]
    build_team_crests(clubs)
