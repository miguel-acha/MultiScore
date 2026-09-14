// Step 2: grid of MatchCards for one competition+season, with a search box
// and two sort chips — replaces the old flat combobox-driven list.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Search } from "lucide-react";
import { api } from "../api";
import type { Match } from "../api";
import MatchCard from "../components/MatchCard";

type SortMode = "date" | "goals" | "xg";

export default function ExploreMatches() {
  const { competitionId, seasonId } = useParams();
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("date");

  useEffect(() => {
    if (!competitionId) return;
    api.matches(Number(competitionId)).then(setMatches).catch((e) => setError(String(e)));
  }, [competitionId]);

  const filtered = useMemo(() => {
    let rows = matches.filter((m) => String(m.season_id) === seasonId);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((m) => m.home_team.toLowerCase().includes(q) || m.away_team.toLowerCase().includes(q));
    }
    rows = [...rows];
    if (sort === "goals") rows.sort((a, b) => b.home_score + b.away_score - (a.home_score + a.away_score));
    else if (sort === "xg") rows.sort((a, b) => b.home_xg_full + b.away_xg_full - (a.home_xg_full + a.away_xg_full));
    else rows.sort((a, b) => (a.match_date ?? "").localeCompare(b.match_date ?? ""));
    return rows;
  }, [matches, seasonId, query, sort]);

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;

  const seasonLabel = matches.find((m) => String(m.season_id) === seasonId)?.season_label ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link to="/explorar" className="interactive rounded-full border border-(--color-border) p-2 hover:border-(--color-lime)">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display text-3xl">{seasonLabel}</h1>
          <p className="text-sm text-(--color-text-dim)">{filtered.length} partidos</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="clip-menu-sm flex min-w-56 flex-1 items-center gap-2 border border-(--color-border) bg-(--color-surface) px-3 py-2">
          <Search size={15} className="text-(--color-text-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar equipo…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-(--color-text-faint)"
          />
        </div>
        {([
          ["date", "Fecha"],
          ["goals", "Más goles"],
          ["xg", "Más xG"],
        ] as [SortMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className={`interactive clip-menu-sm border px-3 py-2 text-xs font-medium ${
              sort === mode ? "border-(--color-lime) text-(--color-lime)" : "border-(--color-border) text-(--color-text-dim)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m, i) => (
          <MatchCard key={m.match_id} match={m} index={i} />
        ))}
      </div>
    </div>
  );
}
