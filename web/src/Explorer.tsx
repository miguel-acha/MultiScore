// Explorer view: pick a competition -> season -> match -> shot, see the
// freeze frame on the pitch and compare xG-geo, xG-full and StatsBomb's
// own xG side by side. Shots are sorted by |xg_diff| so the most
// interesting cases (where defender context changes the read of the shot
// the most) show up first.
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Competition, Match, Shot, Player } from "./api";
import Pitch from "./Pitch";
import type { PitchPlayer } from "./Pitch";
import Select from "./Select";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function PlayerAvatar({ player, size = 40 }: { player: Player | null; size?: number }) {
  const style = { width: size, height: size, borderRadius: "50%" };
  if (player?.photo) {
    return <img src={player.photo.thumb_url} alt={player.name} className="player-avatar-img" style={style} />;
  }
  return (
    <div className="player-avatar-fallback" style={style}>
      {player ? initials(player.nickname || player.name) : "?"}
    </div>
  );
}

export default function Explorer() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [shotPlayer, setShotPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.competitions().then((cs) => {
      setCompetitions(cs);
      if (cs.length > 0) {
        setCompetitionId(cs[0].competition_id);
        setSeasonId(cs[0].seasons[0]?.season_id ?? null);
      }
    }).catch((e) => setError(String(e)));
  }, []);

  const competition = competitions.find((c) => c.competition_id === competitionId) ?? null;

  useEffect(() => {
    if (competitionId == null) return;
    api.matches(competitionId).then(setMatches).catch((e) => setError(String(e)));
  }, [competitionId]);

  const matchesInSeason = useMemo(
    () => (seasonId == null ? matches : matches.filter((m) => m.season_id === seasonId)),
    [matches, seasonId]
  );

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

  useEffect(() => {
    setShotPlayer(null);
    if (selectedShot?.player_id != null) {
      api.player(selectedShot.player_id).then(setShotPlayer).catch(() => setShotPlayer(null));
    }
  }, [selectedShot?.player_id]);

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
          <Select
            value={competitionId != null ? String(competitionId) : ""}
            onChange={(v) => {
              const cid = Number(v);
              setCompetitionId(cid);
              const c = competitions.find((c) => c.competition_id === cid);
              setSeasonId(c?.seasons[0]?.season_id ?? null);
              setMatchId(null);
            }}
            options={competitions.map((c) => ({ value: String(c.competition_id), label: c.name }))}
          />
        </label>
        {competition && competition.seasons.length > 1 && (
          <label>
            Temporada
            <Select
              value={seasonId != null ? String(seasonId) : ""}
              onChange={(v) => { setSeasonId(Number(v)); setMatchId(null); }}
              options={competition.seasons.map((s) => ({ value: String(s.season_id), label: s.label }))}
            />
          </label>
        )}
        <label>
          Partido
          <Select
            value={matchId != null ? String(matchId) : ""}
            onChange={(v) => setMatchId(Number(v))}
            placeholder="Selecciona un partido"
            options={matchesInSeason.map((m) => ({
              value: String(m.match_id),
              label: `${m.home_team} ${m.home_score}-${m.away_score} ${m.away_team} · ${m.n_shots} disparos`,
            }))}
          />
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
              <strong>{s.player_nickname ?? s.player ?? "?"}</strong>
              <span className="shot-item-meta">{s.minute}' · {s.team}</span>
              <span>xG geo {s.xg_geo.toFixed(2)} · xG full {s.xg_full.toFixed(2)}</span>
              <span className="diff">Δ {s.xg_diff >= 0 ? "+" : ""}{s.xg_diff.toFixed(2)}</span>
              {s.is_goal === 1 && <span className="badge">GOL</span>}
            </button>
          ))}
        </div>

        <div className="shot-detail">
          {selectedShot ? (
            <>
              <div className="shot-header">
                <PlayerAvatar player={shotPlayer} />
                <div>
                  <strong>{selectedShot.player_nickname ?? selectedShot.player}</strong>
                  {selectedShot.jersey_number != null && <span className="jersey"> #{selectedShot.jersey_number}</span>}
                  <div className="shot-meta">
                    {selectedShot.team} · minuto {selectedShot.minute}
                  </div>
                </div>
              </div>
              <Pitch
                shooter={{ x: selectedShot.loc_x, y: selectedShot.loc_y }}
                players={pitchPlayers}
                goalCoveragePct={selectedShot.goal_coverage_pct ?? undefined}
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
              {shotPlayer?.photo?.artist_html && (
                <p
                  className="photo-credit"
                  dangerouslySetInnerHTML={{ __html: `Foto: ${shotPlayer.photo.artist_html} · ${shotPlayer.photo.license ?? ""}` }}
                />
              )}
            </>
          ) : (
            <p>Selecciona un partido y un disparo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
