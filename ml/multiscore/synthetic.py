"""Synthetic empty-net training rows: augments the "full" model's TRAINING
split only (never val/test/external_test) with shots where nobody stands
between the shooter and the goal at all.

Why this exists: in the real La Liga data, `open_goal_geometric == 1` almost
never means a genuinely empty net from distance - it's usually a goalkeeper
recovering just outside the triangle, or a freeze frame that's missing the
keeper. There are only 684 such rows total, and just 31 of them are past
16m. The simulator's "drag everyone away and shoot from 27m" scenario -
nobody within 40m, no pressure - essentially never occurs in training data,
so the trees never learned it and scored it as barely-better-than-a-
crowded-shot (27m empty net: 16% instead of a near-certain goal).

The fix is not to invent goal/no-goal outcomes (a coin flip has no ground
truth) but to encode the one thing that genuinely IS certain here: shooting
accuracy. A shooter aiming at the center of an open goal misses by a random
angle; the probability the ball still lands between the posts is exactly
the angular width of the goal (as seen from the shooter) integrated over
that error distribution - textbook shot-accuracy geometry, independent of
any StatsBomb label. Each synthetic point is added twice, once as a
"goal" example weighted by that probability and once as a "no goal" example
weighted by its complement (soft labels via sample_weight), which trains
the model on the correct EXPECTED outcome without ever asserting a specific
shot "was" a goal it didn't actually see happen.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm

from multiscore.features import defender_features_from_freeze_frame, geo_features_from_row
from multiscore.geometry import GOAL_CENTER, LEFT_POST, RIGHT_POST


def _bearing_deg(origin: tuple[float, float], point: tuple[float, float]) -> float:
    dx = point[0] - origin[0]
    dy = point[1] - origin[1]
    return math.degrees(math.atan2(dy, dx))


def empty_net_probability(x: float, y: float, is_head: bool, cfg: dict) -> float:
    """P(goal) for an unopposed shot from (x, y) at an empty goal: the
    shooter aims at the goal center and the actual shot direction deviates
    by a random angle ~ N(0, sigma), sigma depending on body part. The
    probability of scoring is exactly the probability that error angle
    still lands the shot between the posts, minus a flat mishit rate.
    """
    shooter = (x, y)
    aim = _bearing_deg(shooter, GOAL_CENTER)
    left = _bearing_deg(shooter, LEFT_POST) - aim
    right = _bearing_deg(shooter, RIGHT_POST) - aim
    lo, hi = sorted((left, right))
    sigma = cfg["sigma_head_deg"] if is_head else cfg["sigma_foot_deg"]
    p = norm.cdf(hi / sigma) - norm.cdf(lo / sigma)
    p *= 1 - cfg["mishit"]
    return float(np.clip(p, 0.0, 1.0))


def build_synthetic_empty_net(cfg: dict, seed: int = 42) -> pd.DataFrame:
    """Returns a DataFrame of 2*n rows (already feature-extracted, ready to
    concatenate onto the "full" feature set's training frame): each of the
    n sampled positions appears once as a soft-weighted goal and once as a
    soft-weighted miss. Columns: every "full" feature column, plus
    `is_goal`, `sample_weight`, `is_synthetic`.
    """
    n = cfg["n"]
    rng = np.random.default_rng(seed)
    xs = rng.uniform(85.0, 118.0, size=n)
    ys = np.clip(40.0 + rng.normal(0.0, 10.0, size=n), 6.0, 74.0)
    is_head = rng.random(n) < 0.2

    rows = []
    for x, y, head in zip(xs, ys, is_head):
        raw = pd.Series(
            {
                "loc_x": x,
                "loc_y": y,
                "shot_body_part": "Head" if head else "Right Foot",
                "shot_type": "Open Play",
                "shot_technique": "Normal",
                "play_pattern": "Regular Play",
                "under_pressure": False,
                "shot_first_time": False,
                "shot_one_on_one": False,
            }
        )
        geo = geo_features_from_row(raw)
        # Empty list (not None): "we have freeze-frame data and it
        # confirms nobody's there", same convention as a live /predict
        # call with every defender dragged away - see features.py.
        defenders = defender_features_from_freeze_frame((x, y), [])
        p = empty_net_probability(x, y, bool(head), cfg)
        rows.append({**geo, **defenders, "_p_goal": p})

    weight_multiplier = cfg.get("weight", 1.0)
    df = pd.DataFrame(rows)
    pos = df.copy()
    pos["is_goal"] = 1
    pos["sample_weight"] = pos.pop("_p_goal") * weight_multiplier
    neg = df.copy()
    neg["is_goal"] = 0
    neg["sample_weight"] = (1.0 - neg.pop("_p_goal")) * weight_multiplier

    out = pd.concat([pos, neg], ignore_index=True)
    out["is_synthetic"] = True
    return out
