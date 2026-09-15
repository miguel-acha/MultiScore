import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { Match, Shot } from "../api";
import HalfPitch from "../components/HalfPitch";
import type { PitchPlayer } from "../components/HalfPitch";
import ShotCard from "../components/ShotCard";
import MatchTimeline from "../components/MatchTimeline";
import PlayerAvatar from "../components/PlayerAvatar";
import TeamBadge from "../components/TeamBadge";
import XgMeter from "../components/XgMeter";
import Skeleton from "../components/Skeleton";
import { outcomeStyle } from "../lib/outcomes";

export default function MatchView() {
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    const id = Number(matchId);
    api.match(id).then(setMatch).catch((e) => setError(String(e)));
    api
      .shots(id)
      .then((s) => {
        // Chronological, so the list reads like the match actually
        // unfolded instead of jumping to whichever shot had the biggest
        // defender effect first.
        const sorted = [...s].sort((a, b) => (a.period ?? 0) - (b.period ?? 0) || (a.minute ?? 0) - (b.minute ?? 0));
        setShots(sorted);
        // ?tiro=<event_id> lets a link from the player page jump straight
        // to a specific shot; otherwise default to the first of the match.
        const requested = searchParams.get("tiro");
        const requestedExists = requested && sorted.some((s) => s.event_id === requested);
        setSelectedShotId(requestedExists ? requested : sorted[0]?.event_id ?? null);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const selectedShot = useMemo(() => shots.find((s) => s.event_id === selectedShotId) ?? null, [shots, selectedShotId]);

  function selectShot(eventId: string) {
    // No scrollIntoView here on purpose: it used to also drag the outer
    // page scroll position along whenever the target list item wasn't
    // fully within the viewport, not just the shot list's own scroll
    // container - jarring while stepping through shots with the
    // timeline's arrows. The selected item still gets a visible highlight
    // (ShotCard's `selected` styling) without moving the screen.
    setSelectedShotId(eventId);
  }

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
  if (!match) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[500px] w-full" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      </div>
    );
  }

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
          <TeamBadge name={match.home_team} size="lg" />
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
          <TeamBadge name={match.away_team} size="lg" />
        </div>
      </motion.div>

      <MatchTimeline match={match} shots={shots} selectedShotId={selectedShotId} onSelect={selectShot} />

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
                <PlayerAvatar photoUrl={selectedShot.player_photo_url} name={selectedShot.player_nickname ?? selectedShot.player ?? ""} size="md" jerseyNumber={selectedShot.jersey_number} />
                <div>
                  {selectedShot.player_id != null ? (
                    <Link to={`/jugador/${selectedShot.player_id}`} className="interactive font-semibold hover:text-(--color-lime)">
                      {selectedShot.player_nickname ?? selectedShot.player}
                    </Link>
                  ) : (
                    <strong>{selectedShot.player_nickname ?? selectedShot.player}</strong>
                  )}
                  {selectedShot.jersey_number != null && <span className="ml-1 text-(--color-text-dim)">#{selectedShot.jersey_number}</span>}
                  <div className="text-sm text-(--color-text-dim)">
                    {selectedShot.team} · minuto {selectedShot.minute}
                  </div>
                </div>
              </div>

              <HalfPitch
                shooter={{ x: selectedShot.loc_x, y: selectedShot.loc_y }}
                players={pitchPlayers}
                isGoal={selectedShot.is_goal === 1}
                shotEnd={selectedShot.shot_end_x != null && selectedShot.shot_end_y != null ? { x: selectedShot.shot_end_x, y: selectedShot.shot_end_y } : null}
              />

              <div className="flex flex-wrap justify-center gap-6">
                <XgMeter valuePct={selectedShot.xg_geo * 100} label="MultiScore sin defensores" size={120} />
                <XgMeter valuePct={selectedShot.xg_full * 100} label="MultiScore" size={140} />
                <XgMeter valuePct={(selectedShot.statsbomb_xg ?? 0) * 100} label="StatsBomb" size={120} />
              </div>

              <p className="text-center text-sm text-(--color-text-dim)">
                {selectedShot.shot_body_part} · {selectedShot.shot_type} · resultado:{" "}
                <span style={{ color: outcomeStyle(selectedShot.shot_outcome, selectedShot.is_goal === 1).color }}>
                  {outcomeStyle(selectedShot.shot_outcome, selectedShot.is_goal === 1).label}
                </span>
              </p>
            </>
          ) : (
            <p className="text-(--color-text-dim)">Selecciona un disparo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
