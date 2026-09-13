"""Tests for cleaning and splitting logic (dataset.py).

The most important property to test is that the match-grouped split never
leaks a match across train/val/test - that is the core guard against data
leakage mentioned in the reference guide's "análisis de generalización"
section.
"""

import pandas as pd
import pytest
from multiscore.dataset import clean_shots, split_la_liga


def _make_shot_row(event_id, match_id, shot_type="Open Play", loc_x=100.0, loc_y=40.0, freeze_frame=None):
    return {
        "event_id": event_id,
        "match_id": match_id,
        "match_date": "2020-01-01",
        "competition_id": 11,
        "season_id": 90,
        "competition_label": "la_liga",
        "player": "Test Player",
        "player_id": 1,
        "team": "Test Team",
        "shot_outcome": "Off T",
        "statsbomb_xg": 0.1,
        "loc_x": loc_x,
        "loc_y": loc_y,
        "shot_type": shot_type,
        "shot_body_part": "Right Foot",
        "shot_technique": "Normal",
        "play_pattern": "Regular Play",
        "under_pressure": False,
        "shot_first_time": False,
        "shot_one_on_one": False,
        "freeze_frame": freeze_frame,
    }


def test_clean_shots_removes_penalties():
    df = pd.DataFrame(
        [
            _make_shot_row(1, 100, shot_type="Open Play"),
            _make_shot_row(2, 100, shot_type="Penalty"),
        ]
    )
    clean, stats = clean_shots(df)
    assert stats["penalties_removed"] == 1
    assert len(clean) == 1
    assert (clean["shot_type"] == "Penalty").sum() == 0


def test_clean_shots_removes_missing_location():
    df = pd.DataFrame(
        [
            _make_shot_row(1, 100, loc_x=100.0, loc_y=40.0),
            _make_shot_row(2, 100, loc_x=None, loc_y=None),
        ]
    )
    clean, stats = clean_shots(df)
    assert stats["missing_location_removed"] == 1
    assert len(clean) == 1


def test_clean_shots_removes_duplicates():
    row = _make_shot_row(1, 100)
    df = pd.DataFrame([row, row])
    clean, stats = clean_shots(df)
    assert stats["duplicates_removed"] == 1
    assert len(clean) == 1


def test_clean_shots_flags_missing_freeze_frame_without_dropping():
    df = pd.DataFrame(
        [
            _make_shot_row(1, 100, freeze_frame=[{"location": [110, 40]}]),
            _make_shot_row(2, 100, freeze_frame=None),
            _make_shot_row(3, 100, freeze_frame=[]),
        ]
    )
    clean, stats = clean_shots(df)
    assert len(clean) == 3  # nothing dropped for missing freeze frame
    assert stats["missing_freeze_frame"] == 2


def test_split_never_leaks_matches_across_splits():
    rows = []
    event_id = 0
    for match_id in range(200):
        for _ in range(5):
            rows.append(_make_shot_row(event_id, match_id))
            event_id += 1
    df = pd.DataFrame(rows)

    split_df = split_la_liga(df)

    match_to_splits = split_df.groupby("match_id")["split"].nunique()
    assert (match_to_splits == 1).all(), "Some match has shots in more than one split"

    counts = split_df["split"].value_counts(normalize=True)
    assert counts["train"] == pytest.approx(0.70, abs=0.05)
    assert counts["val"] == pytest.approx(0.15, abs=0.05)
    assert counts["test"] == pytest.approx(0.15, abs=0.05)


def test_split_is_deterministic_with_same_seed():
    rows = []
    event_id = 0
    for match_id in range(100):
        for _ in range(3):
            rows.append(_make_shot_row(event_id, match_id))
            event_id += 1
    df = pd.DataFrame(rows)

    split1 = split_la_liga(df, seed=42)
    split2 = split_la_liga(df, seed=42)
    assert (split1["split"].values == split2["split"].values).all()
