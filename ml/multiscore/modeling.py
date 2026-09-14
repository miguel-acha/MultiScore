"""Shared preprocessing definitions for the two feature sets used across
training, evaluation, export and the live API.

Keeping this in one place (imported by train.py, evaluate.py, export.py and
api/app/service.py) guarantees that whatever the model saw during training
is exactly what it sees at inference time - the same guarantee that
tests/test_api.py checks for the live API.
"""

from __future__ import annotations

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

FEATURE_SETS: dict[str, dict[str, list[str]]] = {
    "geo": {
        "numeric": ["distance_to_goal_m", "shot_angle_deg"],
        "categorical": ["shot_body_part", "shot_type", "shot_technique", "play_pattern"],
        "boolean": ["under_pressure", "shot_first_time", "shot_one_on_one"],
    },
    "full": {
        "numeric": [
            "distance_to_goal_m",
            "shot_angle_deg",
            "defenders_in_triangle",
            "defenders_within_1m",
            "defenders_within_3m",
            "nearest_defender_dist_m",
            "teammates_in_triangle",
            "gk_distance_to_shooter_m",
            "gk_distance_to_goal_line_m",
            "gk_deviation_from_shot_line_m",
            "goal_coverage_pct",
            "gk_reach_coverage_pct",
        ],
        "categorical": ["shot_body_part", "shot_type", "shot_technique", "play_pattern"],
        "boolean": [
            "under_pressure",
            "shot_first_time",
            "shot_one_on_one",
            "goalkeeper_present",
            "gk_in_triangle",
            "open_goal_geometric",
        ],
    },
}

# Monotonic constraints for the "full" feature set, applied to XGBoost and
# LightGBM so the model can't learn a physically nonsensical direction for
# a feature whose effect on shot difficulty is unambiguous by definition
# (e.g. more defenders in the way can never make a shot EASIER). Expressed
# per numeric/boolean column (categorical one-hot columns and the
# goalkeeper-distance columns, whose direction is genuinely ambiguous
# depending on context, are left unconstrained = 0).
#   -1 = feature can only decrease predicted xG as it increases
#   +1 = feature can only increase predicted xG as it increases
#    0 = unconstrained
MONOTONIC_CONSTRAINTS = {
    "geo": {
        "distance_to_goal_m": -1,
        "shot_angle_deg": 1,
    },
    "full": {
        "distance_to_goal_m": -1,
        "shot_angle_deg": 1,
        "defenders_in_triangle": -1,
        "defenders_within_1m": -1,
        "defenders_within_3m": -1,
        "nearest_defender_dist_m": 1,
        "gk_in_triangle": -1,
        "goal_coverage_pct": -1,
        "open_goal_geometric": 1,
        # Goalkeeper features: constrained too, despite being individually
        # ambiguous in some real-world nuances (e.g. a keeper off his line
        # can occasionally help him), because the required invariant
        # "removing an unobstructing goalkeeper never lowers xG" only holds
        # under monotonic constraints if EVERY feature that changes when a
        # goalkeeper is added/removed moves in a jointly-consistent
        # direction - leaving any one of these unconstrained lets it
        # dominate and flip that comparison (which is exactly what broke
        # the v1 model). See tests/test_model_sanity.py.
        "goalkeeper_present": -1,
        "gk_distance_to_shooter_m": 1,
        "gk_distance_to_goal_line_m": 1,
        "gk_deviation_from_shot_line_m": 1,
        "gk_reach_coverage_pct": -1,
    },
}


def monotonic_constraints_vector(feature_set_name: str, feature_names: list[str]) -> tuple[int, ...]:
    """Build the (constraint per expanded feature) tuple that XGBoost's
    `monotone_constraints` and LightGBM's `monotone_constraints` expect,
    aligned 1:1 with `feature_names` (as returned by get_onehot_feature_names).
    Any feature not named in MONOTONIC_CONSTRAINTS gets 0 (unconstrained) -
    this covers every one-hot categorical column automatically.
    """
    constraints = MONOTONIC_CONSTRAINTS[feature_set_name]
    return tuple(constraints.get(name, 0) for name in feature_names)


def build_preprocessor(feature_set_name: str) -> ColumnTransformer:
    """Build (unfitted) a ColumnTransformer for the given feature set.

    Numeric columns are standardized (needed for logistic regression;
    harmless but unnecessary for the tree models — kept uniform across all
    three model families to avoid maintaining two preprocessing paths).
    Categorical columns are one-hot encoded with unknown categories at
    inference time mapped to an all-zero vector instead of raising.
    Boolean columns are passed through as 0/1 ints.
    """
    cols = FEATURE_SETS[feature_set_name]
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), cols["numeric"]),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                cols["categorical"],
            ),
            ("bool", "passthrough", cols["boolean"]),
        ],
        remainder="drop",
    )


def feature_columns(feature_set_name: str) -> list[str]:
    cols = FEATURE_SETS[feature_set_name]
    return cols["numeric"] + cols["categorical"] + cols["boolean"]


def prepare_frame(df: pd.DataFrame, feature_set_name: str) -> pd.DataFrame:
    """Select+coerce the columns a preprocessor expects (bool -> int, and
    make sure every expected column exists even if all-NaN, so a single
    live shot with e.g. no goalkeeper still has every column present).
    """
    cols = FEATURE_SETS[feature_set_name]
    out = pd.DataFrame(index=df.index)
    for c in cols["numeric"]:
        out[c] = pd.to_numeric(df[c], errors="coerce")
    for c in cols["categorical"]:
        out[c] = df[c].astype("object")
    for c in cols["boolean"]:
        out[c] = df[c].astype(int)
    return out


def get_onehot_feature_names(preprocessor: ColumnTransformer, feature_set_name: str) -> list[str]:
    """Human-readable expanded feature names after the ColumnTransformer,
    used for coefficient/importance reporting.
    """
    cols = FEATURE_SETS[feature_set_name]
    names = list(cols["numeric"])
    cat_encoder = preprocessor.named_transformers_["cat"]
    names += list(cat_encoder.get_feature_names_out(cols["categorical"]))
    names += list(cols["boolean"])
    return names
