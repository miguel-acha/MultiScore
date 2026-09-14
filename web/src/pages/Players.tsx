// Player ranking: search + sort over every player who took a shot in the
// browsable data, so there's finally somewhere to see a player's photo,
// stats and shots instead of just their name popping up inside a match.
//
// Fetches the full list ONCE (it's ~955 rows, a few hundred KB) and does
// every search/sort/pagination client-side - the earlier version re-fetched
// on every keystroke, which meant blanking the whole grid back to a
// skeleton mid-search (visually indistinguishable from "broken") and
// re-running the mount animation on every reorder.
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Search, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "../api";
import type { PlayerListItem, TeamSort } from "../api";
import PlayerAvatar from "../components/PlayerAvatar";
import TeamBadge from "../components/TeamBadge";
import Skeleton from "../components/Skeleton";
import SpotlightCard from "../components/bits/SpotlightCard";

const SORTS: [TeamSort, string][] = [
  ["goals", "Goles"],
  ["xg", "xG"],
  ["shots", "Tiros"],
  ["overperf", "Sobre lo esperado"],
];

const SORT_KEY: Record<TeamSort, (p: PlayerListItem) => number> = {
  goals: (p) => p.goals,
  xg: (p) => p.xg_total,
  shots: (p) => p.shots,
  overperf: (p) => p.goals_minus_xg,
};

const PAGE_SIZE = 60;

export default function Players() {
  const [allPlayers, setAllPlayers] = useState<PlayerListItem[] | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<TeamSort>("goals");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.players({ sort: "goals" }).then(setAllPlayers).catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!allPlayers) return null;
    const q = deferredQuery.trim().toLowerCase();
    const rows = q
      ? allPlayers.filter((p) => p.name.toLowerCase().includes(q) || (p.nickname ?? "").toLowerCase().includes(q))
      : allPlayers;
    const key = SORT_KEY[sort];
    return [...rows].sort((a, b) => key(b) - key(a));
  }, [allPlayers, deferredQuery, sort]);

  if (error) return <div className="text-(--color-rival)">Error: {error}</div>;

  const page = filtered?.slice(0, visible) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">JUGADORES</h1>
        <p className="text-(--color-text-dim)">Estadísticas de cada jugador con al menos un disparo en la base.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="clip-menu-sm flex min-w-56 flex-1 items-center gap-2 border border-(--color-border) bg-(--color-surface) px-3 py-2">
          <Search size={15} className="text-(--color-text-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jugador…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-(--color-text-faint)"
          />
        </div>
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`interactive clip-menu-sm border px-3 py-2 text-xs font-medium ${
              sort === key ? "border-(--color-lime) text-(--color-lime)" : "border-(--color-border) text-(--color-text-dim)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!page ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.map((p, i) => (
              <PlayerCard key={p.player_id} player={p} index={i} />
            ))}
          </div>
          {page.length === 0 && <p className="text-(--color-text-dim)">Sin resultados.</p>}
          {filtered && filtered.length > visible && (
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="interactive clip-menu-sm mx-auto border border-(--color-border) px-5 py-2 text-sm text-(--color-text-dim) hover:border-(--color-lime) hover:text-(--color-lime)"
            >
              Ver más ({filtered.length - visible} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PlayerCard({ player, index }: { player: PlayerListItem; index: number }) {
  const over = player.goals_minus_xg;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.2), layout: { duration: 0.25 } }}
    >
      <Link to={`/jugador/${player.player_id}`} className="interactive block">
        <SpotlightCard className="lift clip-menu flex h-full flex-col gap-3 border border-(--color-border) bg-(--color-surface) p-4 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime)">
          <div className="flex items-center gap-3">
            <PlayerAvatar player={player} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{player.nickname ?? player.name}</p>
              <div className="flex items-center gap-1.5 text-xs text-(--color-text-faint)">
                {player.team && <TeamBadge name={player.team} size="sm" />}
                <span className="truncate">{player.team ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Goles" value={player.goals} />
            <Stat label="xG" value={player.xg_total.toFixed(1)} />
            <div>
              <p className={`text-stat flex items-center justify-center gap-0.5 text-xl ${over >= 0 ? "text-(--color-lime)" : "text-(--color-rival)"}`}>
                {over >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {over >= 0 ? "+" : ""}
                {over.toFixed(1)}
              </p>
              <p className="text-[10px] text-(--color-text-faint)">vs xG</p>
            </div>
          </div>

          <p className="text-center text-xs text-(--color-text-faint)">{player.shots} tiros · {player.matches} partidos</p>
        </SpotlightCard>
      </Link>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-stat text-xl">{value}</p>
      <p className="text-[10px] text-(--color-text-faint)">{label}</p>
    </div>
  );
}
