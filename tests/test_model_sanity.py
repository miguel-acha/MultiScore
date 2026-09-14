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


# ---- empty-net-from-distance (v3.3): the model underscored an unopposed
# shot the farther it was hit from, because real "open goal" shots in the
# data are almost never a genuinely empty net at range (see
# ml/multiscore/synthetic.py) - these pin down the physically-expected
# floor at three distances an empty-net simulator preset can produce.


def _x_for_distance_m(distance_m: float) -> float:
    return 120.0 - distance_m / 0.9144


def test_empty_net_stays_high_probability_with_distance(service):
    for distance_m, floor in [(16.5, 0.85), (25.0, 0.70), (30.0, 0.55)]:
        request = _PredictRequest(shooter_x=_x_for_distance_m(distance_m), shooter_y=40.0, freeze_frame=[])
        xg = service.predict(request)["xg_full"]
        assert xg >= floor, f"empty net at {distance_m}m scored {xg:.3f}, expected >= {floor}"


def test_empty_net_xg_decreases_monotonically_with_distance(service):
    distances = [11.0, 16.5, 20.0, 25.0, 30.0, 35.0]
    xgs = [
        service.predict(_PredictRequest(shooter_x=_x_for_distance_m(d), shooter_y=40.0, freeze_frame=[]))["xg_full"]
        for d in distances
    ]
    assert xgs == sorted(xgs, reverse=True), f"empty-net xG isn't monotonically decreasing with distance: {list(zip(distances, xgs))}"


def test_goalkeeper_on_line_meaningfully_lowers_empty_net_xg(service):
    # A real goalkeeper standing on the line at a plausible shooting
    # distance should still cut the scoring probability by a wide margin -
    # confirms the synthetic empty-net augmentation didn't wash out how
    # much the goalkeeper feature itself matters.
    x = _x_for_distance_m(16.5)
    empty = _PredictRequest(shooter_x=x, shooter_y=40.0, freeze_frame=[])
    with_gk = _PredictRequest(shooter_x=x, shooter_y=40.0, freeze_frame=[_Player(x=119.0, y=40.0, is_goalkeeper=True)])
    xg_empty = service.predict(empty)["xg_full"]
    xg_with_gk = service.predict(with_gk)["xg_full"]
    assert xg_empty - xg_with_gk > 0.3, f"empty net {xg_empty:.3f} vs goalkeeper-on-line {xg_with_gk:.3f}: gap too small"


def test_synthetic_augmentation_does_not_meaningfully_hurt_real_test_metrics():
    import json
    from pathlib import Path

    train_results_path = Path(__file__).resolve().parents[1] / "reports" / "train_results.json"
    if not train_results_path.exists():
        pytest.skip("reports/train_results.json not found - run `uv run python -m multiscore.train` first.")
    with open(train_results_path) as f:
        results = json.load(f)

    selected = results["_selected_production_model"]
    ablation = results.get("_synthetic_augmentation_ablation", {})
    no_synth_key = f"{selected}_no_synthetic"
    if no_synth_key not in ablation:
        pytest.skip(f"No synthetic-augmentation ablation entry for {selected}.")

    with_synth = results[selected]["test_logloss"]
    without_synth = ablation[no_synth_key]["test_logloss"]
    assert with_synth <= without_synth + 0.005, (
        f"{selected} test_logloss with synthetic augmentation ({with_synth:.4f}) is worse than "
        f"without ({without_synth:.4f}) by more than the 0.005 tolerance"
    )


# ---- headers and a distant-but-present goalkeeper (v3.4): user screenshots
# showed a 20.9m header with the keeper still in the six-yard box scoring
# 13.5% (real headers past 16.5m score ~2-3% of the time, n=40 in La Liga)
# and a 12.9m header with the keeper off his line plus two more defenders
# in the box scoring 38.7% (real headers 12-16.5m score ~3.7%, n=458). The
# freeze frame alone doesn't carry "how much time did the keeper have to
# get across" - see ml/multiscore/geometry.gk_reach_m - so these pin the
# fix down against the exact scenarios that were wrong.


