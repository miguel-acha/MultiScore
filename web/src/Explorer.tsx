// Explorer view: pick a competition -> match -> shot, see the freeze frame
// on the pitch and compare xG-geo, xG-full and StatsBomb's own xG side by
// side. Shots are sorted by |xg_diff| so the most interesting cases (where
// defender context changes the read of the shot the most) show up first.
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Competition, Match, Shot } from "./api";
import Pitch from "./Pitch";
import type { PitchPlayer } from "./Pitch";

export default function Explorer() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.competitions().then((cs) => {
      setCompetitions(cs);
      if (cs.length > 0) setCompetitionId(cs[0].competition_id);
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (competitionId == null) return;
    api.matches(competitionId).then(setMatches).catch((e) => setError(String(e)));
  }, [competitionId]);

  useEffect(() => {
    if (matchId == null) return;
    api.shots(matchId).then((s) => {
      const sorted = [...s].sort((a, b) => Math.abs(b.xg_diff) - Math.abs(a.xg_diff));
      setShots(sorted);
      setSelectedShotId(sorted[0]?.event_id ?? null);
    }).catch((e) => setError(String(e)));
  }, [matchId]);

  const selectedShot = useMemo(
    () => shots.find((s) => s.event_id === selectedShotId) ?? null,
    [shots, selectedShotId]
  );

  const pitchPlayers: PitchPlayer[] = useMemo(() => {
    if (!selectedShot?.freeze_frame) return [];
    return selectedShot.freeze_frame.map((p, i) => ({
      id: `${selectedShot.event_id}-${i}`,
      x: p.location[0],
      y: p.location[1],
      teammate: p.teammate,
      isGoalkeeper: p.position?.name === "Goalkeeper",
    }));
  }, [selectedShot]);

  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="explorer">
      <div className="controls">
        <label>
          Competición
          <select value={competitionId ?? ""} onChange={(e) => setCompetitionId(Number(e.target.value))}>
            {competitions.map((c) => (
              <option key={c.competition_id} value={c.competition_id}>
                {c.competition_label} ({c.seasons.join(", ")})
              </option>
            ))}
          </select>
        </label>
        <label>
          Partido
          <select value={matchId ?? ""} onChange={(e) => setMatchId(Number(e.target.value))}>
            <option value="">Selecciona un partido</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.match_date ?? m.match_id} · {m.n_shots} disparos, {m.n_goals} goles
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="explorer-body">
        <div className="shot-list">
          {shots.map((s) => (
            <button
              key={s.event_id}
              className={`shot-item ${s.event_id === selectedShotId ? "selected" : ""} ${s.is_goal ? "goal" : ""}`}
              onClick={() => setSelectedShotId(s.event_id)}
            >
              <strong>{s.player ?? "?"}</strong>
              <span>xG geo {s.xg_geo.toFixed(2)} · xG full {s.xg_full.toFixed(2)}</span>
              <span className="diff">Δ {s.xg_diff >= 0 ? "+" : ""}{s.xg_diff.toFixed(2)}</span>
              {s.is_goal === 1 && <span className="badge">GOL</span>}
            </button>
          ))}
        </div>

        <div className="shot-detail">
          {selectedShot ? (
            <>
              <Pitch
                shooter={{ x: selectedShot.loc_x, y: selectedShot.loc_y }}
                players={pitchPlayers}
              />
              <div className="xg-panel">
                <div className="xg-card">
                  <span>xG sin defensores</span>
                  <strong>{selectedShot.xg_geo.toFixed(3)}</strong>
                </div>
                <div className="xg-card highlight">
                  <span>xG con defensores</span>
                  <strong>{selectedShot.xg_full.toFixed(3)}</strong>
                </div>
                <div className="xg-card">
                  <span>xG StatsBomb</span>
                  <strong>{selectedShot.statsbomb_xg?.toFixed(3) ?? "N/D"}</strong>
                </div>
              </div>
              <p className="shot-meta">
                {selectedShot.shot_body_part} · {selectedShot.shot_type} · resultado: {selectedShot.shot_outcome}
              </p>
            </>
          ) : (
            <p>Selecciona un partido y un disparo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
