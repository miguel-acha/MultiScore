"""Pydantic request/response models for the MultiScore API."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

PITCH_X_MAX = 120.0
PITCH_Y_MAX = 80.0


class FreezeFramePlayer(BaseModel):
    x: float = Field(..., ge=0, le=PITCH_X_MAX)
    y: float = Field(..., ge=0, le=PITCH_Y_MAX)
    teammate: bool = False
    is_goalkeeper: bool = False


class PredictRequest(BaseModel):
    shooter_x: float = Field(..., ge=0, le=PITCH_X_MAX)
    shooter_y: float = Field(..., ge=0, le=PITCH_Y_MAX)
    shot_body_part: str = "Right Foot"
    shot_type: str = "Open Play"
    shot_technique: str = "Normal"
    play_pattern: str = "Regular Play"
    under_pressure: bool = False
    first_time: bool = False
    one_on_one: bool = False
    freeze_frame: list[FreezeFramePlayer] = Field(default_factory=list, max_length=21)

    @field_validator("freeze_frame")
    @classmethod
    def check_player_count(cls, v):
        if len(v) > 21:
            raise ValueError("freeze_frame cannot have more than 21 other players")
        return v


class PredictResponse(BaseModel):
    xg_geo: float
    xg_full: float
    xg_diff: float
    computed_features: dict


class ShotOut(BaseModel):
    event_id: str
    match_id: int
    player: str | None
    team: str | None
    shot_outcome: str | None
    is_goal: int
    statsbomb_xg: float | None
    xg_geo: float
    xg_full: float
    xg_diff: float
    loc_x: float
    loc_y: float
    shot_body_part: str | None
    shot_type: str | None
    freeze_frame: list | None


class MatchOut(BaseModel):
    match_id: int
    match_date: str | None
    competition_id: int
    season_id: int
    competition_label: str
    n_shots: int
    n_goals: int


class CompetitionOut(BaseModel):
    competition_id: int
    competition_label: str
    seasons: list[int]


class HealthOut(BaseModel):
    status: str
    model_version: str


class ModelInfoOut(BaseModel):
    geo_model: str
    full_model: str
    full_model_calibrated: bool
    metrics: dict
