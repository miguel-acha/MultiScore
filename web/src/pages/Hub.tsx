import { motion } from "motion/react";
import { Link } from "react-router";
import { Gamepad2, Compass, Sliders, LineChart, Users, ArrowRight } from "lucide-react";
import CountUp from "../components/bits/CountUp";
import SpotlightCard from "../components/bits/SpotlightCard";

const TILES = [
  {
    to: "/jugar",
    title: "JUGAR",
    subtitle: "Adiviná el xG o ganale a la IA",
    icon: Gamepad2,
    big: true,
  },
  {
    to: "/explorar",
    title: "EXPLORAR PARTIDOS",
    subtitle: "La Liga 2017/18 y Mundial 2022",
    icon: Compass,
  },
  {
    to: "/jugadores",
    title: "JUGADORES",
    subtitle: "Rankings, fotos y mapa de tiros de cada uno",
    icon: Users,
  },
  {
    to: "/simulador",
    title: "SIMULADOR",
    subtitle: "Movés jugadores, cambia el xG en vivo",
    icon: Sliders,
  },
  {
    to: "/modelo",
    title: "EL MODELO",
    subtitle: "Cómo se entrenó y qué tan bien predice",
    icon: LineChart,
  },
];

const STATS = [
  { value: 20936, decimals: 0, label: "Disparos analizados" },
  { value: 0.811, decimals: 3, label: "AUC del modelo" },
  { value: 100, decimals: 0, suffix: "+", label: "Partidos" },
];

export default function Hub() {
  return (
    <div className="flex flex-col gap-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-noise clip-menu relative overflow-hidden border border-(--color-border) bg-gradient-to-br from-(--color-surface-2) to-(--color-surface) p-8 sm:p-12"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-lime)">Predicción de xG</p>
        <h1 className="font-display mt-2 text-5xl leading-[0.95] sm:text-7xl">
          ¿Ese tiro
          <br />
          era <span className="text-(--color-lime)">gol</span>?
        </h1>
        <p className="mt-4 max-w-lg text-(--color-text-dim)">
          Machine learning entrenado con datos reales de StatsBomb que lee la posición de los defensores para
          calcular la probabilidad de gol de cualquier disparo.
        </p>
        <div className="mt-6 flex flex-wrap gap-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix ?? ""} className="font-display text-3xl text-(--color-lime)" />
              <p className="text-xs text-(--color-text-faint)">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map((tile, i) => (
          <motion.div
            key={tile.to}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
            className={tile.big ? "sm:col-span-2" : ""}
          >
            <Link to={tile.to} className="interactive block">
              <SpotlightCard
                className={`clip-menu flex items-center justify-between gap-4 border border-(--color-border) bg-(--color-surface) p-6 hover:border-(--color-lime)/50 hover:shadow-(--shadow-glow-lime) ${
                  tile.big ? "bg-gradient-to-br from-(--color-lime)/10 to-(--color-surface)" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <tile.icon size={tile.big ? 36 : 28} className="text-(--color-lime)" />
                  <div>
                    <h3 className={`font-display ${tile.big ? "text-4xl" : "text-2xl"}`}>{tile.title}</h3>
                    <p className="text-sm text-(--color-text-dim)">{tile.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className="shrink-0 text-(--color-text-faint)" />
              </SpotlightCard>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
