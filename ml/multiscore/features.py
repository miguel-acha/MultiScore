"""Feature extraction for the xG model.

Two feature groups are produced from each shot:

- "geo" features: classic shot geometry + shot context (distance, angle,
  body part, shot type, play pattern, pressure, first time). Available for
  every shot, independent of freeze frame quality.
- "defender" features: derived from the freeze frame (player positions at
  the instant of the shot). These are the features that let the "full"
  models see what a purely geometric xG model cannot: how many opponents
  are actually in the way, how close the nearest defender is, and where the
  goalkeeper is standing relative to the shot line.

Keeping these two groups explicit (instead of one big feature list) makes it
straightforward to train "geo-only" vs "geo+defenders" model variants and
directly measure the marginal value of defender positioning.
"""

from __future__ import annotations

import pandas as pd

from multiscore.geometry import (
    LEFT_POST,
    RIGHT_POST,
    deviation_from_shot_line_m,
    distance_m,
    distance_to_goal_m,
    point_in_triangle,
    shot_angle_deg,
)

GEO_FEATURE_COLUMNS = [
    "distance_to_goal_m",
    "shot_angle_deg",
    "shot_body_part",
    "shot_type",
    "shot_technique",
    "play_pattern",
    "under_pressure",
    "shot_first_time",
    "shot_one_on_one",
]

DEFENDER_FEATURE_COLUMNS = [
    "defenders_in_triangle",
    "defenders_within_1m",
    "defenders_within_3m",
    "nearest_defender_dist_m",
    "teammates_in_triangle",
    "goalkeeper_present",
    "gk_distance_to_shooter_m",
    "gk_distance_to_goal_line_m",
    "gk_in_triangle",
    "gk_deviation_from_shot_line_m",
]

ALL_FEATURE_COLUMNS = GEO_FEATURE_COLUMNS + DEFENDER_FEATURE_COLUMNS

# A sentinel used when a freeze frame is missing entirely, so the "defender"
# feature block can be flagged and excluded/imputed downstream rather than
# silently treated as "zero defenders nearby".
NO_FREEZE_FRAME_SENTINEL = -1.0


def geo_features_from_row(row: pd.Series) -> dict:
    """Compute the shot-geometry feature block for a single shot row.

    `row` must have `loc_x`, `loc_y` (StatsBomb shot location) plus the raw
    categorical columns already present in the flattened shot table.
    """
    shooter = (row["loc_x"], row["loc_y"])
    return {
        "distance_to_goal_m": distance_to_goal_m(shooter),
        "shot_angle_deg": shot_angle_deg(shooter),
        "shot_body_part": row.get("shot_body_part"),
        "shot_type": row.get("shot_type"),
        "shot_technique": row.get("shot_technique"),
        "play_pattern": row.get("play_pattern"),
        "under_pressure": bool(row.get("under_pressure", False)),
        "shot_first_time": bool(row.get("shot_first_time", False)),
        "shot_one_on_one": bool(row.get("shot_one_on_one", False)),
    }


