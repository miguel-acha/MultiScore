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
        ],
        "categorical": ["shot_body_part", "shot_type", "shot_technique", "play_pattern"],
        "boolean": [
            "under_pressure",
            "shot_first_time",
            "shot_one_on_one",
            "goalkeeper_present",
            "gk_in_triangle",
        ],
    },
}


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
