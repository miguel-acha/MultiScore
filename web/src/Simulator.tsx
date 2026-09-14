// Simulator view: drag the shooter, defenders and goalkeeper around the
// full pitch and see xG-geo / xG-full update live via POST /predict. This
// is the clearest way to demonstrate, in the oral defense, that defender
// positioning changes the model's read of a shot's difficulty - as long
// as it's clear which players are actually blocking the shot, hence the
// legend, the goal-coverage bar and the goalkeeper's distinct marker.
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PredictResponse } from "./api";
import Pitch from "./Pitch";
import type { PitchPlayer } from "./Pitch";

let nextId = 1;

const GK_ID = "gk";

export default function Simulator() {
  const [shooter, setShooter] = useState({ x: 105, y: 40 });
  const [players, setPlayers] = useState<PitchPlayer[]>([
    { id: GK_ID, x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true },
  ]);
  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runPrediction(nextShooter = shooter, nextPlayers = players) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await api.predict({
          shooter_x: nextShooter.x,
          shooter_y: nextShooter.y,
          freeze_frame: nextPlayers.map((p) => ({
            x: p.x,
            y: p.y,
            teammate: p.teammate,
            is_goalkeeper: p.isGoalkeeper,
          })),
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

  function removePlayer(id: string) {
    const next = players.filter((p) => p.id !== id);
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

  function handleShooterMove(x: number, y: number) {
    setShooter({ x, y });
    runPrediction({ x, y }, players);
  }

  function handlePlayerMove(id: string, x: number, y: number) {
    const next = players.map((p) => (p.id === id ? { ...p, x, y } : p));
    setPlayers(next);
    runPrediction(shooter, next);
  }

  const geo = prediction ? Math.round(prediction.xg_geo * 100) : null;
  const full = prediction ? Math.round(prediction.xg_full * 100) : null;
  const defendersOnly = players.filter((p) => !p.isGoalkeeper);

  return (
    <div className="simulator-v2">
      <div className="sim-pitch-wrap">
        <Pitch
          shooter={shooter}
          players={players}
          onShooterMove={handleShooterMove}
          onPlayerMove={handlePlayerMove}
          goalCoveragePct={prediction?.computed_features.goal_coverage_pct}
        />

        <div className="pitch-legend">
          <span><i className="dot shooter" /> Tirador</span>
          <span><i className="dot defender" /> Rival</span>
          <span><i className="dot gk" /> Arquero</span>
          <span><i className="dot shadow" /> Arco tapado</span>
        </div>

        <div className="sim-actions">
          <button onClick={addDefender}>+ Agregar rival</button>
          <button onClick={toggleGoalkeeper} className={hasGoalkeeper ? "" : "muted"}>
            {hasGoalkeeper ? "Sacar arquero" : "+ Agregar arquero"}
          </button>
          {defendersOnly.map((p, i) => (
            <button key={p.id} onClick={() => removePlayer(p.id)}>
              Quitar rival {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="xg-panel-v2">
        <div className="xg-hero">
          <span className="xg-hero-label">Probabilidad de gol (con contexto de rivales)</span>
          <div className="xg-hero-value">{full != null ? `${full}%` : "…"}</div>
          <span className="xg-hero-sub">
            Sin mirar a los rivales daría {geo != null ? `${geo}%` : "…"}
          </span>
          {loading && <span className="loading"> · recalculando…</span>}
        </div>

        {prediction && (
          <div className="feature-grid">
            <div className="feature-cell">
              <span>Distancia al arco</span>
              <strong>{prediction.computed_features.distance_to_goal_m.toFixed(1)} m</strong>
            </div>
            <div className="feature-cell">
              <span>Ángulo de disparo</span>
              <strong>{prediction.computed_features.shot_angle_deg.toFixed(0)}°</strong>
            </div>
            <div className="feature-cell">
              <span>Rivales bloqueando</span>
              <strong>{prediction.computed_features.defenders_in_triangle}</strong>
            </div>
            <div className="feature-cell">
              <span>Arco tapado</span>
              <strong>{Math.round(prediction.computed_features.goal_coverage_pct ?? 0)}%</strong>
            </div>
            <div className="feature-cell">
              <span>Rival más cercano</span>
              <strong>{prediction.computed_features.nearest_defender_dist_m.toFixed(1)} m</strong>
            </div>
            <div className="feature-cell">
              <span>Arco vacío</span>
              <strong>{prediction.computed_features.open_goal_geometric ? "Sí" : "No"}</strong>
            </div>
          </div>
        )}

        <p className="sim-hint">
          Arrastrá el punto verde (tirador) o cualquier rival/arquero. Un rival solo baja la probabilidad si
          queda realmente entre el tirador y el arco - si lo dejás al costado no bloquea nada, igual que en un partido real.
        </p>
      </div>
    </div>
  );
}
