"""Integration tests for the FastAPI app, using fastapi.testclient.

These run against the actual exported model bundle (api/app/models/,
api/app/data/), so they must run AFTER `python -m multiscore.export`.
If the bundle doesn't exist yet, the tests are skipped rather than failing
noisily (useful for running the unit-test-only subset earlier in CI).
"""

from __future__ import annotations

from pathlib import Path

import pytest

API_MODELS_DIR = Path(__file__).resolve().parents[1] / "api" / "app" / "models"
API_DATA_DIR = Path(__file__).resolve().parents[1] / "api" / "app" / "data"

pytestmark = pytest.mark.skipif(
    not (API_MODELS_DIR / "model_card.json").exists() or not (API_DATA_DIR / "shots.parquet").exists(),
    reason="Model bundle not exported yet - run `uv run python -m multiscore.export` first.",
)


@pytest.fixture(scope="module")
def client():
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_competitions_lists_la_liga_and_world_cup(client):
    resp = client.get("/competitions")
    assert resp.status_code == 200
    labels = {c["competition_label"] for c in resp.json()}
    assert "world_cup_2022" in labels


def test_matches_for_unknown_competition_404(client):
    resp = client.get("/competitions/999999/matches")
    assert resp.status_code == 404


def test_matches_and_shots_round_trip(client):
    comps = client.get("/competitions").json()
    comp_id = comps[0]["competition_id"]
    matches = client.get(f"/competitions/{comp_id}/matches").json()
    assert len(matches) > 0
    match_id = matches[0]["match_id"]

    shots = client.get(f"/matches/{match_id}/shots").json()
    assert len(shots) > 0
    for shot in shots:
        assert 0.0 <= shot["xg_geo"] <= 1.0
        assert 0.0 <= shot["xg_full"] <= 1.0


