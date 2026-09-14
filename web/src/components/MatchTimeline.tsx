// Horizontal timeline of every shot in the match, positioned by minute.
// Marker shape+color tells you the RESULT (lib/outcomes.ts - a goal is a
// lime ball, a save is a yellow circle, a block is a red square, etc.)
// while the TEAM is read from the lane (home above the line, away below)
// and the crest at that lane's end - the old version colored markers by
// team, which read as "red = missed" to a first-time viewer since red
// also meant "rival" everywhere else.
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Match, Shot } from "../api";
import TeamBadge from "./TeamBadge";
import PlayerAvatar from "./PlayerAvatar";
import { outcomeStyle, OUTCOME_LEGEND } from "../lib/outcomes";

interface MatchTimelineProps {
  match: Match;
  shots: Shot[];
  selectedShotId: string | null;
  onSelect: (eventId: string) => void;
}

function Marker({ style, size }: { style: ReturnType<typeof outcomeStyle>; size: number }) {
  const common = { width: size, height: size, background: style.color };
  if (style.shape === "square") return <span className="block" style={{ ...common, borderRadius: 2 }} />;
  if (style.shape === "ring")
    return <span className="block rounded-full border-2" style={{ width: size, height: size, borderColor: style.color, background: "transparent" }} />;
  return <span className="block rounded-full" style={common} />;
}

export default function MatchTimeline({ match, shots, selectedShotId, onSelect }: MatchTimelineProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxMinute = Math.max(90, ...shots.map((s) => s.minute ?? 0)) + 2;
  const sorted = useMemo(() => [...shots].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)), [shots]);
  const hovered = sorted.find((s) => s.event_id === hoverId);
  const selectedIndex = sorted.findIndex((s) => s.event_id === selectedShotId);

  function step(delta: number) {
    if (sorted.length === 0) return;
    const next = selectedIndex === -1 ? 0 : Math.max(0, Math.min(sorted.length - 1, selectedIndex + delta));
    onSelect(sorted[next].event_id);
  }

  // Left/right arrow keys move between shots when the timeline (or one of
  // its marker buttons) has focus - a much easier way to step through
  // tightly-packed shots than clicking a 6px dot.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  const minuteMarks = [0, 15, 30, 45, 60, 75, 90].filter((m) => m <= maxMinute);

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="clip-menu w-full border border-(--color-border) bg-(--color-surface) px-5 py-4"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <TeamBadge name={match.home_team} size="sm" />
        <span className="truncate">{match.home_team}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => step(-1)}
            disabled={selectedIndex <= 0}
            className="interactive rounded-full border border-(--color-border) p-1 text-(--color-text-dim) hover:border-(--color-lime) hover:text-(--color-lime) disabled:opacity-30"
            aria-label="Tiro anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs uppercase tracking-wide text-(--color-text-faint)">Línea de tiempo</span>
          <button
            onClick={() => step(1)}
            disabled={selectedIndex === -1 || selectedIndex >= sorted.length - 1}
            className="interactive rounded-full border border-(--color-border) p-1 text-(--color-text-dim) hover:border-(--color-lime) hover:text-(--color-lime) disabled:opacity-30"
            aria-label="Tiro siguiente"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="relative h-20">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-(--color-border-strong)" />
        {minuteMarks.map((m) => (
          <div key={m} className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center" style={{ left: `${(m / maxMinute) * 100}%` }}>
            <div className="h-2.5 w-px bg-(--color-border-strong)" />
            <span className="mt-6 text-[10px] text-(--color-text-faint)">{m}&apos;</span>
          </div>
        ))}

        {selectedIndex !== -1 && (
          <div
            className="pointer-events-none absolute top-1/2 h-px -translate-y-1/2 bg-(--color-lime)"
            style={{ left: 0, width: `${Math.min(100, ((sorted[selectedIndex].minute ?? 0) / maxMinute) * 100)}%`, opacity: 0.25 }}
          />
        )}

        {sorted.map((s) => {
          const isHome = s.team === match.home_team;
          const style = outcomeStyle(s.shot_outcome, s.is_goal === 1);
          const isSelected = s.event_id === selectedShotId;
          const size = 6 + Math.min(1, s.xg_full) * 9;
          const leftPct = Math.min(100, ((s.minute ?? 0) / maxMinute) * 100);
          return (
            <button
              key={s.event_id}
              onClick={() => onSelect(s.event_id)}
              onMouseEnter={() => setHoverId(s.event_id)}
              onMouseLeave={() => setHoverId((h) => (h === s.event_id ? null : h))}
              className="interactive absolute flex items-center justify-center rounded-full"
              style={{
                left: `${leftPct}%`,
                top: isHome ? "calc(50% - 20px)" : "calc(50% + 8px)",
                width: 28,
                height: 28,
                transform: "translate(-50%, -50%)",
                zIndex: isSelected ? 2 : 1,
              }}
              aria-label={`${s.player_nickname ?? s.player}, minuto ${s.minute}`}
            >
              {isSelected && (
                <motion.span
                  layoutId="timeline-selected-ring"
                  className="absolute inset-0 rounded-full border-2 border-(--color-lime)"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0.3, 0.9] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <Marker style={style} size={size} />
            </button>
          );
        })}

        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="clip-menu-sm pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-2 border border-(--color-border-strong) bg-(--color-surface-2) px-3 py-2 text-xs shadow-(--shadow-card)"
              style={{
                left: `${Math.min(88, Math.max(12, ((hovered.minute ?? 0) / maxMinute) * 100))}%`,
                top: hovered.team === match.home_team ? "-16px" : "auto",
                bottom: hovered.team === match.home_team ? "auto" : "-16px",
                transform: hovered.team === match.home_team ? "translate(-50%, -100%)" : "translate(-50%, 100%)",
              }}
            >
              <PlayerAvatar photoUrl={hovered.player_photo_url} name={hovered.player_nickname ?? hovered.player ?? ""} size="sm" />
              <div className="whitespace-nowrap">
                <p className="font-medium">{hovered.player_nickname ?? hovered.player}</p>
                <p className="text-(--color-text-faint)">
                  {hovered.minute}&apos; · {outcomeStyle(hovered.shot_outcome, hovered.is_goal === 1).label} · xG MultiScore {hovered.xg_full.toFixed(2)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <TeamBadge name={match.away_team} size="sm" />
        <span className="truncate">{match.away_team}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-(--color-border) pt-3 text-[11px] text-(--color-text-faint)">
        {OUTCOME_LEGEND.map((style) => (
          <span key={style.kind} className="flex items-center gap-1.5">
            <Marker style={style} size={9} />
            {style.label}
          </span>
        ))}
        <span className="ml-auto">Tamaño = xG del disparo</span>
      </div>
    </div>
  );
}
