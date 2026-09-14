import { useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Target, Swords } from "lucide-react";
import SpotlightCard from "../components/bits/SpotlightCard";
import { loadProgress } from "../lib/progress";

export default function PlayMenu() {
  const [progress] = useState(loadProgress);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">JUGAR</h1>
        <p className="text-(--color-text-dim)">Dos modos, 10 disparos reales por ronda.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/jugar/adivina" className="interactive block">
            <SpotlightCard className="lift clip-menu flex h-full flex-col gap-4 border border-(--color-border) bg-gradient-to-br from-(--color-surface-2) to-(--color-surface) p-6 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime)">
              <Target size={32} className="text-(--color-lime)" />
              <div>
                <h3 className="font-display text-3xl">ADIVINÁ EL XG</h3>
                <p className="mt-1 text-sm text-(--color-text-dim)">
                  Ves el freeze frame de un disparo real y adivinás la probabilidad de gol. Cuanto más cerca del
                  modelo, más puntos.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-(--color-border) pt-3 text-xs text-(--color-text-faint)">
                <span>Mejor puntaje</span>
                <span className="text-stat text-lg text-(--color-lime)">{progress?.bestScoreGuessXg ?? 0}</span>
              </div>
            </SpotlightCard>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Link to="/jugar/gol-o-no" className="interactive block">
            <SpotlightCard className="lift clip-menu flex h-full flex-col gap-4 border border-(--color-border) bg-gradient-to-br from-(--color-surface-2) to-(--color-surface) p-6 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime)">
              <Swords size={32} className="text-(--color-lime)" />
              <div>
                <h3 className="font-display text-3xl">GOL O NO GOL</h3>
                <p className="mt-1 text-sm text-(--color-text-dim)">
                  Apostás si fue gol y comparás tu instinto contra la IA. Gana quien acierte con más confianza.
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-(--color-border) pt-3 text-xs text-(--color-text-faint)">
                <span>Mejor puntaje</span>
                <span className="text-stat text-lg text-(--color-lime)">{progress?.bestScoreGoalOrNot ?? 0}</span>
              </div>
            </SpotlightCard>
          </Link>
        </motion.div>
      </div>

      {progress && progress.gamesPlayed > 0 && (
        <div className="clip-menu flex flex-wrap gap-8 border border-(--color-border) bg-(--color-surface) p-5">
          <Stat label="Partidas jugadas" value={progress.gamesPlayed} />
          <Stat label="Puntaje total" value={progress.totalScore} />
          <Stat label="Mejor racha" value={progress.bestStreak} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-stat text-2xl text-(--color-lime)">{value}</p>
      <p className="text-xs text-(--color-text-faint)">{label}</p>
    </div>
  );
}
