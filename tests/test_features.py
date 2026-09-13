"""Unit tests for feature extraction, covering the defender/freeze-frame
logic that is the core technical contribution of the project.
"""

import pandas as pd
import pytest
from multiscore.features import (
    NO_FREEZE_FRAME_SENTINEL,
    build_feature_row,
    defender_features_from_freeze_frame,
    geo_features_from_row,
)


def _ff_entry(x, y, teammate=False, position="Center Back"):
    return {
        "location": [x, y],
        "player": {"id": 1, "name": "Test Player"},
        "position": {"id": 1, "name": position},
        "teammate": teammate,
    }


def test_empty_freeze_frame_returns_sentinels():
    result = defender_features_from_freeze_frame((100.0, 40.0), None)
    assert result["has_freeze_frame"] is False
    assert result["defenders_in_triangle"] == NO_FREEZE_FRAME_SENTINEL
    assert result["nearest_defender_dist_m"] == NO_FREEZE_FRAME_SENTINEL
    assert result["goalkeeper_present"] == 0


def test_empty_list_freeze_frame_returns_sentinels():
    result = defender_features_from_freeze_frame((100.0, 40.0), [])
    assert result["has_freeze_frame"] is False


def test_defender_directly_in_front_of_goal_counts_in_triangle():
    shooter = (100.0, 40.0)
    freeze_frame = [_ff_entry(110.0, 40.0)]  # right between shooter and goal
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["has_freeze_frame"] is True
    assert result["defenders_in_triangle"] == 1
    assert result["nearest_defender_dist_m"] == pytest.approx(
        10 * 0.9144, abs=0.01
    )


def test_defender_far_from_play_not_in_triangle():
    shooter = (100.0, 40.0)
    freeze_frame = [_ff_entry(20.0, 5.0)]
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["defenders_in_triangle"] == 0


def test_teammates_counted_separately_from_defenders():
    shooter = (100.0, 40.0)
    freeze_frame = [
        _ff_entry(110.0, 40.0, teammate=False),
        _ff_entry(112.0, 40.0, teammate=True),
    ]
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["defenders_in_triangle"] == 1
    assert result["teammates_in_triangle"] == 1


def test_goalkeeper_detected_and_flagged():
    shooter = (100.0, 40.0)
    freeze_frame = [
        _ff_entry(118.0, 40.0, position="Goalkeeper"),
        _ff_entry(110.0, 42.0, position="Center Back"),
    ]
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["goalkeeper_present"] == 1
    assert result["gk_in_triangle"] == 1
    assert result["gk_distance_to_goal_line_m"] == pytest.approx(2 * 0.9144, abs=0.01)


def test_no_goalkeeper_in_freeze_frame():
    shooter = (100.0, 40.0)
    freeze_frame = [_ff_entry(110.0, 40.0, position="Center Back")]
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["goalkeeper_present"] == 0
    assert result["gk_distance_to_shooter_m"] == NO_FREEZE_FRAME_SENTINEL


def test_defenders_within_distance_thresholds():
    shooter = (100.0, 40.0)
    close_defender_m = 0.5 / 0.9144  # 0.5 metres away in yards
    freeze_frame = [
        {
            "location": [100.0 + close_defender_m, 40.0],
            "player": {"id": 1, "name": "Close"},
            "position": {"id": 1, "name": "Center Back"},
            "teammate": False,
        },
        _ff_entry(110.0, 40.0),  # ~9.1m away
    ]
    result = defender_features_from_freeze_frame(shooter, freeze_frame)
    assert result["defenders_within_1m"] == 1
    assert result["defenders_within_3m"] == 1  # only the close one is < 3m


def test_geo_features_from_row_basic():
    row = pd.Series(
        {
            "loc_x": 108.0,
            "loc_y": 40.0,
            "shot_body_part": "Right Foot",
            "shot_type": "Open Play",
            "shot_technique": "Normal",
            "play_pattern": "Regular Play",
            "under_pressure": True,
            "shot_first_time": False,
            "shot_one_on_one": False,
        }
    )
    result = geo_features_from_row(row)
    assert result["distance_to_goal_m"] == pytest.approx(12 * 0.9144, abs=0.05)
    assert result["shot_body_part"] == "Right Foot"
    assert result["under_pressure"] is True


def test_build_feature_row_combines_both_blocks():
    row = pd.Series(
        {
            "loc_x": 108.0,
            "loc_y": 40.0,
            "shot_body_part": "Right Foot",
            "shot_type": "Open Play",
            "shot_technique": "Normal",
            "play_pattern": "Regular Play",
            "under_pressure": False,
            "shot_first_time": False,
            "shot_one_on_one": False,
            "freeze_frame": [_ff_entry(112.0, 40.0, position="Goalkeeper")],
        }
    )
    result = build_feature_row(row)
    assert "distance_to_goal_m" in result
    assert "defenders_in_triangle" in result
    assert result["goalkeeper_present"] == 1
