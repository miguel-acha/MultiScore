// Simulator view: drag the shooter, defenders and goalkeeper around the
// pitch and see xG-geo / xG-full update live via POST /predict. This is
// the clearest way to demonstrate, in the oral defense, that defender
// positioning changes the model's read of a shot's difficulty.
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PredictResponse } from "./api";
import Pitch from "./Pitch";
import type { PitchPlayer } from "./Pitch";

let nextId = 1;

export default function Simulator() {
  const [shooter, setShooter] = useState({ x: 108, y: 40 });
  const [players, setPlayers] = useState<PitchPlayer[]>([
    { id: "gk", x: 118, y: 40, teammate: false, isGoalkeeper: true, draggable: true },
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

  function addDefender() {
    const next = [...players, { id: `d${nextId++}`, x: 112, y: 40, teammate: false, draggable: true }];
    setPlayers(next);
    runPrediction(shooter, next);
  }

  function removeDefender(id: string) {
    const next = players.filter((p) => p.id !== id || p.isGoalkeeper);
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

  return (
    <div className="simulator">
      <div className="sim-pitch">
        <Pitch
          shooter={shooter}
          players={players}
          onShooterMove={handleShooterMove}
          onPlayerMove={handlePlayerMove}
        />
        <div className="sim-actions">
          <button onClick={addDefender}>+ Agregar defensor</button>
          {players
            .filter((p) => !p.isGoalkeeper)
            .map((p) => (
              <button key={p.id} onClick={() => removeDefender(p.id)}>
                Quitar {p.id}
              </button>
            ))}
        </div>
      </div>

      <div className="xg-panel">
        <div className="xg-card">
          <span>xG sin defensores</span>
          <strong>{prediction ? prediction.xg_geo.toFixed(3) : "…"}</strong>
        </div>
        <div className="xg-card highlight">
          <span>xG con defensores</span>
          <strong>{prediction ? prediction.xg_full.toFixed(3) : "…"}</strong>
        </div>
        {loading && <span className="loading">calculando…</span>}
        {prediction && (
          <ul className="feature-list">
            <li>Distancia al arco: {prediction.computed_features.distance_to_goal_m.toFixed(1)} m</li>
            <li>Ángulo de disparo: {prediction.computed_features.shot_angle_deg.toFixed(1)}°</li>
            <li>Defensores en el triángulo: {prediction.computed_features.defenders_in_triangle}</li>
            <li>Defensor más cercano: {prediction.computed_features.nearest_defender_dist_m.toFixed(1)} m</li>
          </ul>
        )}
      </div>
    </div>
  );
}
