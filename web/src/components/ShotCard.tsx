import { motion } from "motion/react";
import type { Shot } from "../api";

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
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onClick={onClick}
      className={`interactive clip-menu-sm relative flex w-full flex-col items-start gap-1 border px-3 py-2.5 text-left text-sm ${
        selected
          ? "border-(--color-lime) bg-(--color-lime)/10 shadow-(--shadow-glow-lime)"
          : "border-(--color-border) bg-(--color-surface) hover:border-(--color-border-strong)"
      }`}
    >
      <strong className={selected ? "text-(--color-lime)" : ""}>{shot.player_nickname ?? shot.player ?? "?"}</strong>
      <span className="text-xs text-(--color-text-faint)">{shot.minute}' · {shot.team}</span>
      <span className="text-xs text-(--color-text-dim)">
        xG geo {shot.xg_geo.toFixed(2)} · xG full {shot.xg_full.toFixed(2)}
      </span>
      {shot.is_goal === 1 && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-(--color-lime) px-2 py-0.5 text-[10px] font-bold text-(--color-bg)">
          GOL
        </span>
      )}
    </motion.button>
  );
}
