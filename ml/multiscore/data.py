"""Download and cache StatsBomb Open Data shot events.

La Liga (competition_id=11) is used as the training source (large volume,
many seasons). The 2022 World Cup (competition_id=43, season_id=106) is kept
aside as an external generalization test set - never touched during model
selection or hyperparameter tuning.

statsbombpy's `sb.events(..., flatten_attrs=False)` returns one nested dict
column per event type (e.g. a "shot" column holding freeze_frame, outcome,
body_part, statsbomb_xg, etc.) instead of flattening everything into
separate top-level columns. We extract exactly the fields we need from that
dict here, once, so every downstream module works with a flat schema.

Results are cached to parquet under data/raw/ so re-running the pipeline
does not re-download from GitHub every time.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import pandas as pd
from statsbombpy import sb

logging.getLogger("statsbombpy").setLevel(logging.ERROR)

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

LA_LIGA_COMPETITION_ID = 11
WORLD_CUP_2022_COMPETITION_ID = 43
WORLD_CUP_2022_SEASON_ID = 106


def get_competitions() -> pd.DataFrame:
    """Fetch the full list of open-data competitions/seasons."""
    return sb.competitions()


def _season_ids_for(competition_id: int) -> list[int]:
    comps = get_competitions()
    rows = comps[comps["competition_id"] == competition_id]
    return sorted(rows["season_id"].unique().tolist())


def _matches_for(competition_id: int, season_id: int) -> pd.DataFrame:
    return sb.matches(competition_id=competition_id, season_id=season_id)


def _nested_name(d, key: str):
    """Safely pull the "name" field out of a nested {"id":.., "name":..} dict."""
    if isinstance(d, dict):
        val = d.get(key)
        if isinstance(val, dict):
            return val.get("name")
    return None


def _flatten_shot_row(row: pd.Series) -> dict:
    """Turn one raw event row (with a nested 'shot' dict) into a flat dict."""
    shot = row.get("shot") or {}
    if not isinstance(shot, dict):
        shot = {}

    end_location = shot.get("end_location") or [None, None, None]
    location = row.get("location") or [None, None]

    return {
        "event_id": row.get("id"),
        "match_id": row.get("match_id"),
        "match_date": row.get("match_date"),
        "home_team": row.get("home_team"),
        "away_team": row.get("away_team"),
        "competition_id": row.get("competition_id"),
        "season_id": row.get("season_id"),
        "competition_label": row.get("competition_label"),
        "minute": row.get("minute"),
        "second": row.get("second"),
        "period": row.get("period"),
        "team": _nested_name(row.get("team"), None) if isinstance(row.get("team"), dict) else row.get("team"),
        "team_id": (row.get("team") or {}).get("id") if isinstance(row.get("team"), dict) else row.get("team_id"),
        "player": (row.get("player") or {}).get("name") if isinstance(row.get("player"), dict) else row.get("player"),
        "player_id": (row.get("player") or {}).get("id") if isinstance(row.get("player"), dict) else row.get("player_id"),
        "position": (row.get("position") or {}).get("name") if isinstance(row.get("position"), dict) else row.get("position"),
        "play_pattern": _nested_name(row.get("play_pattern"), None) if isinstance(row.get("play_pattern"), dict) else row.get("play_pattern"),
        "under_pressure": bool(row.get("under_pressure")) if row.get("under_pressure") is not None else False,
        "loc_x": location[0] if isinstance(location, (list, tuple)) and len(location) > 0 else None,
        "loc_y": location[1] if isinstance(location, (list, tuple)) and len(location) > 1 else None,
        "shot_end_x": end_location[0] if len(end_location) > 0 else None,
        "shot_end_y": end_location[1] if len(end_location) > 1 else None,
        "shot_end_z": end_location[2] if len(end_location) > 2 else None,
        "shot_type": (shot.get("type") or {}).get("name"),
        "shot_technique": (shot.get("technique") or {}).get("name"),
        "shot_body_part": (shot.get("body_part") or {}).get("name"),
        "shot_outcome": (shot.get("outcome") or {}).get("name"),
        "statsbomb_xg": shot.get("statsbomb_xg"),
        "shot_first_time": bool(shot.get("first_time")) if shot.get("first_time") is not None else False,
        "shot_one_on_one": bool(shot.get("one_on_one")) if shot.get("one_on_one") is not None else False,
        "shot_open_goal": bool(shot.get("open_goal")) if shot.get("open_goal") is not None else False,
        "shot_deflected": bool(shot.get("deflected")) if shot.get("deflected") is not None else False,
        "shot_aerial_won": bool(shot.get("aerial_won")) if shot.get("aerial_won") is not None else False,
        "freeze_frame": shot.get("freeze_frame"),
    }


def download_shots(
    competition_id: int,
    season_id: int,
    label: str,
    force: bool = False,
    sleep_s: float = 0.0,
) -> pd.DataFrame:
    """Download all Shot events for every match of one competition/season.

    Caches the result at data/raw/shots_{label}_{competition_id}_{season_id}.parquet.
    Returns a flat DataFrame with one row per shot (freeze_frame kept as a
    list of dicts for later feature extraction).
    """
    cache_path = RAW_DIR / f"shots_{label}_{competition_id}_{season_id}.parquet"
    if cache_path.exists() and not force:
        return pd.read_parquet(cache_path)

    matches = _matches_for(competition_id, season_id)
    flat_rows = []
    for i, (_, match) in enumerate(matches.iterrows()):
        match_id = match["match_id"]
        try:
            events = sb.events(match_id=match_id, split=False, flatten_attrs=False)
        except Exception as exc:  # noqa: BLE001 - keep pipeline resilient to bad matches
            print(f"  [warn] match {match_id} failed: {exc}")
            continue
        shots = events[events["type"] == "Shot"].copy()
        if shots.empty:
            continue
        shots["match_id"] = match_id
        shots["match_date"] = match.get("match_date")
        shots["home_team"] = match.get("home_team")
        shots["away_team"] = match.get("away_team")
        shots["competition_id"] = competition_id
        shots["season_id"] = season_id
        shots["competition_label"] = label

        for _, row in shots.iterrows():
            flat_rows.append(_flatten_shot_row(row))

        if (i + 1) % 50 == 0 or i == len(matches) - 1:
            print(f"  [{label}] {i + 1}/{len(matches)} matches, {len(flat_rows)} shots so far")
        if sleep_s:
            time.sleep(sleep_s)

    if not flat_rows:
        raise RuntimeError(f"No shots downloaded for {label} ({competition_id}/{season_id})")

    df = pd.DataFrame(flat_rows)
    df.to_parquet(cache_path)
    print(f"Saved {len(df)} shots -> {cache_path}")
    return df


def download_la_liga(force: bool = False) -> pd.DataFrame:
    """Download shots for every open La Liga season available."""
    season_ids = _season_ids_for(LA_LIGA_COMPETITION_ID)
    frames = []
    for season_id in season_ids:
        print(f"La Liga season_id={season_id}")
        frames.append(download_shots(LA_LIGA_COMPETITION_ID, season_id, "la_liga", force=force))
    return pd.concat(frames, ignore_index=True)


def download_world_cup_2022(force: bool = False) -> pd.DataFrame:
    """Download shots for the 2022 World Cup (external test set)."""
    return download_shots(
        WORLD_CUP_2022_COMPETITION_ID,
        WORLD_CUP_2022_SEASON_ID,
        "world_cup_2022",
        force=force,
    )


if __name__ == "__main__":
    print("Fetching competitions list...")
    comps = get_competitions()
    print(
        comps[comps["competition_id"].isin([11, 43])][
            ["competition_id", "competition_name", "season_id", "season_name"]
        ]
    )

    print("\nDownloading World Cup 2022 shots (external test set)...")
    wc = download_world_cup_2022()
    print(f"World Cup 2022 total shots: {len(wc)}")

    print("\nDownloading La Liga shots (training source, all open seasons)...")
    la_liga = download_la_liga()
    print(f"La Liga total shots: {len(la_liga)}")
