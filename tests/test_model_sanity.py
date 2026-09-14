"""Sanity checks for the exported production model, run against the real
predict() code path (api/app/service.py) so they catch exactly the kind of
bug that shipped in v1: an open-goal shot scoring barely above a crowded
one because of a missing-data sentinel the trees misread.

These are business-logic invariants, not statistical claims - each one
should hold for essentially any reasonable xG model, regardless of the
exact numbers it produces. Skipped if the model bundle hasn't been
exported yet (same convention as tests/test_api.py).
"""

from __future__ import annotations

from pathlib import Path

import pytest

API_MODELS_DIR = Path(__file__).resolve().parents[1] / "api" / "app" / "models"

pytestmark = pytest.mark.skipif(
    not (API_MODELS_DIR / "model_card.json").exists(),
    reason="Model bundle not exported yet - run `uv run python -m multiscore.export` first.",
)


class _Player:
    def __init__(self, x, y, teammate=False, is_goalkeeper=False):
        self.x = x
        self.y = y
        self.teammate = teammate
        self.is_goalkeeper = is_goalkeeper


class _PredictRequest:
    def __init__(self, shooter_x, shooter_y, freeze_frame=None, **kw):
        self.shooter_x = shooter_x
        self.shooter_y = shooter_y
        self.freeze_frame = freeze_frame or []
        self.shot_body_part = kw.get("shot_body_part", "Right Foot")
        self.shot_type = kw.get("shot_type", "Open Play")
        self.shot_technique = kw.get("shot_technique", "Normal")
        self.play_pattern = kw.get("play_pattern", "Regular Play")
        self.under_pressure = kw.get("under_pressure", False)
        self.first_time = kw.get("first_time", False)
        self.one_on_one = kw.get("one_on_one", False)


@pytest.fixture(scope="module")
def service():
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
    from app.service import MultiScoreService

    return MultiScoreService()


def test_open_net_close_range_scores_high(service):
    # 10m out, dead center, nobody at all in the way: this should be close
    # to a certain goal, not a coin flip.
    request = _PredictRequest(shooter_x=108.0, shooter_y=40.0, freeze_frame=[])
    result = service.predict(request)
    assert result["xg_full"] >= 0.70, f"open net at 10m scored {result['xg_full']:.3f}, expected >= 0.70"


def test_defender_on_the_shot_line_never_increases_xg(service):
    base = _PredictRequest(shooter_x=105.0, shooter_y=40.0, freeze_frame=[])
    blocked = _PredictRequest(
        shooter_x=105.0,
        shooter_y=40.0,
        freeze_frame=[_Player(x=112.0, y=40.0)],
    )
    xg_open = service.predict(base)["xg_full"]
    xg_blocked = service.predict(blocked)["xg_full"]
    assert xg_blocked <= xg_open


def test_removing_goalkeeper_never_decreases_xg(service):
    with_gk = _PredictRequest(
        shooter_x=105.0,
        shooter_y=40.0,
        freeze_frame=[_Player(x=117.0, y=40.0, is_goalkeeper=True)],
    )
    without_gk = _PredictRequest(shooter_x=105.0, shooter_y=40.0, freeze_frame=[])
    xg_with = service.predict(with_gk)["xg_full"]
    xg_without = service.predict(without_gk)["xg_full"]
    assert xg_without >= xg_with


def test_moving_closer_on_same_line_never_decreases_xg(service):
    far = _PredictRequest(shooter_x=95.0, shooter_y=40.0, freeze_frame=[])
    near = _PredictRequest(shooter_x=112.0, shooter_y=40.0, freeze_frame=[])
    xg_far = service.predict(far)["xg_full"]
    xg_near = service.predict(near)["xg_full"]
    assert xg_near >= xg_far


def test_header_scores_lower_than_foot_from_same_spot(service):
    foot = _PredictRequest(shooter_x=108.0, shooter_y=40.0, shot_body_part="Right Foot")
    header = _PredictRequest(shooter_x=108.0, shooter_y=40.0, shot_body_part="Head")
    xg_foot = service.predict(foot)["xg_full"]
    xg_header = service.predict(header)["xg_full"]
    assert xg_header <= xg_foot


def test_more_defenders_in_the_way_never_increases_xg(service):
    one_defender = _PredictRequest(
        shooter_x=100.0,
        shooter_y=40.0,
        freeze_frame=[_Player(x=110.0, y=40.0)],
    )
    three_defenders = _PredictRequest(
        shooter_x=100.0,
        shooter_y=40.0,
        freeze_frame=[
            _Player(x=110.0, y=40.0),
            _Player(x=110.0, y=38.0),
            _Player(x=110.0, y=42.0),
        ],
    )
    xg_one = service.predict(one_defender)["xg_full"]
    xg_three = service.predict(three_defenders)["xg_full"]
    assert xg_three <= xg_one
