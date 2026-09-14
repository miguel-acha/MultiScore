// Thin fetch wrapper around the MultiScore API.
// The base URL comes from VITE_API_URL (set on Vercel to the Cloud Run
// URL); it falls back to localhost for local development against
// `uvicorn app.main:app --reload` in api/.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

export interface Season {
  season_id: number;
  label: string;
}

export interface Competition {
  competition_id: number;
  competition_label: string;
  name: string;
  seasons: Season[];
}

export interface Match {
  match_id: number;
  match_date: string | null;
  competition_id: number;
  season_id: number;
  competition_label: string;
  season_label: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  competition_stage: string | null;
  stadium: string | null;
  home_xg_full: number;
  away_xg_full: number;
  n_shots: number;
  n_goals: number;
}

export interface FreezeFramePlayer {
  location: [number, number];
  player?: { id: number; name: string };
  position?: { name: string };
  teammate: boolean;
}

export interface Shot {
  event_id: string;
  match_id: number;
  minute: number | null;
  period: number | null;
  player: string | null;
  player_id: number | null;
  player_nickname: string | null;
  jersey_number: number | null;
  team: string | null;
  shot_outcome: string | null;
  is_goal: number;
  statsbomb_xg: number | null;
  xg_geo: number;
  xg_full: number;
  xg_diff: number;
  goal_coverage_pct: number | null;
  loc_x: number;
  loc_y: number;
  shot_end_x: number | null;
  shot_end_y: number | null;
  shot_end_z: number | null;
  shot_body_part: string | null;
  shot_type: string | null;
  freeze_frame: FreezeFramePlayer[] | null;
}

export interface PlayerPhoto {
  thumb_url: string;
  license: string | null;
  artist_html: string | null;
}

export interface Player {
  player_id: number;
  name: string;
  nickname: string | null;
  photo: PlayerPhoto | null;
}

export interface PredictRequestPlayer {
  x: number;
  y: number;
  teammate?: boolean;
  is_goalkeeper?: boolean;
}

export interface PredictRequest {
  shooter_x: number;
  shooter_y: number;
  shot_body_part?: string;
  shot_type?: string;
  shot_technique?: string;
  play_pattern?: string;
  under_pressure?: boolean;
  first_time?: boolean;
  one_on_one?: boolean;
  freeze_frame: PredictRequestPlayer[];
}

export interface PredictResponse {
  xg_geo: number;
  xg_full: number;
  xg_diff: number;
  computed_features: Record<string, number>;
}

export interface ModelInfo {
  geo_model: string;
  full_model: string;
  full_model_calibrated: boolean;
  metrics: Record<string, any>;
}

export interface ChallengeShot extends Shot {
  home_team: string | null;
  away_team: string | null;
}

export const api = {
  health: () => request<{ status: string; model_version: string }>("/health"),
  competitions: () => request<Competition[]>("/competitions"),
  matches: (competitionId: number) => request<Match[]>(`/competitions/${competitionId}/matches`),
  match: (matchId: number) => request<Match>(`/matches/${matchId}`),
  shots: (matchId: number) => request<Shot[]>(`/matches/${matchId}/shots`),
  player: (playerId: number) => request<Player>(`/players/${playerId}`),
  predict: (payload: PredictRequest) =>
    request<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(payload) }),
  modelInfo: () => request<ModelInfo>("/model"),
  challengeShots: (n = 10, balanced = true) =>
    request<ChallengeShot[]>(`/challenge/shots?n=${n}&balanced=${balanced}`),
};
