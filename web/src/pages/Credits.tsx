// Every image credit lives here instead of under each photo - a visible
// "Foto: X · licencia" line on every avatar across the app made the pages
// noisy; the license is still satisfied (attribution + a title tooltip on
// hover, see PlayerAvatar.tsx), just consolidated in one place.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { PlayerListItem, TeamsMap } from "../api";
import Skeleton from "../components/Skeleton";
import { stripHtml } from "../lib/format";

export default function Credits() {
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null);
  const [teams, setTeams] = useState<TeamsMap | null>(null);

  useEffect(() => {
    api.players({ sort: "goals" }).then((all) => setPlayers(all.filter((p) => p.photo)));
    api.teams().then(setTeams);
  }, []);

  const clubs = teams ? Object.entries(teams).filter(([, v]) => v?.kind === "club") : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <img src="/images/logo-badge-128.webp" alt="" className="h-10 w-10" />
          <h1 className="font-display text-4xl">CRÉDITOS DE IMÁGENES</h1>
        </div>
        <p className="mt-2 max-w-2xl text-(--color-text-dim)">
          Las fotos de jugadores son de Wikimedia Commons, con licencia libre y su autor. Los escudos de club son la
          imagen del club en Wikipedia en inglés, usados con fines académicos no comerciales bajo su política de uso
          justo (no son de licencia libre). Las banderas de las selecciones son de{" "}
          <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noreferrer" className="underline">
            flag-icons
          </a>{" "}
          (MIT).
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Jugadores</h2>
        {!players ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="clip-menu overflow-x-auto border border-(--color-border) bg-(--color-surface)">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase text-(--color-text-faint)">
                  <th className="px-4 py-2.5">Jugador</th>
                  <th className="px-4 py-2.5">Autor</th>
                  <th className="px-4 py-2.5">Licencia</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.player_id} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-2 font-medium">{p.nickname ?? p.name}</td>
                    <td className="px-4 py-2 text-(--color-text-dim)">{stripHtml(p.photo?.artist_html) || "—"}</td>
                    <td className="px-4 py-2 text-(--color-text-dim)">{p.photo?.license ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Clubes</h2>
        {!clubs ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="clip-menu overflow-x-auto border border-(--color-border) bg-(--color-surface)">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase text-(--color-text-faint)">
                  <th className="px-4 py-2.5">Club</th>
                  <th className="px-4 py-2.5">Artículo</th>
                  <th className="px-4 py-2.5">Licencia</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map(([name, crest]) => (
                  <tr key={name} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-2 font-medium">{name}</td>
                    <td className="px-4 py-2 text-(--color-text-dim)">{crest?.article ?? "—"}</td>
                    <td className="px-4 py-2 text-(--color-text-dim)">{crest?.license ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
