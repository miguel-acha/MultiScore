"""Pitch geometry helpers, all in StatsBomb coordinates (120 x 80 yards).

StatsBomb's coordinate system always attacks towards x=120. The goal is
centered on y=40, with posts at y=36 and y=44 (goal width = 8 yards, the
real-world 7.32 m goal expressed in StatsBomb units).

Every distance-returning function here outputs metres (1 yard = 0.9144 m),
since metres are what gets reported and interpreted in the document.
"""

from __future__ import annotations

import math

YARD_TO_M = 0.9144

GOAL_X = 120.0
GOAL_Y_CENTER = 40.0
GOAL_Y_LEFT_POST = 36.0
GOAL_Y_RIGHT_POST = 44.0

LEFT_POST = (GOAL_X, GOAL_Y_LEFT_POST)
RIGHT_POST = (GOAL_X, GOAL_Y_RIGHT_POST)
GOAL_CENTER = (GOAL_X, GOAL_Y_CENTER)


def distance_m(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Euclidean distance between two points, in metres."""
    dx = p1[0] - p2[0]
    dy = p1[1] - p2[1]
    return math.hypot(dx, dy) * YARD_TO_M


def distance_to_goal_m(point: tuple[float, float]) -> float:
    """Distance from a point to the center of the goal, in metres."""
    return distance_m(point, GOAL_CENTER)


def shot_angle_deg(point: tuple[float, float]) -> float:
    """Angle (in degrees) subtended by the goal mouth as seen from `point`.

    This is the classic xG "shot angle": the angle between the lines from
    the shooter to each goal post. Larger angle = more of the goal is
    visible = easier shot, all else equal.
    """
    x, y = point
    dx = GOAL_X - x
    if dx <= 0:
        # Behind or on the goal line: angle is effectively 0 (or undefined,
        # treated as 0 since scoring from there is exceptional).
        return 0.0

    dy_left = GOAL_Y_LEFT_POST - y
    dy_right = GOAL_Y_RIGHT_POST - y

    angle_left = math.atan2(dy_left, dx)
    angle_right = math.atan2(dy_right, dx)

    angle = abs(angle_left - angle_right)
    # atan2 can wrap; keep the angle in [0, pi]
    if angle > math.pi:
        angle = 2 * math.pi - angle
    return math.degrees(angle)


def point_in_triangle(
    p: tuple[float, float],
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
) -> bool:
    """True if point p lies inside (or on the edge of) triangle abc.

    Uses the sign-of-cross-product (barycentric) test, robust to any vertex
    ordering.
    """

    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign(p, a, b)
    d2 = sign(p, b, c)
    d3 = sign(p, c, a)

    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)

    return not (has_neg and has_pos)


def shot_triangle(shooter: tuple[float, float]) -> tuple:
    """The triangle (shooter, left post, right post) used to test whether a
    defender/goalkeeper/teammate is 'in the way' of the shot.
    """
    return (shooter, LEFT_POST, RIGHT_POST)


def deviation_from_shot_line_m(
    shooter: tuple[float, float], point: tuple[float, float]
) -> float:
    """Perpendicular distance (metres) from `point` to the line shooter->goal
    center. Used e.g. to see how far off-line the goalkeeper is positioned.
    """
    x1, y1 = shooter
    x2, y2 = GOAL_CENTER
    x0, y0 = point

    num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    den = math.hypot(x2 - x1, y2 - y1)
    if den == 0:
        return 0.0
    return (num / den) * YARD_TO_M