def test_match_detail_has_readable_metadata(client):
    comps = client.get("/competitions").json()
    assert comps[0]["seasons"][0]["label"]  # readable, not a bare season_id
    comp_id = comps[0]["competition_id"]
    matches = client.get(f"/competitions/{comp_id}/matches").json()
    match_id = matches[0]["match_id"]

    resp = client.get(f"/matches/{match_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["home_team"] and body["away_team"]
    assert isinstance(body["home_score"], int)
    assert body["home_xg_full"] >= 0.0


def test_match_detail_404_for_unknown_match(client):
    resp = client.get("/matches/999999999")
    assert resp.status_code == 404


def test_player_detail_returns_name_and_optional_photo(client):
    comps = client.get("/competitions").json()
    comp_id = comps[0]["competition_id"]
    matches = client.get(f"/competitions/{comp_id}/matches").json()
    shots = client.get(f"/matches/{matches[0]['match_id']}/shots").json()
    player_id = shots[0]["player_id"]

    resp = client.get(f"/players/{player_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"]
    # photo is either a well-formed object or null - both are valid (not
    # every player has a Commons photo, see multiscore.photos)
    assert body["photo"] is None or body["photo"]["thumb_url"]


def test_player_detail_404_for_unknown_player(client):
    resp = client.get("/players/999999999")
    assert resp.status_code == 404


def test_predict_returns_probability_in_range(client):
    payload = {
        "shooter_x": 108.0,
        "shooter_y": 40.0,
        "shot_body_part": "Right Foot",
        "shot_type": "Open Play",
        "freeze_frame": [
            {"x": 116.0, "y": 40.0, "teammate": False, "is_goalkeeper": True},
        ],
    }
    resp = client.post("/predict", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert 0.0 <= body["xg_geo"] <= 1.0
    assert 0.0 <= body["xg_full"] <= 1.0


def test_predict_more_defenders_lowers_xg_full(client):
    base_payload = {
        "shooter_x": 108.0,
        "shooter_y": 40.0,
        "shot_body_part": "Right Foot",
        "shot_type": "Open Play",
        "freeze_frame": [{"x": 116.0, "y": 40.0, "teammate": False, "is_goalkeeper": True}],
    }
    crowded_payload = {
        **base_payload,
        "freeze_frame": base_payload["freeze_frame"]
        + [
            {"x": 112.0, "y": 39.0, "teammate": False},
            {"x": 112.0, "y": 41.0, "teammate": False},
            {"x": 110.0, "y": 40.0, "teammate": False},
        ],
    }
    open_resp = client.post("/predict", json=base_payload).json()
    crowded_resp = client.post("/predict", json=crowded_payload).json()
    assert crowded_resp["xg_full"] <= open_resp["xg_full"]


def test_predict_rejects_too_many_players(client):
    freeze_frame = [{"x": 100.0, "y": float(i)} for i in range(25)]
    payload = {"shooter_x": 108.0, "shooter_y": 40.0, "freeze_frame": freeze_frame}
    resp = client.post("/predict", json=payload)
    assert resp.status_code == 422


def test_predict_rejects_out_of_bounds_coordinates(client):
    payload = {"shooter_x": 999.0, "shooter_y": 40.0, "freeze_frame": []}
    resp = client.post("/predict", json=payload)
    assert resp.status_code == 422


def test_model_endpoint_reports_selected_models(client):
    resp = client.get("/model")
    assert resp.status_code == 200
    body = resp.json()
    assert body["geo_model"]
    assert body["full_model"]


def test_challenge_shots_returns_n_shots_with_freeze_frame(client):
    resp = client.get("/challenge/shots?n=10")
    assert resp.status_code == 200
    shots = resp.json()
    assert len(shots) == 10
    for shot in shots:
        assert shot["freeze_frame"]
        assert shot["home_team"] and shot["away_team"]


def test_challenge_shots_balanced_has_goals_and_misses(client):
    resp = client.get("/challenge/shots?n=10&balanced=true")
    shots = resp.json()
    goals = sum(1 for s in shots if s["is_goal"] == 1)
    assert goals >= 3
    assert goals <= 7


def test_challenge_shots_rejects_out_of_range_n(client):
    resp = client.get("/challenge/shots?n=999")
    assert resp.status_code == 422


def test_players_sorted_by_goals_descending(client):
    resp = client.get("/players?sort=goals")
    assert resp.status_code == 200
    players = resp.json()
    assert len(players) > 100
    goals = [p["goals"] for p in players]
    assert goals == sorted(goals, reverse=True)


def test_players_goal_total_matches_shots_data(client):
    import pandas as pd

    players = client.get("/players").json()
    shots = pd.read_parquet(API_DATA_DIR / "shots.parquet")
    assert sum(p["goals"] for p in players) == int(shots["is_goal"].sum())


def test_players_search_filters_by_name(client):
    resp = client.get("/players?q=messi")
    players = resp.json()
    assert len(players) == 1
    assert players[0]["nickname"] == "Lionel Messi"


def test_player_detail_includes_stats_and_shots(client):
    players = client.get("/players?sort=goals").json()
    top_scorer_id = players[0]["player_id"]

    resp = client.get(f"/players/{top_scorer_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["stats"]["goals"] == players[0]["goals"]
    assert body["stats"]["shots"] == players[0]["shots"]
    assert len(body["shots"]) == players[0]["shots"]
    assert body["outcomes"]["Goal"] == players[0]["goals"]


def test_teams_covers_every_team_seen_in_matches(client):
    matches = client.get("/competitions/43/matches").json()
    resp = client.get("/teams")
    assert resp.status_code == 200
    teams = resp.json()
    all_team_names = {m["home_team"] for m in matches} | {m["away_team"] for m in matches}
    assert all_team_names.issubset(teams.keys())
    # World Cup teams are all national sides with a flag, never a club crest
    assert all(teams[name]["kind"] == "national" for name in all_team_names)


def test_teams_la_liga_clubs_all_have_a_crest(client):
    matches = client.get("/competitions/11/matches").json()
    resp = client.get("/teams")
    teams = resp.json()
    la_liga_clubs = {m["home_team"] for m in matches} | {m["away_team"] for m in matches}
    missing = [name for name in la_liga_clubs if not (teams.get(name) or {}).get("thumb_url")]
    assert not missing, f"clubs with no crest: {missing}"
    assert "Real_Madrid" in teams["Real Madrid"]["thumb_url"] or "Real Madrid" in teams["Real Madrid"]["article"]


def test_shots_carry_player_photo_url_when_available(client):
    shots = client.get("/matches/3869685/shots").json()
    messi_shots = [s for s in shots if s.get("player_nickname") == "Lionel Messi"]
    assert messi_shots, "expected at least one Messi shot in this match"
    assert any(s.get("player_photo_url") for s in messi_shots)
