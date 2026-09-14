"""Precompute xG-geo, xG-full and the StatsBomb baseline xG for every shot
that will be browsable in the web app's "explorer" view, and package
everything the API needs (models + precomputed shots + match/player
metadata + player photos) into a compact bundle under api/app/data/.

Precomputing means the explorer never calls the live model for historical
shots - only the interactive simulator (POST /predict) runs inference live.
This keeps the deployed API fast and cheap (see the plan's "why Cloud Run
stays free" reasoning).
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import joblib
import pandas as pd

from multiscore.crests import NATIONAL_TEAM_ISO, build_team_crests
from multiscore.geometry import goal_coverage_pct
from multiscore.metadata import build_lineups, build_match_metadata
from multiscore.modeling import prepare_frame
from multiscore.photos import build_player_photos

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
API_DATA_DIR = ROOT / "api" / "app" / "data"
API_MODELS_DIR = ROOT / "api" / "app" / "models"


def _shot_shadow_pct(row) -> float:
    """goal_coverage_pct for a precomputed shot row (defenders + keeper
    from its freeze frame), used by the web pitch to draw the same
    "shadow on the goal" the model actually sees.
    """
    ff = row.get("freeze_frame")
    if ff is None or len(ff) == 0:
        return 0.0
    shooter = (row["loc_x"], row["loc_y"])
    obstacles = [tuple(e["location"]) for e in ff if not e.get("teammate")]
    return goal_coverage_pct(shooter, obstacles)


def export_bundle(fetch_photos: bool = True, fetch_crests: bool = True) -> None:
    API_DATA_DIR.mkdir(parents=True, exist_ok=True)
    API_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    with open(REPORTS_DIR / "train_results.json") as f:
        train_results = json.load(f)
    selected = train_results["_selected_production_model"]
    calibrated_path = MODELS_DIR / selected / "model_calibrated.joblib"
    use_calibrated = calibrated_path.exists() and train_results["_calibration"]["calibration_applied"]

    # Copy the two production models the API needs: the best geo-only model
    # (for shots with no freeze frame / no defender context) and the
    # selected full model (calibrated version if it improved ECE).
    best_geo = min(
        (k for k in train_results if not k.startswith("_") and train_results[k]["feature_set"] == "geo"),
        key=lambda k: train_results[k]["val_logloss"],
    )

    for variant_name, target_name in [(best_geo, "geo"), (selected, "full")]:
        shutil.copy(MODELS_DIR / variant_name / "preprocessor.joblib", API_MODELS_DIR / f"{target_name}_preprocessor.joblib")
        model_src = MODELS_DIR / variant_name / "model.joblib"
        if target_name == "full" and use_calibrated:
            model_src = calibrated_path
        shutil.copy(model_src, API_MODELS_DIR / f"{target_name}_model.joblib")

    model_card = {
        "geo_model": best_geo,
        "full_model": selected,
        "full_model_calibrated": use_calibrated,
        "train_results_summary": {
            k: v for k, v in train_results.items() if not k.startswith("_")
        },
        "calibration": train_results.get("_calibration"),
        "dataset_info": train_results.get("_dataset_info"),
    }
    with open(API_MODELS_DIR / "model_card.json", "w") as f:
        json.dump(model_card, f, indent=2, default=str)
    with open(MODELS_DIR / "model_card.json", "w") as f:
        json.dump(model_card, f, indent=2, default=str)

    # Precompute predictions for every browsable shot (World Cup 2022 +
    # a sample of La Liga test-split matches, to keep the bundle small).
    geo_model = joblib.load(API_MODELS_DIR / "geo_model.joblib")
    geo_pre = joblib.load(API_MODELS_DIR / "geo_preprocessor.joblib")
    full_model = joblib.load(API_MODELS_DIR / "full_model.joblib")
    full_pre = joblib.load(API_MODELS_DIR / "full_preprocessor.joblib")

    la_liga_all = pd.read_parquet(ROOT / "data" / "processed" / "la_liga_features.parquet")
    wc_all = pd.read_parquet(ROOT / "data" / "processed" / "world_cup_2022_features.parquet")

    browsable = pd.concat(
        [wc_all, la_liga_all[la_liga_all["split"] == "test"]],
        ignore_index=True,
    )
    browsable = browsable[browsable["has_freeze_frame"]].reset_index(drop=True)

    Xg = geo_pre.transform(prepare_frame(browsable, "geo"))
    Xf = full_pre.transform(prepare_frame(browsable, "full"))
    browsable["xg_geo"] = geo_model.predict_proba(Xg)[:, 1]
    browsable["xg_full"] = full_model.predict_proba(Xf)[:, 1]
    browsable["xg_diff"] = browsable["xg_full"] - browsable["xg_geo"]
    browsable["goal_coverage_pct"] = browsable.apply(_shot_shadow_pct, axis=1)

    # ---- match + player metadata (readable names, score, nickname/photo) --
    match_meta = build_match_metadata()
    browsable = browsable.merge(
        match_meta[
            ["match_id", "season_label", "home_team", "away_team", "home_score", "away_score", "competition_stage", "stadium"]
        ],
        on="match_id",
        how="left",
        suffixes=("", "_meta"),
    )
    # build_feature_table already carried a home_team/away_team from the raw
    # event rows for La Liga/World Cup; prefer the metadata version (it's
    # sourced from sb.matches, same as the score, so it's guaranteed
    # consistent with home_score/away_score).
    if "home_team_meta" in browsable.columns:
        browsable["home_team"] = browsable["home_team_meta"]
        browsable["away_team"] = browsable["away_team_meta"]
        browsable = browsable.drop(columns=["home_team_meta", "away_team_meta"])

    # player_id round-trips through pandas as float64 (any NaN in the
    # column upstream forces the whole column to float), which then
    # serializes to string keys like "5503.0" - breaking every downstream
    # dict lookup keyed by player_id (players.json, the API's /players/{id}
    # route) since those all format the id as a plain int string. Force it
    # back to a nullable int now, once, before it's used for anything.
    browsable["player_id"] = browsable["player_id"].astype("Int64")

    browsable_match_ids = browsable["match_id"].unique().tolist()
    lineups = build_lineups(browsable_match_ids)
    nickname_map = lineups.set_index("player_id")["player_nickname"].to_dict()
    jersey_map = lineups.set_index("player_id")["jersey_number"].to_dict()
    browsable["player_nickname"] = browsable["player_id"].map(nickname_map)
    browsable["player_nickname"] = browsable["player_nickname"].fillna(browsable["player"])
    browsable["jersey_number"] = browsable["player_id"].map(jersey_map)

    if fetch_photos:
        unique_players = (
            browsable[["player_id", "player", "player_nickname"]]
            .rename(columns={"player": "player_name"})
            .drop_duplicates(subset=["player_id"])
        )
        build_player_photos(unique_players)

    export_cols = [
        "event_id", "match_id", "match_date", "competition_id", "season_id",
        "competition_label", "season_label", "home_team", "away_team",
        "home_score", "away_score", "competition_stage", "stadium",
        "minute", "period", "player", "player_id", "player_nickname",
        "jersey_number", "team", "shot_outcome", "is_goal",
        "statsbomb_xg", "xg_geo", "xg_full", "xg_diff", "goal_coverage_pct",
        "loc_x", "loc_y", "shot_end_x", "shot_end_y", "shot_end_z",
        "shot_body_part", "shot_type", "freeze_frame",
    ]
    export_df = browsable[[c for c in export_cols if c in browsable.columns]]
    export_df.to_parquet(API_DATA_DIR / "shots.parquet")
    print(f"Exported {len(export_df)} precomputed shots -> {API_DATA_DIR / 'shots.parquet'}")

    matches = (
        browsable.groupby(
            [
                "match_id", "match_date", "competition_id", "season_id",
                "competition_label", "season_label", "home_team", "away_team",
                "home_score", "away_score", "competition_stage", "stadium",
            ]
        )
        .agg(n_shots=("event_id", "count"), n_goals=("is_goal", "sum"))
        .reset_index()
    )
    # xg per team (full model): sum xg_full grouped by (match, team), then
    # look up the home/away team's total for each match.
    team_xg = (
        browsable.groupby(["match_id", "team"])["xg_full"].sum().reset_index()
    )
    home_xg = matches.merge(
        team_xg, left_on=["match_id", "home_team"], right_on=["match_id", "team"], how="left"
    )["xg_full"].fillna(0.0)
    away_xg = matches.merge(
        team_xg, left_on=["match_id", "away_team"], right_on=["match_id", "team"], how="left"
    )["xg_full"].fillna(0.0)
    matches["home_xg_full"] = home_xg
    matches["away_xg_full"] = away_xg

    matches.to_parquet(API_DATA_DIR / "matches.parquet")
    print(f"Exported {len(matches)} matches -> {API_DATA_DIR / 'matches.parquet'}")

    if fetch_crests:
        all_teams = set(browsable["home_team"]) | set(browsable["away_team"])
        club_names = sorted(t for t in all_teams if t not in NATIONAL_TEAM_ISO)
        build_team_crests(club_names)


if __name__ == "__main__":
    import sys

    export_bundle(
        fetch_photos="--no-photos" not in sys.argv,
        fetch_crests="--no-crests" not in sys.argv,
    )
