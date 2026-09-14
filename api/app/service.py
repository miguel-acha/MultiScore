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

        teams_path = DATA_DIR / "teams.json"
        self.teams: dict = {}
        if teams_path.exists():
            with open(teams_path) as f:
                self.teams = json.load(f)

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

    # A shot on target either scores or forces a save - it's the standard
    # "shot accuracy" definition, distinct from "not blocked by a
    # defender" (which StatsBomb tracks separately as "Blocked").
    ON_TARGET_OUTCOMES = frozenset({"Goal", "Saved", "Saved to Post", "Saved Off Target"})

    def _player_stats(self, rows: pd.DataFrame) -> dict:
        n_shots = len(rows)
        goals = int(rows["is_goal"].sum())
        xg_total = float(rows["xg_full"].sum())
        on_target = int(rows["shot_outcome"].isin(self.ON_TARGET_OUTCOMES).sum())
        main_team = rows["team"].mode().iat[0] if n_shots else None
        return {
            "shots": n_shots,
            "goals": goals,
            "xg_total": xg_total,
            "xg_per_shot": xg_total / n_shots if n_shots else 0.0,
            "goals_minus_xg": goals - xg_total,
            "on_target_pct": (on_target / n_shots * 100.0) if n_shots else 0.0,
            "matches": int(rows["match_id"].nunique()),
            "team": main_team,
        }

    def list_players(
        self, q: str | None = None, competition_id: int | None = None, sort: str = "goals"
    ) -> list[dict]:
        rows = self.shots
        if competition_id is not None:
            rows = rows[rows["competition_id"] == competition_id]
        rows = rows[rows["player_id"].notna()]

        out = []
        for player_id, group in rows.groupby("player_id"):
            first = group.iloc[0]
            name = first["player"]
            nickname = first.get("player_nickname") or name
            if q and q.lower() not in name.lower() and q.lower() not in str(nickname).lower():
                continue
            stats = self._player_stats(group)
            out.append(
                {
                    "player_id": int(player_id),
                    "name": name,
                    "nickname": nickname,
                    "photo": self.player_photos.get(str(int(player_id))),
                    **stats,
                }
            )

        sort_key = {
            "goals": lambda p: (p["goals"], p["xg_total"]),
            "xg": lambda p: p["xg_total"],
            "shots": lambda p: p["shots"],
            "overperf": lambda p: p["goals_minus_xg"],
        }.get(sort, lambda p: (p["goals"], p["xg_total"]))
        out.sort(key=sort_key, reverse=True)
        return out

    def get_player(self, player_id: int) -> dict | None:
        rows = self.shots[self.shots["player_id"] == player_id]
        if rows.empty:
            return None
        row = rows.iloc[0]
        photo = self.player_photos.get(str(player_id))
        outcomes = rows["shot_outcome"].value_counts().to_dict()
        return {
            "player_id": int(player_id),
            "name": row["player"],
            "nickname": row.get("player_nickname"),
            "jersey_number": None if pd.isna(row.get("jersey_number")) else int(row["jersey_number"]),
            "photo": photo,
            "stats": self._player_stats(rows),
            "outcomes": outcomes,
            "shots": self._serialize_shot_rows(rows.sort_values(["match_date", "period", "minute"])),
        }

    def get_teams(self) -> dict:
        return self.teams

    def get_shots(self, match_id: int) -> list[dict]:
        rows = self.shots[self.shots["match_id"] == match_id]
        return self._serialize_shot_rows(rows)

    def _serialize_shot_rows(self, rows: pd.DataFrame) -> list[dict]:
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
            player_id = record.get("player_id")
            photo = self.player_photos.get(str(int(player_id))) if player_id is not None and not pd.isna(player_id) else None
            record["player_photo_url"] = photo["thumb_url"] if photo else None
        return records

    # ---- game mode: random shot rounds -----------------------------------
    def random_shots(self, n: int = 10, balanced: bool = True, seed: int | None = None) -> list[dict]:
        """Pick `n` real shots that have a freeze frame, for the "guess the
        xG" / "goal or not" game modes. `balanced=True` samples roughly half
        goals and half non-goals so "goal or not" stays a real guessing game
        instead of "always say no". `seed` makes a round reproducible (for a
        future daily-challenge / shareable link use case).
        """
        rng_seed = seed if seed is not None else None
        pool = self.shots[self.shots["freeze_frame"].notna()]
        if pool.empty:
            return []

        if balanced:
            goals = pool[pool["is_goal"] == 1]
            misses = pool[pool["is_goal"] == 0]
            n_goals = min(n // 2, len(goals))
            n_misses = min(n - n_goals, len(misses))
            # top up from whichever pool has more left, if one side is short
            remaining = n - n_goals - n_misses
            if remaining > 0 and len(goals) > n_goals:
                extra = min(remaining, len(goals) - n_goals)
                n_goals += extra
                remaining -= extra
            if remaining > 0 and len(misses) > n_misses:
                n_misses += min(remaining, len(misses) - n_misses)
            picked = pd.concat(
                [
                    goals.sample(n=n_goals, random_state=rng_seed) if n_goals else goals.iloc[0:0],
                    misses.sample(n=n_misses, random_state=rng_seed) if n_misses else misses.iloc[0:0],
                ]
            ).sample(frac=1, random_state=rng_seed)
        else:
            picked = pool.sample(n=min(n, len(pool)), random_state=rng_seed)

        rows = self._serialize_shot_rows(picked)
        match_lookup = self.matches.set_index("match_id")[["home_team", "away_team"]].to_dict(orient="index")
        for row in rows:
            teams = match_lookup.get(row["match_id"])
            row["home_team"] = teams["home_team"] if teams else None
            row["away_team"] = teams["away_team"] if teams else None
        return rows

    def model_info(self) -> dict:
        return self.model_card
