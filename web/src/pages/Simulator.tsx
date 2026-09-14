// Simulator: drag the shooter, defenders and goalkeeper around the half
// pitch and see xG-geo / xG-full update live via POST /predict.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { UserPlus, UserMinus, Footprints } from "lucide-react";
import { api } from "../api";
import type { PredictResponse } from "../api";
import HalfPitch from "../components/HalfPitch";
import type { PitchPlayer } from "../components/HalfPitch";
import XgMeter from "../components/XgMeter";
import CountUp from "../components/bits/CountUp";

let nextId = 1;
const GK_ID = "gk";

const PRESETS: Record<string, { shooter: { x: number; y: number }; players: PitchPlayer[] }> = {
  "Arco vacío": { shooter: { x: 108, y: 40 }, players: [] },
  "Mano a mano": {
    shooter: { x: 100, y: 40 },
    players: [{ id: GK_ID, x: 116, y: 40, teammate: false, isGoalkeeper: true, draggable: true }],
  },
  "Área llena": {
    shooter: { x: 98, y: 44 },
    players: [
      { id: GK_ID, x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true },
      { id: "d1", x: 108, y: 38, teammate: false, draggable: true },
      { id: "d2", x: 106, y: 46, teammate: false, draggable: true },
      { id: "d3", x: 112, y: 42, teammate: false, draggable: true },
    ],
  },
  "Tiro lejano": {
    shooter: { x: 82, y: 40 },
    players: [{ id: GK_ID, x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true }],
  },
};