def defender_features_from_freeze_frame(
    shooter: tuple[float, float],
    freeze_frame: list[dict] | None,
) -> dict:
    """Compute the defender-context feature block from a freeze frame.

    freeze_frame: list of dicts as returned by StatsBomb, each with
    {"location": [x, y], "player": {...}, "position": {...}, "teammate": bool}.
    The shooter is not part of the freeze frame and must be identified by
    the corresponding shot row.

    If freeze_frame is None/empty, every numeric field is set to the
    NO_FREEZE_FRAME_SENTINEL so these rows can be filtered out of the
    "with defenders" training set (they carry no real information) while
    still being usable for the "geo-only" model.
    """
    # freeze_frame may come back as a numpy array (round-tripped through
    # parquet), where a plain `if not freeze_frame` raises ambiguous-truth-
    # value errors for arrays with >1 element - check length explicitly.
    if freeze_frame is None or len(freeze_frame) == 0:
        return {
            "defenders_in_triangle": NO_FREEZE_FRAME_SENTINEL,
            "defenders_within_1m": NO_FREEZE_FRAME_SENTINEL,
            "defenders_within_3m": NO_FREEZE_FRAME_SENTINEL,
            "nearest_defender_dist_m": NO_FREEZE_FRAME_SENTINEL,
            "teammates_in_triangle": NO_FREEZE_FRAME_SENTINEL,
            "goalkeeper_present": 0,
            "gk_distance_to_shooter_m": NO_FREEZE_FRAME_SENTINEL,
            "gk_distance_to_goal_line_m": NO_FREEZE_FRAME_SENTINEL,
            "gk_in_triangle": 0,
            "gk_deviation_from_shot_line_m": NO_FREEZE_FRAME_SENTINEL,
            "has_freeze_frame": False,
        }

    defenders = []
    teammates = []
    goalkeeper = None

    for entry in freeze_frame:
        loc = entry.get("location")
        if loc is None or len(loc) < 2:
            continue
        point = (loc[0], loc[1])
        is_teammate = bool(entry.get("teammate"))
        position = (entry.get("position") or {}).get("name", "")

        if is_teammate:
            teammates.append(point)
            continue

        defenders.append(point)
        if position == "Goalkeeper" and goalkeeper is None:
            goalkeeper = point

    n_in_triangle = sum(1 for p in defenders if point_in_triangle(p, shooter, LEFT_POST, RIGHT_POST))
    n_teammates_in_triangle = sum(
        1 for p in teammates if point_in_triangle(p, shooter, LEFT_POST, RIGHT_POST)
    )

    defender_distances = [distance_m(shooter, p) for p in defenders]
    n_within_1m = sum(1 for d in defender_distances if d <= 1.0)
    n_within_3m = sum(1 for d in defender_distances if d <= 3.0)
    nearest = min(defender_distances) if defender_distances else NO_FREEZE_FRAME_SENTINEL

    if goalkeeper is not None:
        gk_dist_shooter = distance_m(shooter, goalkeeper)
        gk_dist_goal_line = abs(120.0 - goalkeeper[0]) * 0.9144
        gk_in_tri = point_in_triangle(goalkeeper, shooter, LEFT_POST, RIGHT_POST)
        gk_deviation = deviation_from_shot_line_m(shooter, goalkeeper)
        gk_present = 1
    else:
        gk_dist_shooter = NO_FREEZE_FRAME_SENTINEL
        gk_dist_goal_line = NO_FREEZE_FRAME_SENTINEL
        gk_in_tri = 0
        gk_deviation = NO_FREEZE_FRAME_SENTINEL
        gk_present = 0

    return {
        "defenders_in_triangle": n_in_triangle,
        "defenders_within_1m": n_within_1m,
        "defenders_within_3m": n_within_3m,
        "nearest_defender_dist_m": nearest,
        "teammates_in_triangle": n_teammates_in_triangle,
        "goalkeeper_present": gk_present,
        "gk_distance_to_shooter_m": gk_dist_shooter,
        "gk_distance_to_goal_line_m": gk_dist_goal_line,
        "gk_in_triangle": int(gk_in_tri),
        "gk_deviation_from_shot_line_m": gk_deviation,
        "has_freeze_frame": True,
    }


def build_feature_row(row: pd.Series) -> dict:
    """Combine geo + defender features for a single shot row into one dict."""
    shooter = (row["loc_x"], row["loc_y"])
    geo = geo_features_from_row(row)
    defenders = defender_features_from_freeze_frame(shooter, row.get("freeze_frame"))
    return {**geo, **defenders}


def build_feature_table(df: pd.DataFrame) -> pd.DataFrame:
    """Vectorized-ish wrapper: apply build_feature_row over an entire shots
    DataFrame and return a new DataFrame of features aligned by index,
    concatenated with the identifying/label columns needed downstream.
    """
    feature_rows = df.apply(build_feature_row, axis=1, result_type="expand")
    keep_cols = [
        c
        for c in [
            "event_id",
            "match_id",
            "match_date",
            "competition_id",
            "season_id",
            "competition_label",
            "player",
            "player_id",
            "team",
            "loc_x",
            "loc_y",
            "freeze_frame",
            "shot_outcome",
            "statsbomb_xg",
        ]
        if c in df.columns
    ]
    out = pd.concat([df[keep_cols].reset_index(drop=True), feature_rows.reset_index(drop=True)], axis=1)
    out["is_goal"] = (out["shot_outcome"] == "Goal").astype(int)
    return out
