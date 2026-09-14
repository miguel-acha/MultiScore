"""MultiScore API: FastAPI application exposing precomputed shot xG data
plus a live /predict endpoint used by the web app's interactive simulator.
"""

from __future__ import annotations

import math
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    ChallengeShotOut,
    CompetitionOut,
    HealthOut,
    MatchOut,
    ModelInfoOut,
    PlayerListItemOut,
    PlayerOut,
    PredictRequest,
    PredictResponse,
    ShotOut,
    TeamCrestOut,
)
from app.service import MultiScoreService

API_VERSION = "0.1.0"

service: MultiScoreService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global service
    service = MultiScoreService()
    yield


app = FastAPI(title="MultiScore API", version=API_VERSION, lifespan=lifespan)

allowed_origins = os.environ.get("MULTISCORE_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _clean_nan(obj):
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


@app.get("/health", response_model=HealthOut)
def health():
    return {"status": "ok", "model_version": API_VERSION}


@app.get("/competitions", response_model=list[CompetitionOut])
def competitions():
    return service.list_competitions()


@app.get("/competitions/{competition_id}/matches", response_model=list[MatchOut])
def matches(competition_id: int):
    rows = service.list_matches(competition_id)
    if not rows:
        raise HTTPException(status_code=404, detail="No matches found for this competition")
    return [_clean_nan(r) for r in rows]


@app.get("/matches/{match_id}", response_model=MatchOut)
def match_detail(match_id: int):
    row = service.get_match(match_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return _clean_nan(row)


@app.get("/matches/{match_id}/shots", response_model=list[ShotOut])
def shots(match_id: int):
    rows = service.get_shots(match_id)
    if not rows:
        raise HTTPException(status_code=404, detail="No shots found for this match")
    return [_clean_nan(r) for r in rows]


@app.get("/players", response_model=list[PlayerListItemOut])
def players(q: str | None = None, competition_id: int | None = None, sort: str = "goals"):
    if sort not in {"goals", "xg", "shots", "overperf"}:
        raise HTTPException(status_code=422, detail="sort must be one of: goals, xg, shots, overperf")
    return [_clean_nan(r) for r in service.list_players(q=q, competition_id=competition_id, sort=sort)]


@app.get("/players/{player_id}", response_model=PlayerOut)
def player_detail(player_id: int):
    row = service.get_player(player_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Player not found")
    return _clean_nan(row)


@app.get("/teams", response_model=dict[str, TeamCrestOut | None])
def teams():
    return service.get_teams()


@app.get("/challenge/shots", response_model=list[ChallengeShotOut])
def challenge_shots(n: int = 10, balanced: bool = True, seed: int | None = None):
    if not 1 <= n <= 30:
        raise HTTPException(status_code=422, detail="n must be between 1 and 30")
    rows = service.random_shots(n=n, balanced=balanced, seed=seed)
    if not rows:
        raise HTTPException(status_code=404, detail="No shots with freeze frame available")
    return [_clean_nan(r) for r in rows]


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    return service.predict(request)


@app.get("/model", response_model=ModelInfoOut)
def model_info():
    card = service.model_info()
    return {
        "geo_model": card["geo_model"],
        "full_model": card["full_model"],
        "full_model_calibrated": card["full_model_calibrated"],
        "metrics": card["train_results_summary"],
    }
