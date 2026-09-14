import { motion } from "motion/react";
import { Link } from "react-router";
import type { Match } from "../api";
import TeamBadge from "./TeamBadge";
import { formatDate } from "../lib/format";
import SpotlightCard from "./bits/SpotlightCard";

export default function MatchCard({ match, index = 0 }: { match: Match; index?: number }) {
  const maxXg = Math.max(match.home_xg_full, match.away_xg_full, 0.1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35 }}
    >
      <Link to={`/partido/${match.match_id}`} className="interactive block">
        <SpotlightCard className="lift clip-menu group flex flex-col gap-3 border border-(--color-border) bg-(--color-surface) p-4 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime)">
          <div className="flex items-center justify-between text-xs text-(--color-text-faint)">
            <span>{formatDate(match.match_date)}</span>
            <span>{match.competition_stage ?? match.season_label}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamBadge name={match.home_team} />
              <span className="truncate text-sm font-medium">{match.home_team}</span>
            </div>
            <span className="text-stat shrink-0 text-2xl text-(--color-text)">
              {match.home_score}-{match.away_score}
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <span className="truncate text-right text-sm font-medium">{match.away_team}</span>
              <TeamBadge name={match.away_team} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-surface-3)">
              <div className="h-full rounded-full bg-(--color-lime)" style={{ width: `${(match.home_xg_full / maxXg) * 100}%` }} />
            </div>
            <span className="text-[11px] text-(--color-text-faint)">xG {match.home_xg_full.toFixed(1)}–{match.away_xg_full.toFixed(1)}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-surface-3)">
              <div className="ml-auto h-full rounded-full bg-(--color-rival)" style={{ width: `${(match.away_xg_full / maxXg) * 100}%` }} />
            </div>
          </div>
          <div className="text-xs text-(--color-text-faint)">{match.n_shots} disparos · {match.n_goals} goles</div>
        </SpotlightCard>
      </Link>
    </motion.div>
  );
}
