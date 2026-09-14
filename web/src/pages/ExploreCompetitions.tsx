// Step 1 of the card-menu explorer: pick a competition. Season selection
// happens inline as chips once a competition with more than one season is
// picked, then we jump straight to the match grid.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { api } from "../api";
import type { Competition } from "../api";
import CompetitionCard from "../components/CompetitionCard";

export default function ExploreCompetitions() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Competition | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.competitions().then(setCompetitions).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">EXPLORAR</h1>
        <p className="text-(--color-text-dim)">Elegí una competición para ver los partidos.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {competitions.map((c, i) => (
          <CompetitionCard
            key={c.competition_id}
            competition={c}
            index={i}
            onClick={() => {
              if (c.seasons.length === 1) {
                navigate(`/explorar/${c.competition_id}/${c.seasons[0].season_id}`);
              } else {
                setPicked(c);
              }
            }}
          />
        ))}
      </div>

      {picked && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="clip-menu border border-(--color-border) bg-(--color-surface) p-5"
        >
          <p className="mb-3 text-sm text-(--color-text-dim)">Temporada de {picked.name}</p>
          <div className="flex flex-wrap gap-2">
            {picked.seasons.map((s) => (
              <button
                key={s.season_id}
                onClick={() => navigate(`/explorar/${picked.competition_id}/${s.season_id}`)}
                className="interactive clip-menu-sm border border-(--color-border) bg-(--color-surface-2) px-4 py-2 text-sm font-medium hover:border-(--color-lime) hover:text-(--color-lime)"
              >
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
