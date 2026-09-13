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
    CompetitionOut,
    HealthOut,
    MatchOut,
    ModelInfoOut,
    PredictRequest,
    PredictResponse,
    ShotOut,
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


@app.get("/matches/{match_id}/shots", response_model=list[ShotOut])
def shots(match_id: int):
    rows = service.get_shots(match_id)
    if not rows:
        raise HTTPException(status_code=404, detail="No shots found for this match")
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
