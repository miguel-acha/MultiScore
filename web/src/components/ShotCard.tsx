import { motion } from "motion/react";
import { Link } from "react-router";
import type { Shot } from "../api";
import { outcomeStyle } from "../lib/outcomes";
import PlayerAvatar from "./PlayerAvatar";

export default function ShotCard({
  shot,
  selected,
  onClick,
  index = 0,
}: {
  shot: Shot;
  selected: boolean;
  onClick: () => void;
  index?: number;
}) {
  const style = outcomeStyle(shot.shot_outcome, shot.is_goal === 1);
  const name = shot.player_nickname ?? shot.player ?? "?";

  return (
    <motion.div
      data-event-id={shot.event_id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={onClick}
      className={`interactive clip-menu-sm relative flex w-full cursor-pointer items-center gap-3 border px-3 py-2.5 text-left text-sm ${
        selected
          ? "border-(--color-lime) bg-(--color-lime)/10 shadow-(--shadow-glow-lime)"
          : "border-(--color-border) bg-(--color-surface) hover:border-(--color-border-strong)"
      }`}
    >
      <PlayerAvatar photoUrl={shot.player_photo_url} name={name} size="sm" />
      <div className="min-w-0 flex-1">
        {shot.player_id != null ? (
          <Link
            to={`/jugador/${shot.player_id}`}
            onClick={(e) => e.stopPropagation()}
            className={`interactive truncate font-medium hover:text-(--color-lime) ${selected ? "text-(--color-lime)" : ""}`}
          >
            {name}
          </Link>
        ) : (
          <strong className={`truncate ${selected ? "text-(--color-lime)" : ""}`}>{name}</strong>
        )}
        <div className="flex items-center gap-1.5 text-xs text-(--color-text-faint)">
          <span>{shot.minute}&apos; · {shot.team}</span>
        </div>
        <span className="text-xs text-(--color-text-dim)">xG MultiScore {shot.xg_full.toFixed(2)}</span>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
        style={{ color: style.shape === "ring" ? style.color : "#07090d", background: style.shape === "ring" ? "transparent" : style.color, border: style.shape === "ring" ? `1.5px solid ${style.color}` : "none" }}
      >
        {style.label}
      </span>
    </motion.div>
  );
}