def test_header_with_goalkeeper_far_out_scores_low(service):
    # 20.9m header, keeper at the edge of the six-yard box: this was the
    # 13.5% screenshot case.
    request = _PredictRequest(
        shooter_x=_x_for_distance_m(20.9),
        shooter_y=40.0,
        shot_body_part="Head",
        freeze_frame=[_Player(x=114.5, y=40.0, is_goalkeeper=True)],
    )
    xg = service.predict(request)["xg_full"]
    assert xg <= 0.10, f"20.9m header with a keeper still in play scored {xg:.3f}, expected <= 0.10"


def test_header_with_keeper_off_line_and_crowd_scores_low(service):
    # 12.9m header, keeper pulled off-center plus two defenders in the
    # six-yard box: the 38.7% screenshot case.
    request = _PredictRequest(
        shooter_x=_x_for_distance_m(12.9),
        shooter_y=41.0,
        shot_body_part="Head",
        freeze_frame=[
            _Player(x=114.0, y=35.0, is_goalkeeper=True),
            _Player(x=116.0, y=38.5),
            _Player(x=115.5, y=42.0),
        ],
    )
    xg = service.predict(request)["xg_full"]
    assert xg <= 0.25, f"12.9m header with keeper+crowd in the box scored {xg:.3f}, expected <= 0.25"


def test_open_goal_header_loses_power_with_distance(service):
    # An unopposed header can't be hit as hard as a foot shot - far from
    # goal it should be well short of a near-certain goal, unlike the
    # equivalent foot shot which stays high (see
    # test_empty_net_stays_high_probability_with_distance).
    request = _PredictRequest(shooter_x=_x_for_distance_m(22.0), shooter_y=40.0, shot_body_part="Head", freeze_frame=[])
    xg = service.predict(request)["xg_full"]
    assert xg <= 0.30, f"open-goal header at 22m scored {xg:.3f}, expected <= 0.30"


def test_header_scores_lower_than_foot_across_goalkeeper_scenarios(service):
    scenarios = [
        (16.5, 40.0, []),
        (12.9, 40.0, [_Player(x=119.0, y=40.0, is_goalkeeper=True)]),
        (20.9, 40.0, [_Player(x=114.5, y=40.0, is_goalkeeper=True)]),
    ]
    for distance_m, y, freeze_frame in scenarios:
        x = _x_for_distance_m(distance_m)
        foot = service.predict(_PredictRequest(shooter_x=x, shooter_y=y, shot_body_part="Right Foot", freeze_frame=freeze_frame))["xg_full"]
        head = service.predict(_PredictRequest(shooter_x=x, shooter_y=y, shot_body_part="Head", freeze_frame=freeze_frame))["xg_full"]
        assert head <= foot, f"at {distance_m}m, header ({head:.3f}) scored above foot ({foot:.3f})"


def test_off_center_goalkeeper_still_lowers_a_header(service):
    # A keeper standing off to the side (outside the shot triangle, so raw
    # goal_coverage_pct barely sees him) still has time to dive across for
    # a slow header - this is what the gk_reach_coverage_pct feature exists
    # to capture (see ml/multiscore/geometry.gk_reach_m). Confirm the
    # keeper's presence is not simply invisible to the model just because
    # he isn't standing directly on the shot line.
    x = _x_for_distance_m(12.0)
    off_center_gk = [_Player(x=117.0, y=32.0, is_goalkeeper=True)]
    empty_head = service.predict(_PredictRequest(shooter_x=x, shooter_y=40.0, shot_body_part="Head", freeze_frame=[]))["xg_full"]
    with_gk_head = service.predict(_PredictRequest(shooter_x=x, shooter_y=40.0, shot_body_part="Head", freeze_frame=off_center_gk))["xg_full"]
    assert empty_head - with_gk_head > 0.05, (
        f"off-center keeper barely moved a header's xG ({empty_head:.3f} -> {with_gk_head:.3f})"
    )
