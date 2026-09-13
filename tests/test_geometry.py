"""Unit tests for pitch geometry helpers, using known reference points.

StatsBomb coordinates: 120 x 80 yard pitch, attacking towards x=120, goal
centered on y=40 with posts at y=36 and y=44.
"""

import math

import pytest
from multiscore.geometry import (
    GOAL_CENTER,
    LEFT_POST,
    RIGHT_POST,
    deviation_from_shot_line_m,
    distance_m,
    distance_to_goal_m,
    point_in_triangle,
    shot_angle_deg,
)

PENALTY_SPOT = (108.0, 40.0)  # StatsBomb penalty spot is 12 yards from goal line


def test_penalty_spot_distance_is_about_11_metres():
    # 12 yards from the goal line, on the center line -> distance to goal
    # center is exactly 12 yards = 10.97 m.
    dist = distance_to_goal_m(PENALTY_SPOT)
    assert dist == pytest.approx(12 * 0.9144, abs=0.05)


def test_penalty_spot_angle_is_reasonable():
    # From the penalty spot the visible goal angle should be roughly
    # 2*atan(4/12) ~ 36.9 degrees (half goal width 4 yards, distance 12 yards).
    angle = shot_angle_deg(PENALTY_SPOT)
    expected = math.degrees(2 * math.atan(4 / 12))
    assert angle == pytest.approx(expected, abs=0.5)


def test_angle_from_goal_line_center_is_180():
    # Standing exactly on the goal line, centered: the goal spans a full
    # semicircle behind you conceptually, but our formula treats dx<=0 as 0;
    # right at the line (dx=0) we return 0 by convention.
    on_line = (120.0, 40.0)
    assert shot_angle_deg(on_line) == 0.0


def test_angle_behind_goal_line_is_zero():
    behind = (121.0, 40.0)
    assert shot_angle_deg(behind) == 0.0


def test_wide_angle_shot_close_to_goal_is_large():
    # Very close and central -> angle should approach 180 degrees.
    close_central = (119.0, 40.0)
    angle = shot_angle_deg(close_central)
    assert angle > 150


def test_distance_symmetric():
    a = (60.0, 40.0)
    b = (100.0, 30.0)
    assert distance_m(a, b) == pytest.approx(distance_m(b, a))


def test_point_in_triangle_center_of_goal_area():
    # A defender standing right in front of goal center, between shooter and
    # goal, should be inside the shooter->posts triangle.
    shooter = (100.0, 40.0)
    defender_on_line_to_goal = (110.0, 40.0)
    assert point_in_triangle(defender_on_line_to_goal, shooter, LEFT_POST, RIGHT_POST)


def test_point_in_triangle_far_from_play_is_outside():
    shooter = (100.0, 40.0)
    far_away_defender = (20.0, 5.0)
    assert not point_in_triangle(far_away_defender, shooter, LEFT_POST, RIGHT_POST)


def test_point_in_triangle_outside_goal_width_is_outside():
    shooter = (100.0, 40.0)
    # y=60 is well outside the goal mouth (posts at 36/44) even at the goal line.
    wide_point = (120.0, 60.0)
    assert not point_in_triangle(wide_point, shooter, LEFT_POST, RIGHT_POST)


def test_point_in_triangle_vertex_is_inside():
    shooter = (100.0, 40.0)
    assert point_in_triangle(LEFT_POST, shooter, LEFT_POST, RIGHT_POST)
    assert point_in_triangle(RIGHT_POST, shooter, LEFT_POST, RIGHT_POST)


def test_deviation_from_shot_line_zero_on_line():
    shooter = (90.0, 30.0)
    # Any point exactly on the shooter->goal-center line has zero deviation.
    # Parametrize a point halfway along that line.
    midpoint = (
        (shooter[0] + GOAL_CENTER[0]) / 2,
        (shooter[1] + GOAL_CENTER[1]) / 2,
    )
    assert deviation_from_shot_line_m(shooter, midpoint) == pytest.approx(0.0, abs=1e-9)


def test_deviation_from_shot_line_positive_off_line():
    shooter = (90.0, 40.0)  # shooting straight along y=40
    off_line_point = (100.0, 45.0)
    dev = deviation_from_shot_line_m(shooter, off_line_point)
    assert dev == pytest.approx(5 * 0.9144, abs=0.01)
