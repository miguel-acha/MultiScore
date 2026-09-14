import { motion } from "motion/react";
import { Trophy, Globe } from "lucide-react";
import type { Competition } from "../api";
import SpotlightCard from "./bits/SpotlightCard";

export default function CompetitionCard({
  competition,
  onClick,
  index = 0,
}: {
  competition: Competition;
  onClick: () => void;
  index?: number;
}) {
  const isWorldCup = competition.competition_label === "world_cup_2022";
  const totalMatches = competition.seasons.length;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      onClick={onClick}
      className="interactive text-left"
    >
      <SpotlightCard className="lift clip-menu flex h-full flex-col justify-between gap-6 border border-(--color-border) bg-gradient-to-br from-(--color-surface-2) to-(--color-surface) p-6 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime-lg)">
        <div className="flex items-center justify-between">
          {isWorldCup ? <Globe size={28} className="text-(--color-lime)" /> : <Trophy size={28} className="text-(--color-lime)" />}
          <span className="text-xs text-(--color-text-faint)">{competition.seasons.length} temporada{totalMatches !== 1 ? "s" : ""}</span>
        </div>
        <div>
          <h3 className="font-display text-3xl">{competition.name}</h3>
          <p className="mt-1 text-sm text-(--color-text-dim)">
            {competition.seasons.length <= 3
              ? competition.seasons.map((s) => s.label).join(" · ")
              : `${competition.seasons
                  .slice(0, 3)
                  .map((s) => s.label)
                  .join(" · ")} y ${competition.seasons.length - 3} más`}
          </p>
        </div>
      </SpotlightCard>
    </motion.button>
  );
}
