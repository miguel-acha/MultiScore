"""Build the modeling dataset from raw StatsBomb shot data.

Cleaning rules (each one is logged with a count, so the numbers can go
straight into the report/documentation):

1. Penalties are excluded. A penalty's xG is close to a fixed constant
   (StatsBomb itself treats it almost like a separate event type) and mixing
   it in would distort both training and evaluation of open-play xG.
2. Shots without a freeze frame are flagged (has_freeze_frame=False) rather
   than dropped outright: they still carry a valid label and geo features,
   so they stay in the "geo-only" dataset but are excluded from the
   "with defenders" dataset, where a missing freeze frame carries no signal.
3. Rows with missing/invalid shot location are dropped (can't compute any
   geometry feature without a location).
4. Exact duplicate events (same event_id) are dropped.

Splitting:
- La Liga is split by MATCH (not by individual shot) into train/val/test via
  GroupShuffleSplit, so no two shots from the same match leak across splits.
- The World Cup 2022 set is kept entirely separate as an external
  generalization test set - it is never used for training or model
  selection, only for final evaluation.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from multiscore.features import build_feature_table

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
REPORTS_DIR = Path(__file__).resolve().parents[2] / "reports"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_SEED = 42
TRAIN_FRAC = 0.70
VAL_FRAC = 0.15
# TEST_FRAC is implicit = 1 - TRAIN_FRAC - VAL_FRAC = 0.15


def load_raw_la_liga() -> pd.DataFrame:
    files = sorted(RAW_DIR.glob("shots_la_liga_*.parquet"))
    if not files:
        raise FileNotFoundError("No La Liga parquet files found. Run `python -m multiscore.data` first.")
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def load_raw_world_cup_2022() -> pd.DataFrame:
    files = sorted(RAW_DIR.glob("shots_world_cup_2022_*.parquet"))
    if not files:
        raise FileNotFoundError("No World Cup 2022 parquet file found. Run `python -m multiscore.data` first.")
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def clean_shots(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Apply the cleaning rules above. Returns (clean_df, stats_dict)."""
    stats = {"input_rows": len(df)}

    df = df.drop_duplicates(subset=["event_id"]).copy()
    stats["after_dedupe"] = len(df)
    stats["duplicates_removed"] = stats["input_rows"] - stats["after_dedupe"]

    before = len(df)
    df = df.dropna(subset=["loc_x", "loc_y"]).copy()
    stats["missing_location_removed"] = before - len(df)

    before = len(df)
    is_penalty = df["shot_type"] == "Penalty"
    stats["penalties_removed"] = int(is_penalty.sum())
    df = df[~is_penalty].copy()

    stats["after_cleaning"] = len(df)
    stats["missing_freeze_frame"] = int(
        df["freeze_frame"].apply(lambda ff: ff is None or (hasattr(ff, "__len__") and len(ff) == 0)).sum()
    )
    return df, stats


def build_features_and_labels(df: pd.DataFrame) -> pd.DataFrame:
    return build_feature_table(df)


def split_la_liga(features: pd.DataFrame, seed: int = RANDOM_SEED) -> pd.DataFrame:
    """Add a 'split' column (train/val/test) to the La Liga feature table,
    grouped by match_id so shots from one match never span two splits.
    """
    groups = features["match_id"]

    gss1 = GroupShuffleSplit(n_splits=1, train_size=TRAIN_FRAC, random_state=seed)
    train_idx, rest_idx = next(gss1.split(features, groups=groups))

    rest = features.iloc[rest_idx]
    rest_groups = rest["match_id"]
    val_frac_of_rest = VAL_FRAC / (1 - TRAIN_FRAC)
    gss2 = GroupShuffleSplit(n_splits=1, train_size=val_frac_of_rest, random_state=seed)
    val_idx_in_rest, test_idx_in_rest = next(gss2.split(rest, groups=rest_groups))

    split_col = pd.Series("test", index=features.index)
    split_col.iloc[train_idx] = "train"
    split_col.iloc[rest.iloc[val_idx_in_rest].index] = "val"
    split_col.iloc[rest.iloc[test_idx_in_rest].index] = "test"

    out = features.copy()
    out["split"] = split_col
    return out


def build_and_save_all(force_reload: bool = False) -> dict:
    """End-to-end: load raw, clean, featurize, split, save to processed/,
    and write a JSON summary of every cleaning/split statistic.
    """
    summary: dict = {}

    print("Loading raw La Liga shots...")
    raw_la_liga = load_raw_la_liga()
    clean_la_liga, la_liga_stats = clean_shots(raw_la_liga)
    summary["la_liga_cleaning"] = la_liga_stats
    print(f"La Liga: {la_liga_stats}")

    print("Loading raw World Cup 2022 shots...")
    raw_wc = load_raw_world_cup_2022()
    clean_wc, wc_stats = clean_shots(raw_wc)
    summary["world_cup_2022_cleaning"] = wc_stats
    print(f"World Cup 2022: {wc_stats}")

    print("Building features (La Liga)...")
    la_liga_features = build_features_and_labels(clean_la_liga)
    la_liga_features = split_la_liga(la_liga_features)

    print("Building features (World Cup 2022, external test)...")
    wc_features = build_features_and_labels(clean_wc)
    wc_features["split"] = "external_test"

    goal_rate_la_liga = la_liga_features["is_goal"].mean()
    goal_rate_wc = wc_features["is_goal"].mean()
    summary["goal_rate_la_liga"] = float(goal_rate_la_liga)
    summary["goal_rate_world_cup_2022"] = float(goal_rate_wc)
    summary["split_counts"] = la_liga_features["split"].value_counts().to_dict()
    summary["with_freeze_frame_counts"] = (
        la_liga_features.groupby("split")["has_freeze_frame"].sum().to_dict()
    )

    la_liga_path = PROCESSED_DIR / "la_liga_features.parquet"
    wc_path = PROCESSED_DIR / "world_cup_2022_features.parquet"
    la_liga_features.to_parquet(la_liga_path)
    wc_features.to_parquet(wc_path)
    print(f"Saved {la_liga_path} ({len(la_liga_features)} rows)")
    print(f"Saved {wc_path} ({len(wc_features)} rows)")

    summary_path = REPORTS_DIR / "dataset_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"Saved dataset summary -> {summary_path}")
    print(json.dumps(summary, indent=2, default=str))

    return summary


if __name__ == "__main__":
    build_and_save_all()
