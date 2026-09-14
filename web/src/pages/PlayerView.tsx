import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { Player } from "../api";
import PlayerAvatar from "../components/PlayerAvatar";
import TeamBadge from "../components/TeamBadge";
import PlayerShotMap from "../components/PlayerShotMap";
import Skeleton from "../components/Skeleton";
import CountUp from "../components/bits/CountUp";
import { outcomeStyle, OUTCOME_LEGEND } from "../lib/outcomes";
import OutcomeMarker from "../components/OutcomeMarker";

export default function PlayerView() {
  const { playerId } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    setPlayer(null);
    api.player(Number(playerId)).then(setPlayer).catch((e) => setError(String(e)));
  }, [playerId]);

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;

  if (!player) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const stats = player.stats!;
  const outcomes = player.outcomes ?? {};
  const totalShots = stats.shots || 1;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link to="/jugadores" className="interactive rounded-full border border-(--color-border) p-2 hover:border-(--color-lime)">
          <ArrowLeft size={18} />
        </Link>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="clip-menu flex flex-wrap items-center gap-6 border border-(--color-border) bg-(--color-surface) p-6">
        <PlayerAvatar player={player} size="lg" jerseyNumber={player.jersey_number} />
        <div className="flex-1">
          <h1 className="font-display text-4xl">{player.nickname ?? player.name}</h1>
          {player.nickname && player.nickname !== player.name && <p className="text-sm text-(--color-text-dim)">{player.name}</p>}
          <div className="mt-2 flex items-center gap-2 text-sm text-(--color-text-dim)">
            {stats.team && <TeamBadge name={stats.team} size="sm" />}
            <span>{stats.team ?? "—"}</span>
            {player.jersey_number != null && <span>· #{player.jersey_number}</span>}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Tiros" value={stats.shots} />
        <Tile label="Goles" value={stats.goals} />
        <Tile label="xG total" value={stats.xg_total} decimals={1} />
        <Tile label="Goles − xG" value={stats.goals_minus_xg} decimals={1} highlight={stats.goals_minus_xg >= 0 ? "lime" : "rival"} signed />
        <Tile label="xG por tiro" value={stats.xg_per_shot} decimals={2} />
        <Tile label="% al arco" value={stats.on_target_pct} decimals={0} suffix="%" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center gap-3">
          <PlayerShotMap shots={player.shots ?? []} />
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-(--color-text-faint)">
            {OUTCOME_LEGEND.map((s) => (
              <span key={s.kind} className="flex items-center gap-1.5">
                <OutcomeMarker style={s} size={s.shape === "ball" ? 14 : 9} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="clip-menu border border-(--color-border) bg-(--color-surface) p-4">
            <p className="mb-3 text-xs uppercase tracking-wide text-(--color-text-faint)">Resultado de los tiros</p>
            <div className="flex h-3 overflow-hidden rounded-full">
              {OUTCOME_LEGEND.map((s) => {
                const count = Object.entries(outcomes)
                  .filter(([k]) => outcomeStyle(k).kind === s.kind)
                  .reduce((a, [, v]) => a + v, 0);
                if (count === 0) return null;
                return <div key={s.kind} style={{ width: `${(count / totalShots) * 100}%`, background: s.shape === "ring" ? "#ffffff" : s.color }} />;
              })}
            </div>
          </div>

          <div className="clip-menu flex max-h-[420px] flex-col gap-2 overflow-y-auto border border-(--color-border) bg-(--color-surface) p-3">
            {(player.shots ?? []).map((s) => {
              const style = outcomeStyle(s.shot_outcome, s.is_goal === 1);
              return (
                <Link
                  key={s.event_id}
                  to={`/partido/${s.match_id}?tiro=${s.event_id}`}
                  className="interactive clip-menu-sm flex items-center justify-between border border-(--color-border) bg-(--color-surface-2) px-3 py-2 text-xs hover:border-(--color-lime)/50"
                >
                  <span>{s.team} · {s.minute}&apos;</span>
                  <span className="flex items-center gap-1" style={{ color: style.color }}>
                    <OutcomeMarker style={style} size={style.shape === "ball" ? 14 : 10} />
                    {style.label}
                  </span>
                  <span className="text-(--color-text-dim)">xG {s.xg_full.toFixed(2)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  decimals = 0,
  suffix = "",
  highlight,
  signed,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  highlight?: "lime" | "rival";
  signed?: boolean;
}) {
  const color = highlight === "lime" ? "text-(--color-lime)" : highlight === "rival" ? "text-(--color-rival)" : "";
  return (
    <div className="clip-menu-sm border border-(--color-border) bg-(--color-surface) p-3 text-center">
      <p className={`text-stat text-xl ${color}`}>
        {signed && value >= 0 ? "+" : ""}
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </p>
      <p className="text-[10px] text-(--color-text-faint)">{label}</p>
    </div>
  );
}
