"""Team crests/flags for the web UI.

National teams: mapped to a fixed ISO 3166-1 alpha-2 code (see
NATIONAL_TEAM_ISO below), rendered client-side with the `flag-icons` CSS
package - no lookup needed.

Club crests: a club's CURRENT badge is a live trademark, so it is almost
never freely licensed - it isn't on Wikimedia Commons at all (Commons'
policy forbids non-free/fair-use content entirely), and the handful that
resolve there via Wikidata's logo claim (P154) are old, retired designs,
not the current one (see git history - that approach was tried first).

This version instead takes the crest directly from each club's English
Wikipedia infobox image (via the REST summary API), which IS the current
badge for every major club. Those images are hosted under Wikipedia's
"non-free logo" fair-use policy: fine for a non-commercial academic
project used with attribution, not for a commercial redistribution - see
the /creditos page, which is why this module is used at all instead of
Commons-only. `TEAM_TO_WIKIPEDIA_TITLE` below is a hand-verified mapping
(team name in the shot data -> exact enwiki article title), not a search,
specifically to avoid the failure mode of a previous free-text-search
attempt returning the wrong club, the wrong sport, or a kit-texture image
for several teams.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import httpx
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "api" / "app" / "data" / "teams.json"
OVERRIDES_PATH = ROOT / "configs" / "team_overrides.yaml"

USER_AGENT = "MultiScore/0.1 (student project; https://github.com/miguel-acha/MultiScore)"
WIKIPEDIA_REST_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
SLEEP_BETWEEN_REQUESTS_S = 0.15

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

# Hand-verified: team name as it appears in the shot data -> exact English
# Wikipedia article title. Checked against the REST summary API (returns
# the club's current infobox image for every entry) before being trusted
# here - see the plan doc for the verification run.
TEAM_TO_WIKIPEDIA_TITLE: dict[str, str] = {
    "Almería": "UD Almería",
    "Athletic Club": "Athletic Bilbao",
    "Atlético Madrid": "Atlético Madrid",
    "Barcelona": "FC Barcelona",
    "Celta Vigo": "RC Celta de Vigo",
    "Cádiz": "Cádiz CF",
    "Córdoba CF": "Córdoba CF",
    "Deportivo Alavés": "Deportivo Alavés",
    "Eibar": "SD Eibar",
    "Espanyol": "RCD Espanyol",
    "Getafe": "Getafe CF",
    "Granada": "Granada CF",
    "Huesca": "SD Huesca",
    "Hércules": "Hércules CF",
    "Las Palmas": "UD Las Palmas",
    "Leganés": "CD Leganés",
    "Levante UD": "Levante UD",
    "Mallorca": "RCD Mallorca",
    "Málaga": "Málaga CF",
    "Osasuna": "CA Osasuna",
    "RC Deportivo La Coruña": "Deportivo de La Coruña",
    "Racing Santander": "Racing de Santander",
    "Rayo Vallecano": "Rayo Vallecano",
    "Real Betis": "Real Betis",
    "Real Madrid": "Real Madrid CF",
    "Real Sociedad": "Real Sociedad",
    "Real Valladolid": "Real Valladolid",
    "Sevilla": "Sevilla FC",
    "Sporting Gijón": "Sporting de Gijón",
    "Valencia": "Valencia CF",
    "Villarreal": "Villarreal CF",
}


def _load_overrides() -> dict:
    if not OVERRIDES_PATH.exists():
        return {}
    with open(OVERRIDES_PATH) as f:
        return yaml.safe_load(f) or {}


def _wikipedia_crest(article_title: str, client: httpx.Client) -> dict | None:
    """REST summary gives the infobox thumbnail directly; imageinfo on the
    same filename then gives license/author for the credits page.
    """
    resp = client.get(WIKIPEDIA_REST_SUMMARY.format(title=article_title.replace(" ", "_")))
    if resp.status_code != 200:
        return None
    summary = resp.json()
    thumb = summary.get("thumbnail", {}) or {}
    thumb_url = thumb.get("source")
    if not thumb_url:
        return None

    # Extract the Commons/enwiki filename from the thumbnail URL, e.g.
    # ".../wikipedia/en/thumb/9/98/Foo_logo.svg/330px-Foo_logo.svg.png"
    # -> "Foo_logo.svg" (the path segment right before the "NNNpx-" one).
    parts = thumb_url.split("/")
    filename = None
    for i, part in enumerate(parts):
        if re.match(r"^\d+px-", part) and i > 0:
            filename = parts[i - 1]
            break
    license_name = None
    artist_html = None
    if filename:
        info_resp = client.get(
            WIKIPEDIA_API,
            params={
                "action": "query",
                "titles": f"File:{filename}",
                "prop": "imageinfo",
                "iiprop": "extmetadata",
                "format": "json",
            },
        )
        pages = info_resp.json().get("query", {}).get("pages", {})
        page = next(iter(pages.values()), {})
        info = (page.get("imageinfo") or [None])[0]
        if info:
            meta = info.get("extmetadata", {})
            license_name = meta.get("LicenseShortName", {}).get("value") or "Non-free logo"
            artist_html = meta.get("Artist", {}).get("value")

    return {
        "thumb_url": thumb_url,
        "license": license_name or "Non-free logo (Wikipedia)",
        "artist_html": artist_html,
        "article": summary.get("title", article_title),
    }


def build_team_crests(club_names: list[str], force: bool = False) -> dict:
    """club_names: every distinct club team name seen in the browsable
    data (national teams are handled separately via NATIONAL_TEAM_ISO, no
    network call needed). Returns the combined {team_name: entry} dict
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

    resolved_log = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=15.0) as client:
        for name in to_fetch:
            override = overrides.get(name)
            if override == "skip":
                result[name] = None
                continue

            title = override or TEAM_TO_WIKIPEDIA_TITLE.get(name)
            if title is None:
                print(f"  [warn] no Wikipedia title mapped for {name!r} - add it to TEAM_TO_WIKIPEDIA_TITLE or configs/team_overrides.yaml")
                result[name] = None
                continue

            try:
                crest = _wikipedia_crest(title, client)
                if crest is None:
                    result[name] = None
                else:
                    result[name] = {"kind": "club", "source": "wikipedia", **crest}
                    resolved_log.append((name, crest["article"]))
            except Exception as exc:  # noqa: BLE001 - one bad club shouldn't kill the run
                print(f"  [warn] {name} ({title}) failed: {exc}")
                result[name] = None

            time.sleep(SLEEP_BETWEEN_REQUESTS_S)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    if resolved_log:
        print("Resolved club -> Wikipedia article:")
        for name, article in resolved_log:
            print(f"  {name!r:30s} -> {article!r}")

    n_found = sum(1 for v in result.values() if v and v.get("kind") == "club")
    print(f"Saved {len(result)} team entries ({n_found} clubs with a crest, {len(NATIONAL_TEAM_ISO)} national flags) -> {OUT_PATH}")
    return result


if __name__ == "__main__":
    import pandas as pd

    shots = pd.read_parquet(ROOT / "api" / "app" / "data" / "shots.parquet")
    all_teams = sorted(set(shots["home_team"]) | set(shots["away_team"]))
    clubs = [t for t in all_teams if t not in NATIONAL_TEAM_ISO]
    build_team_crests(clubs, force=True)
