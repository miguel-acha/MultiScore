// Horizontal timeline of every shot in the match, positioned by minute.
// Home team shots sit above the line, away team below; goals get a bigger
// lime marker. Clicking a marker selects that shot everywhere else on the
// page (shot list + pitch), same as clicking the list item.
import { motion } from "motion/react";
import type { Match, Shot } from "../api";

interface MatchTimelineProps {
  match: Match;
  shots: Shot[];
  selectedShotId: string | null;
  onSelect: (eventId: string) => void;
}

export default function MatchTimeline({ match, shots, selectedShotId, onSelect }: MatchTimelineProps) {
  const maxMinute = Math.max(90, ...shots.map((s) => s.minute ?? 0)) + 2;
  const sorted = [...shots].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  return (
    <div className="clip-menu w-full border border-(--color-border) bg-(--color-surface) px-5 py-4">
      <div className="mb-3 flex items-center justify-between text-xs text-(--color-text-faint)">
        <span className="truncate">{match.home_team}</span>
        <span>Linea de tiempo del partido</span>
        <span className="truncate">{match.away_team}</span>
      </div>
      <div className="relative h-16">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-(--color-border-strong)" />
        {[0, 45, 90].map((m) => (
          <div key={m} className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center" style={{ left: `${(m / maxMinute) * 100}%` }}>
            <div className="h-2.5 w-px bg-(--color-border-strong)" />
            <span className="mt-6 text-[10px] text-(--color-text-faint)">{m}'</span>
          </div>
        ))}
        {sorted.map((s) => {
          const isHome = s.team === match.home_team;
          const isGoal = s.is_goal === 1;
          const isSelected = s.event_id === selectedShotId;
          const leftPct = Math.min(100, ((s.minute ?? 0) / maxMinute) * 100);
          return (
            <motion.button
              key={s.event_id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onSelect(s.event_id)}
              title={`${s.player_nickname ?? s.player} · ${s.minute}' · xG ${s.xg_full.toFixed(2)}${isGoal ? " · GOL" : ""}`}
              className="interactive absolute -translate-x-1/2"
              style={{
                left: `${leftPct}%`,
                top: isHome ? "calc(50% - 18px)" : "calc(50% + 6px)",
              }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: isGoal ? 12 : 7,
                  height: isGoal ? 12 : 7,
                  background: isGoal ? "var(--color-lime)" : isHome ? "var(--color-teammate)" : "var(--color-rival)",
                  boxShadow: isSelected ? "0 0 0 3px rgba(255,255,255,0.35)" : isGoal ? "0 0 8px rgba(200,255,0,0.7)" : "none",
                }}
              />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
