import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { Match, Shot, Player } from "../api";
import HalfPitch from "../components/HalfPitch";
import type { PitchPlayer } from "../components/HalfPitch";
import ShotCard from "../components/ShotCard";
import PlayerAvatar from "../components/PlayerAvatar";
import TeamBadge from "../components/TeamBadge";
import XgMeter from "../components/XgMeter";

export default function MatchView() {
  const { matchId } = useParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [shotPlayer, setShotPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);
    api.match(id).then(setMatch).catch((e) => setError(String(e)));
    api
      .shots(id)
      .then((s) => {
        const sorted = [...s].sort((a, b) => Math.abs(b.xg_diff) - Math.abs(a.xg_diff));
        setShots(sorted);
        setSelectedShotId(sorted[0]?.event_id ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [matchId]);

  const selectedShot = useMemo(() => shots.find((s) => s.event_id === selectedShotId) ?? null, [shots, selectedShotId]);

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

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;
  if (!match) return <p className="text-(--color-text-dim)">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/explorar/${match.competition_id}/${match.season_id}`}
          className="interactive rounded-full border border-(--color-border) p-2 hover:border-(--color-lime)"
        >
          <ArrowLeft size={18} />
        </Link>
        <p className="text-sm text-(--color-text-dim)">{match.season_label} · {match.competition_stage ?? ""}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="clip-menu flex items-center justify-between border border-(--color-border) bg-(--color-surface) p-5"
      >
        <div className="flex flex-1 items-center gap-3">
          <TeamBadge name={match.home_team} size={44} />
          <div>
            <p className="font-medium">{match.home_team}</p>
            <p className="text-xs text-(--color-text-faint)">xG {match.home_xg_full.toFixed(2)}</p>
          </div>
        </div>
        <span className="text-stat px-4 text-4xl">
          {match.home_score}-{match.away_score}
        </span>
        <div className="flex flex-1 items-center justify-end gap-3 text-right">
          <div>
            <p className="font-medium">{match.away_team}</p>
            <p className="text-xs text-(--color-text-faint)">xG {match.away_xg_full.toFixed(2)}</p>
          </div>
          <TeamBadge name={match.away_team} size={44} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex max-h-[640px] flex-col gap-2 overflow-y-auto pr-1">
          {shots.map((s, i) => (
            <ShotCard key={s.event_id} shot={s} selected={s.event_id === selectedShotId} onClick={() => setSelectedShotId(s.event_id)} index={i} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-5">
          {selectedShot ? (
            <>
              <div className="flex w-full items-center gap-3">
                <PlayerAvatar player={shotPlayer} />
                <div>
                  <strong>{selectedShot.player_nickname ?? selectedShot.player}</strong>
                  {selectedShot.jersey_number != null && <span className="ml-1 text-(--color-text-dim)">#{selectedShot.jersey_number}</span>}
                  <div className="text-sm text-(--color-text-dim)">
                    {selectedShot.team} · minuto {selectedShot.minute}
                  </div>
                </div>
              </div>

              <HalfPitch
                shooter={{ x: selectedShot.loc_x, y: selectedShot.loc_y }}
                players={pitchPlayers}
                goalCoveragePct={selectedShot.goal_coverage_pct ?? undefined}
                shotEnd={selectedShot.shot_end_x != null && selectedShot.shot_end_y != null ? { x: selectedShot.shot_end_x, y: selectedShot.shot_end_y } : null}
              />

              <div className="flex flex-wrap justify-center gap-6">
                <XgMeter valuePct={selectedShot.xg_geo * 100} label="xG sin defensores" size={120} />
                <XgMeter valuePct={selectedShot.xg_full * 100} label="xG con defensores" size={140} />
                <XgMeter valuePct={(selectedShot.statsbomb_xg ?? 0) * 100} label="xG StatsBomb" size={120} />
              </div>

              <p className="text-center text-sm text-(--color-text-dim)">
                {selectedShot.shot_body_part} · {selectedShot.shot_type} · resultado: {selectedShot.shot_outcome}
              </p>
              {shotPlayer?.photo?.artist_html && (
                <p
                  className="text-xs text-(--color-text-faint)"
                  dangerouslySetInnerHTML={{ __html: `Foto: ${shotPlayer.photo.artist_html} · ${shotPlayer.photo.license ?? ""}` }}
                />
              )}
            </>
          ) : (
            <p className="text-(--color-text-dim)">Selecciona un disparo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
