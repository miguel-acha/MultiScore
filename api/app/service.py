"""Inference service: loads the exported models/data once at startup and
exposes prediction + data-browsing functions to the FastAPI routes.

Crucially, `predict_shot` builds features using the exact same
`multiscore.features` functions used at training time (see
ml/multiscore/features.py), so there is no risk of train/serve skew - the
same guarantee tests/test_api.py checks for directly.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from multiscore.features import defender_features_from_freeze_frame, geo_features_from_row
from multiscore.modeling import prepare_frame

DATA_DIR = Path(__file__).resolve().parent / "data"
MODELS_DIR = Path(__file__).resolve().parent / "models"


class MultiScoreService:
    def __init__(self) -> None:
        self.geo_model = joblib.load(MODELS_DIR / "geo_model.joblib")
        self.geo_pre = joblib.load(MODELS_DIR / "geo_preprocessor.joblib")
        self.full_model = joblib.load(MODELS_DIR / "full_model.joblib")
        self.full_pre = joblib.load(MODELS_DIR / "full_preprocessor.joblib")
        with open(MODELS_DIR / "model_card.json") as f:
            self.model_card = json.load(f)

        self.shots = pd.read_parquet(DATA_DIR / "shots.parquet")
        self.matches = pd.read_parquet(DATA_DIR / "matches.parquet")

        players_path = DATA_DIR / "players.json"
        self.player_photos: dict = {}
        if players_path.exists():
            with open(players_path) as f:
                self.player_photos = json.load(f)

    # ---- live inference (simulator) -------------------------------------
    def predict(self, request) -> dict[str, Any]:
        shooter = (request.shooter_x, request.shooter_y)

        freeze_frame = [
            {
                "location": [p.x, p.y],
                "player": {"id": 0, "name": "sim"},
                "position": {"name": "Goalkeeper" if p.is_goalkeeper else "Unknown"},
                "teammate": p.teammate,
            }
            for p in request.freeze_frame
        ]

        row = pd.Series(
            {
                "loc_x": request.shooter_x,
                "loc_y": request.shooter_y,
                "shot_body_part": request.shot_body_part,
                "shot_type": request.shot_type,
                "shot_technique": request.shot_technique,
                "play_pattern": request.play_pattern,
                "under_pressure": request.under_pressure,
                "shot_first_time": request.first_time,
                "shot_one_on_one": request.one_on_one,
            }
        )

        geo_feats = geo_features_from_row(row)
        defender_feats = defender_features_from_freeze_frame(shooter, freeze_frame)
        all_feats = {**geo_feats, **defender_feats}
        feat_df = pd.DataFrame([all_feats])

        Xg = self.geo_pre.transform(prepare_frame(feat_df, "geo"))
        xg_geo = float(self.geo_model.predict_proba(Xg)[0, 1])

        if defender_feats["has_freeze_frame"]:
            Xf = self.full_pre.transform(prepare_frame(feat_df, "full"))
            xg_full = float(self.full_model.predict_proba(Xf)[0, 1])
        else:
            xg_full = xg_geo

        return {
            "xg_geo": xg_geo,
            "xg_full": xg_full,
            "xg_diff": xg_full - xg_geo,
            "computed_features": {
                "distance_to_goal_m": geo_feats["distance_to_goal_m"],
                "shot_angle_deg": geo_feats["shot_angle_deg"],
                "defenders_in_triangle": defender_feats["defenders_in_triangle"],
                "nearest_defender_dist_m": defender_feats["nearest_defender_dist_m"],
                "goalkeeper_present": defender_feats["goalkeeper_present"],
                "goal_coverage_pct": defender_feats["goal_coverage_pct"],
                "open_goal_geometric": defender_feats["open_goal_geometric"],
            },
        }

    # ---- browsing precomputed data ---------------------------------------
    def list_competitions(self) -> list[dict]:
        out = []
        for (cid, label), group in self.matches.groupby(["competition_id", "competition_label"]):
            seasons = (
                group[["season_id", "season_label"]]
                .drop_duplicates()
                .sort_values("season_id")
            )
            name = "Mundial 2022" if label == "world_cup_2022" else "La Liga"
            out.append(
                {
                    "competition_id": int(cid),
                    "competition_label": label,
                    "name": name,
                    "seasons": [
                        {"season_id": int(r.season_id), "label": r.season_label}
                        for r in seasons.itertuples()
                    ],
                }
            )
        return out

    def list_matches(self, competition_id: int) -> list[dict]:
        rows = self.matches[self.matches["competition_id"] == competition_id]
        return rows.sort_values("match_date").to_dict(orient="records")

    def get_match(self, match_id: int) -> dict | None:
        rows = self.matches[self.matches["match_id"] == match_id]
        if rows.empty:
            return None
        return rows.iloc[0].to_dict()

    def get_player(self, player_id: int) -> dict | None:
        rows = self.shots[self.shots["player_id"] == player_id]
        if rows.empty:
            return None
        row = rows.iloc[0]
        photo = self.player_photos.get(str(player_id))
        return {
            "player_id": int(player_id),
            "name": row["player"],
            "nickname": row.get("player_nickname"),
            "photo": photo,
        }

    def get_shots(self, match_id: int) -> list[dict]:
        rows = self.shots[self.shots["match_id"] == match_id]
        records = rows.to_dict(orient="records")
        # freeze_frame round-trips through parquet as a numpy array of dicts;
        # Pydantic/FastAPI can't serialize numpy.ndarray, so convert to a
        # plain list (and each entry's nested "location" array too).
        for record in records:
            ff = record.get("freeze_frame")
            if ff is not None:
                record["freeze_frame"] = [
                    {**entry, "location": list(entry["location"])} for entry in ff
                ]
        return records

    def model_info(self) -> dict:
        return self.model_card
