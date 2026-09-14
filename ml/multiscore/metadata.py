"""Human-readable match and player metadata, for the web UI only - none of
this feeds the model. Cached to data/raw/ so re-running the pipeline does
not re-hit the StatsBomb Open Data repo every time.

Two things live here:
- match metadata: teams, final score, stage, stadium, season label.
- lineups: nickname (e.g. "Neymar" instead of "Neymar da Silva Santos
  Junior"), jersey number, country, per player per match.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from statsbombpy import sb

from multiscore.data import (
    LA_LIGA_COMPETITION_ID,
    WORLD_CUP_2022_COMPETITION_ID,
    WORLD_CUP_2022_SEASON_ID,
    _season_ids_for,
    get_competitions,
)

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


def season_label(competition_id: int, season_id: int) -> str:
    """A short human label like 'La Liga 2015/16' or 'Mundial 2022'."""
    if competition_id == WORLD_CUP_2022_COMPETITION_ID:
        return "Mundial 2022"
    comps = get_competitions()
    row = comps[
        (comps["competition_id"] == competition_id) & (comps["season_id"] == season_id)
    ]
    season_name = row.iloc[0]["season_name"] if not row.empty else str(season_id)
    comp_name = "La Liga" if competition_id == LA_LIGA_COMPETITION_ID else row.iloc[0]["competition_name"]
    return f"{comp_name} {season_name}"


def build_match_metadata(force: bool = False) -> pd.DataFrame:
    """One row per match: teams, score, stage, stadium, season label.

    Covers every La Liga season plus the World Cup 2022 (the same universe
    `data.py` downloads shots for).
    """
    cache_path = RAW_DIR / "match_metadata.parquet"
    if cache_path.exists() and not force:
        return pd.read_parquet(cache_path)

    rows = []
    targets = [(LA_LIGA_COMPETITION_ID, sid) for sid in _season_ids_for(LA_LIGA_COMPETITION_ID)]
    targets.append((WORLD_CUP_2022_COMPETITION_ID, WORLD_CUP_2022_SEASON_ID))

    for competition_id, season_id in targets:
        m = sb.matches(competition_id=competition_id, season_id=season_id)
        if m.empty:
            continue
        label = season_label(competition_id, season_id)
        for _, r in m.iterrows():
            rows.append(
                {
                    "match_id": r["match_id"],
                    "match_date": r["match_date"],
                    "competition_id": competition_id,
                    "season_id": season_id,
                    "season_label": label,
                    "home_team": r["home_team"],
                    "away_team": r["away_team"],
                    "home_score": int(r["home_score"]),
                    "away_score": int(r["away_score"]),
                    "competition_stage": r.get("competition_stage"),
                    "stadium": r.get("stadium"),
                }
            )
        print(f"  [metadata] {label}: {len(m)} matches")

    df = pd.DataFrame(rows)
    df.to_parquet(cache_path)
    print(f"Saved {len(df)} matches -> {cache_path}")
    return df


def build_lineups(match_ids: list[int], force: bool = False) -> pd.DataFrame:
    """One row per (match_id, player): nickname, jersey number, country.

    Only fetched for the given match ids (the ones actually browsable in
    the web app), since a full lineup call per match is one request each.
    """
    cache_path = RAW_DIR / "lineups.parquet"
    cached = pd.read_parquet(cache_path) if cache_path.exists() and not force else pd.DataFrame()
    have = set(cached["match_id"].unique()) if not cached.empty else set()
    missing = [m for m in match_ids if m not in have]

    new_rows = []
    for i, match_id in enumerate(missing):
        try:
            lineup = sb.lineups(match_id=int(match_id))
        except Exception as exc:  # noqa: BLE001 - keep pipeline resilient
            print(f"  [warn] lineup for match {match_id} failed: {exc}")
            continue
        for team, players in lineup.items():
            for _, p in players.iterrows():
                new_rows.append(
                    {
                        "match_id": match_id,
                        "team": team,
                        "player_id": p["player_id"],
                        "player_name": p["player_name"],
                        "player_nickname": p.get("player_nickname"),
                        "jersey_number": p.get("jersey_number"),
                        "country": p.get("country"),
                    }
                )
        if (i + 1) % 25 == 0 or i == len(missing) - 1:
            print(f"  [lineups] {i + 1}/{len(missing)} matches")

    if new_rows:
        combined = pd.concat([cached, pd.DataFrame(new_rows)], ignore_index=True)
    else:
        combined = cached
    combined = combined.drop_duplicates(subset=["match_id", "player_id"])
    combined.to_parquet(cache_path)
    print(f"Saved {len(combined)} lineup rows -> {cache_path}")
    return combined


if __name__ == "__main__":
    # Only match metadata is built by default (931 matches, cheap - two
    # sb.matches() calls per competition). Lineups are NOT fetched for
    # every match here: that's ~1 request per match, and only the ~195
    # matches actually browsable in the web app (World Cup 2022 + the La
    # Liga test-split sample) need them - export.py calls build_lineups()
    # with exactly that narrower set.
    matches = build_match_metadata()
    print(matches.head())