export default function Simulator() {
  const [shooter, setShooter] = useState({ x: 105, y: 40 });
  const [players, setPlayers] = useState<PitchPlayer[]>([
    { id: GK_ID, x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true },
  ]);
  const [bodyPart, setBodyPart] = useState<"Right Foot" | "Head">("Right Foot");
  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runPrediction(nextShooter = shooter, nextPlayers = players, nextBodyPart = bodyPart) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await api.predict({
          shooter_x: nextShooter.x,
          shooter_y: nextShooter.y,
          shot_body_part: nextBodyPart,
          freeze_frame: nextPlayers.map((p) => ({ x: p.x, y: p.y, teammate: p.teammate, is_goalkeeper: p.isGoalkeeper })),
        });
        setPrediction(resp);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  useEffect(() => {
    runPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasGoalkeeper = players.some((p) => p.isGoalkeeper);

  function addDefender() {
    const next = [...players, { id: `d${nextId++}`, x: 110, y: 40, teammate: false, draggable: true }];
    setPlayers(next);
    runPrediction(shooter, next);
  }

  function removeLastDefender() {
    const defenders = players.filter((p) => !p.isGoalkeeper);
    if (defenders.length === 0) return;
    const removeId = defenders[defenders.length - 1].id;
    const next = players.filter((p) => p.id !== removeId);
    setPlayers(next);
    runPrediction(shooter, next);
  }

  function toggleGoalkeeper() {
    const next = hasGoalkeeper
      ? players.filter((p) => !p.isGoalkeeper)
      : [...players, { id: GK_ID, x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true }];
    setPlayers(next);
    runPrediction(shooter, next);
  }

  function toggleBodyPart() {
    const next = bodyPart === "Right Foot" ? "Head" : "Right Foot";
    setBodyPart(next);
    runPrediction(shooter, players, next);
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    setShooter(preset.shooter);
    setPlayers(preset.players.map((p) => ({ ...p })));
    runPrediction(preset.shooter, preset.players);
  }

  function handleShooterMove(x: number, y: number) {
    setShooter({ x, y });
    runPrediction({ x, y }, players);
  }

  function handlePlayerMove(id: string, x: number, y: number) {
    const next = players.map((p) => (p.id === id ? { ...p, x, y } : p));
    setPlayers(next);
    runPrediction(shooter, next);
  }

  function handlePlayerDoubleClick(id: string) {
    if (id === GK_ID) return;
    const next = players.filter((p) => p.id !== id);
    setPlayers(next);
    runPrediction(shooter, next);
  }

  const geo = prediction ? Math.round(prediction.xg_geo * 100) : 0;
  const full = prediction ? Math.round(prediction.xg_full * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">SIMULADOR</h1>
        <p className="text-(--color-text-dim)">Arrastrá al tirador o a cualquier rival y mirá cómo cambia el xG.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="interactive clip-menu-sm border border-(--color-border) bg-(--color-surface) px-3.5 py-2 text-xs font-medium text-(--color-text-dim) hover:border-(--color-lime) hover:text-(--color-lime)"
          >
            {name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center gap-4">
          <HalfPitchWithDoubleClick
            shooter={shooter}
            players={players}
            onShooterMove={handleShooterMove}
            onPlayerMove={handlePlayerMove}
            onPlayerDoubleClick={handlePlayerDoubleClick}
            goalCoveragePct={prediction?.computed_features.goal_coverage_pct}
          />

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-(--color-text-dim)">
            <Legend color="var(--color-shooter)" label="Tirador" />
            <Legend color="var(--color-rival)" label="Rival" />
            <Legend color="var(--color-gk)" label="Arquero" />
            <Legend color="#ff4d5e" label="Arco tapado" />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <ActionButton onClick={addDefender} icon={UserPlus} label="Rival" />
            <ActionButton onClick={removeLastDefender} icon={UserMinus} label="Quitar rival" />
            <ActionButton onClick={toggleGoalkeeper} icon={UserMinus} label={hasGoalkeeper ? "Sacar arquero" : "Agregar arquero"} active={hasGoalkeeper} />
            <ActionButton onClick={toggleBodyPart} icon={Footprints} label={bodyPart === "Head" ? "Cabeza" : "Pie"} active={bodyPart === "Head"} />
          </div>
          <p className="max-w-md text-center text-xs text-(--color-text-faint)">
            Doble click sobre un rival para sacarlo. Un rival solo baja la probabilidad si queda entre el tirador y
            el arco.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="clip-menu flex flex-col items-center gap-5 border border-(--color-border) bg-(--color-surface) p-6"
        >
          <span className="text-center text-xs uppercase tracking-wide text-(--color-text-faint)">
            Probabilidad de gol (con contexto de rivales)
          </span>
          <XgMeter valuePct={full} size={180} />
          <span className="text-xs text-(--color-text-faint)">
            Sin mirar a los rivales: <CountUp value={geo} suffix="%" />
            {loading && " · recalculando…"}
          </span>

          {prediction && (
            <div className="grid w-full grid-cols-2 gap-2">
              <Stat label="Distancia al arco" value={`${prediction.computed_features.distance_to_goal_m.toFixed(1)} m`} />
              <Stat label="Ángulo de disparo" value={`${prediction.computed_features.shot_angle_deg.toFixed(0)}°`} />
              <Stat label="Rivales bloqueando" value={`${prediction.computed_features.defenders_in_triangle}`} />
              <Stat label="Arco tapado" value={`${Math.round(prediction.computed_features.goal_coverage_pct ?? 0)}%`} />
              <Stat label="Rival más cercano" value={`${prediction.computed_features.nearest_defender_dist_m.toFixed(1)} m`} />
              <Stat label="Arco vacío" value={prediction.computed_features.open_goal_geometric ? "Sí" : "No"} />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: typeof UserPlus;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`interactive clip-menu-sm flex items-center gap-1.5 border px-3 py-2 text-xs font-medium ${
        active ? "border-(--color-lime) text-(--color-lime)" : "border-(--color-border) bg-(--color-surface) text-(--color-text-dim)"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="clip-menu-sm border border-(--color-border) bg-(--color-surface-2) px-3 py-2">
      <p className="text-[10px] text-(--color-text-faint)">{label}</p>
      <p className="text-stat text-lg">{value}</p>
    </div>
  );
}

// Wraps HalfPitch to also fire a double-click callback on a player circle
// (the pitch itself only exposes pointer down/move/up for dragging).
function HalfPitchWithDoubleClick({
  onPlayerDoubleClick,
  ...props
}: React.ComponentProps<typeof HalfPitch> & { onPlayerDoubleClick: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handler(e: Event) {
      const target = (e.target as Element).closest("circle[data-player-id]");
      if (target) onPlayerDoubleClick(target.getAttribute("data-player-id")!);
    }
    el.addEventListener("dblclick", handler);
    return () => el.removeEventListener("dblclick", handler);
  }, [onPlayerDoubleClick]);

  return (
    <div ref={ref}>
      <HalfPitch {...props} />
    </div>
  );
}
