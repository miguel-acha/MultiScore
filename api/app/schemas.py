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
    minute: int | None = None
    period: int | None = None
    player: str | None
    player_id: int | None = None
    player_nickname: str | None = None
    jersey_number: int | None = None
    team: str | None
    shot_outcome: str | None
    is_goal: int
    statsbomb_xg: float | None
    xg_geo: float
    xg_full: float
    xg_diff: float
    goal_coverage_pct: float | None = None
    loc_x: float
    loc_y: float
    shot_end_x: float | None = None
    shot_end_y: float | None = None
    shot_end_z: float | None = None
    shot_body_part: str | None
    shot_type: str | None
    freeze_frame: list | None


class ChallengeShotOut(ShotOut):
    home_team: str | None = None
    away_team: str | None = None


class MatchOut(BaseModel):
    match_id: int
    match_date: str | None
    competition_id: int
    season_id: int
    competition_label: str
    season_label: str
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    competition_stage: str | None = None
    stadium: str | None = None
    home_xg_full: float
    away_xg_full: float
    n_shots: int
    n_goals: int


class SeasonOut(BaseModel):
    season_id: int
    label: str


class CompetitionOut(BaseModel):
    competition_id: int
    competition_label: str
    name: str
    seasons: list[SeasonOut]


class PlayerPhotoOut(BaseModel):
    thumb_url: str
    license: str | None = None
    artist_html: str | None = None


class PlayerStatsOut(BaseModel):
    shots: int
    goals: int
    xg_total: float
    xg_per_shot: float
    goals_minus_xg: float
    on_target_pct: float
    matches: int
    team: str | None = None


class PlayerListItemOut(PlayerStatsOut):
    player_id: int
    name: str
    nickname: str | None = None
    photo: PlayerPhotoOut | None = None


class PlayerOut(BaseModel):
    player_id: int
    name: str
    nickname: str | None = None
    jersey_number: int | None = None
    photo: PlayerPhotoOut | None = None
    stats: PlayerStatsOut | None = None
    outcomes: dict[str, int] | None = None
    shots: list[ShotOut] | None = None


class TeamCrestOut(BaseModel):
    kind: str
    thumb_url: str | None = None
    license: str | None = None
    artist_html: str | None = None
    wikidata_id: str | None = None
    iso2: str | None = None


class HealthOut(BaseModel):
    status: str
    model_version: str


class ModelInfoOut(BaseModel):
    geo_model: str
    full_model: str
    full_model_calibrated: bool
    metrics: dict
