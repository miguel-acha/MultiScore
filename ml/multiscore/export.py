"""Precompute xG-geo, xG-full and the StatsBomb baseline xG for every shot
that will be browsable in the web app's "explorer" view, and package
everything the API needs (models + precomputed shots + competition/match
metadata) into a compact bundle under api/app/data/.

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

from multiscore.modeling import prepare_frame

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"
API_DATA_DIR = ROOT / "api" / "app" / "data"
API_MODELS_DIR = ROOT / "api" / "app" / "models"


def export_bundle() -> None:
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

    export_cols = [
        "event_id", "match_id", "match_date", "competition_id", "season_id",
        "competition_label", "player", "team", "shot_outcome", "is_goal",
        "statsbomb_xg", "xg_geo", "xg_full", "xg_diff",
        "loc_x", "loc_y", "shot_body_part", "shot_type", "freeze_frame",
    ]
    export_df = browsable[export_cols]
    export_df.to_parquet(API_DATA_DIR / "shots.parquet")
    print(f"Exported {len(export_df)} precomputed shots -> {API_DATA_DIR / 'shots.parquet'}")

    matches = (
        browsable.groupby(["match_id", "match_date", "competition_id", "season_id", "competition_label"])
        .agg(n_shots=("event_id", "count"), n_goals=("is_goal", "sum"))
        .reset_index()
    )
    matches.to_parquet(API_DATA_DIR / "matches.parquet")
    print(f"Exported {len(matches)} matches -> {API_DATA_DIR / 'matches.parquet'}")


if __name__ == "__main__":
    export_bundle()
