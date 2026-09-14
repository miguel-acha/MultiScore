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


OBSTACLE_HALF_WIDTH_M = 0.25  # ~half a person's shoulder width


def goal_shadow_interval(
    shooter: tuple[float, float],
    obstacle: tuple[float, float],
    half_width_m: float = OBSTACLE_HALF_WIDTH_M,
) -> tuple[float, float] | None:
    """The y-interval (in StatsBomb y units, at x=GOAL_X) that `obstacle`
    blocks as seen from `shooter` - i.e. its projected "shadow" on the goal
    line, treating the obstacle as a body `half_width_m`*2 wide.

    Returns None if the obstacle can't cast a shadow on the goal line at
    all (it's behind or level with the shooter, so it isn't between the
    shooter and the goal).
    """
    sx, sy = shooter
    ox, oy = obstacle
    if ox <= sx:
        return None

    t = (GOAL_X - sx) / (ox - sx)
    if t <= 0:
        return None

    projected_y = sy + t * (oy - sy)
    half_width_yd = (half_width_m / YARD_TO_M) * t
    return (projected_y - half_width_yd, projected_y + half_width_yd)


# A standing goalkeeper's body blocks a fixed ~0.25m like any other
# obstacle, but that's only true the instant the ball arrives - by the
# time a real shot reaches the keeper they've had time to react and dive,
# covering far more of the goal than their standing width. That reaction
# window is bigger the longer the ball takes to arrive, so a slow header
# lets a keeper who started "beaten" get across in time, while a fast
# first-time strike does not. This is why "GK on the six-yard line, 21m
# header" and "GK on the six-yard line, 21m half-volley" have very
# different real save rates even though the geometric freeze-frame
# snapshot looks identical.
BALL_SPEED_FOOT_MPS = 25.0
BALL_SPEED_HEAD_MPS = 12.0
GK_STANDING_REACH_M = 1.0
GK_DIVE_SPEED_MPS = 4.5
GK_REACTION_S = 0.2
GK_MAX_REACH_M = 3.0


def gk_reach_m(shooter: tuple[float, float], goalkeeper: tuple[float, float], is_head: bool) -> float:
    """How far (metres, to each side) the goalkeeper can realistically
    cover by the time the ball arrives, given how much time the shot's
    flight time gives them to react and dive from their current position.
    """
    ball_speed = BALL_SPEED_HEAD_MPS if is_head else BALL_SPEED_FOOT_MPS
    flight_time_s = distance_m(shooter, goalkeeper) / ball_speed
    dive_time_s = max(0.0, flight_time_s - GK_REACTION_S)
    reach = GK_STANDING_REACH_M + GK_DIVE_SPEED_MPS * dive_time_s
    return min(reach, GK_MAX_REACH_M)


def gk_reach_coverage_pct(
    shooter: tuple[float, float],
    goalkeeper: tuple[float, float] | None,
    is_head: bool,
) -> float:
    """Percentage (0-100) of the goal mouth width the goalkeeper alone can
    reach in time, independent of defenders - see `gk_reach_m`. 0 if there
    is no goalkeeper in the freeze frame.
    """
    if goalkeeper is None:
        return 0.0
    reach = gk_reach_m(shooter, goalkeeper, is_head)
    shadow = goal_shadow_interval(shooter, goalkeeper, half_width_m=reach)
    if shadow is None:
        return 0.0
    lo, hi = shadow
    lo = max(lo, GOAL_Y_LEFT_POST)
    hi = min(hi, GOAL_Y_RIGHT_POST)
    if hi <= lo:
        return 0.0
    goal_width = GOAL_Y_RIGHT_POST - GOAL_Y_LEFT_POST
    return ((hi - lo) / goal_width) * 100.0


def goal_coverage_pct(
    shooter: tuple[float, float], obstacles: list[tuple[float, float]]
) -> float:
    """Percentage (0-100) of the goal mouth width that is blocked by the
    given obstacles (defenders/goalkeeper), as seen from the shooter.

    Each obstacle casts a "shadow" (see goal_shadow_interval) on the goal
    line; overlapping shadows are merged so a crowd of defenders standing
    behind one another doesn't get double-counted.
    """
    intervals = []
    for obstacle in obstacles:
        shadow = goal_shadow_interval(shooter, obstacle)
        if shadow is None:
            continue
        lo, hi = shadow
        lo = max(lo, GOAL_Y_LEFT_POST)
        hi = min(hi, GOAL_Y_RIGHT_POST)
        if hi > lo:
            intervals.append((lo, hi))

    if not intervals:
        return 0.0

    intervals.sort()
    merged_length = 0.0
    cur_lo, cur_hi = intervals[0]
    for lo, hi in intervals[1:]:
        if lo <= cur_hi:
            cur_hi = max(cur_hi, hi)
        else:
            merged_length += cur_hi - cur_lo
            cur_lo, cur_hi = lo, hi
    merged_length += cur_hi - cur_lo

    goal_width = GOAL_Y_RIGHT_POST - GOAL_Y_LEFT_POST
    return (merged_length / goal_width) * 100.0


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
