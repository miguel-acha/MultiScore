// Game mode 1: "Adiviná el xG" — 10 real shots, guess the goal probability
// with a slider, score based on how close you land to the model's xG_full.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Check } from "lucide-react";
import { api } from "../api";
import type { ChallengeShot } from "../api";
import HalfPitch from "../components/HalfPitch";
import type { PitchPlayer } from "../components/HalfPitch";
import CountUp from "../components/bits/CountUp";
import { useClickSpark, ClickSparkLayer } from "../components/bits/ClickSpark";
import { finishGame, recordRound } from "../lib/progress";

const N_ROUNDS = 10;

function roundScore(guessPct: number, modelPct: number): number {
  return Math.max(0, Math.round(100 - 2 * Math.abs(guessPct - modelPct)));
}

function rank(avgScore: number): string {
  if (avgScore >= 85) return "LEYENDA";
  if (avgScore >= 70) return "CRACK";
  if (avgScore >= 50) return "TITULAR";
  return "SUPLENTE";
}

type Phase = "loading" | "guessing" | "revealed" | "finished" | "error";

export default function GuessXg() {
  const navigate = useNavigate();
  const [shots, setShots] = useState<ChallengeShot[]>([]);
  const [round, setRound] = useState(0);
  const [guess, setGuess] = useState(30);
  const [phase, setPhase] = useState<Phase>("loading");
  const [scores, setScores] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { sparks, fire, clear } = useClickSpark();

  useEffect(() => {
    api
      .challengeShots(N_ROUNDS, false)
      .then((s) => {
        setShots(s);
        setPhase("guessing");
      })
      .catch((e) => {
        setError(String(e));
        setPhase("error");
      });
  }, []);

  const shot = shots[round];

  const pitchPlayers: PitchPlayer[] = useMemo(() => {
    if (!shot?.freeze_frame) return [];
    return shot.freeze_frame.map((p, i) => ({
      id: `${shot.event_id}-${i}`,
      x: p.location[0],
      y: p.location[1],
      teammate: p.teammate,
      isGoalkeeper: p.position?.name === "Goalkeeper",
    }));
  }, [shot]);

  function confirm() {
    if (!shot) return;
    const modelPct = shot.xg_full * 100;
    const s = roundScore(guess, modelPct);
    const nextStreak = s >= 80 ? streak + 1 : 0;
    const multiplier = nextStreak >= 3 ? 1.5 : 1;
    const finalScore = Math.round(s * multiplier);
    setScores((prev) => [...prev, finalScore]);
    setStreak(nextStreak);
    recordRound({ mode: "guessXg", roundScore: finalScore, streak: nextStreak });
    fire();
    setPhase("revealed");
  }

  function next() {
    clear();
    if (round + 1 >= shots.length) {
      const total = scores.reduce((a, b) => a + b, 0);
      finishGame({ mode: "guessXg", finalScore: total });
      setPhase("finished");
    } else {
      setRound((r) => r + 1);
      setGuess(30);
      setPhase("guessing");
    }
  }

  if (phase === "error") return <div className="text-(--color-rival)">Error: {error}</div>;
  if (phase === "loading" || !shot) return <p className="text-(--color-text-dim)">Cargando disparos…</p>;

  if (phase === "finished") {
    const total = scores.reduce((a, b) => a + b, 0);
    const avg = total / scores.length;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <p className="text-xs uppercase tracking-widest text-(--color-text-faint)">Resultado final</p>
        <p className="font-display text-7xl text-(--color-lime)">{total}</p>
        <p className="font-display text-2xl">{rank(avg)}</p>
        <p className="text-sm text-(--color-text-dim)">Precisión media: {avg.toFixed(0)} / 100 por ronda</p>
        <div className="mt-4 flex gap-3">
          <button onClick={() => navigate(0)} className="interactive clip-menu-sm border border-(--color-lime) bg-(--color-lime)/10 px-5 py-2.5 text-sm font-semibold text-(--color-lime)">
            Jugar de nuevo
          </button>
          <Link to="/jugar" className="interactive clip-menu-sm border border-(--color-border) px-5 py-2.5 text-sm font-medium text-(--color-text-dim)">
            Volver
          </Link>
        </div>
      </motion.div>
    );
  }

  const modelPct = shot.xg_full * 100;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-xl items-center justify-between">
        <Link to="/jugar" className="interactive rounded-full border border-(--color-border) p-2 hover:border-(--color-lime)">
          <ArrowLeft size={18} />
        </Link>
        <p className="text-sm text-(--color-text-dim)">
          Ronda {round + 1} / {shots.length} · {shot.home_team} vs {shot.away_team}, minuto {shot.minute}
        </p>
        <p className="text-stat text-(--color-lime)">{scores.reduce((a, b) => a + b, 0)}</p>
      </div>

      <HalfPitch
        shooter={{ x: shot.loc_x, y: shot.loc_y }}
        players={pitchPlayers}
        goalCoveragePct={phase === "revealed" ? shot.goal_coverage_pct ?? undefined : undefined}
      />

      <div className="relative flex w-full max-w-md flex-col items-center gap-4">
        <ClickSparkLayer sparks={sparks} onDone={clear} />

        <AnimatePresence mode="wait">
          {phase === "guessing" ? (
            <motion.div key="guess" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
              <p className="font-display text-6xl">{guess}%</p>
              <input
                type="range"
                min={0}
                max={100}
                value={guess}
                onChange={(e) => setGuess(Number(e.target.value))}
                className="w-full accent-[color:var(--color-lime)]"
              />
              <button
                onClick={confirm}
                className="interactive clip-menu flex items-center gap-2 border border-(--color-lime) bg-(--color-lime) px-8 py-3 font-semibold text-(--color-bg)"
              >
                <Check size={18} /> CONFIRMAR
              </button>
            </motion.div>
          ) : (
            <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex w-full flex-col items-center gap-3">
              <div className="flex w-full items-center justify-between text-sm">
                <span className="text-(--color-text-dim)">Tu marca: {guess}%</span>
                <span className="text-(--color-lime)">
                  Modelo: <CountUp value={modelPct} suffix="%" />
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-(--color-surface-3)">
                <div className="absolute h-2 rounded-full bg-(--color-text-dim)" style={{ width: `${guess}%` }} />
                <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-(--color-lime)" style={{ left: `${modelPct}%` }} />
              </div>
              <p className={`font-display text-2xl ${shot.is_goal ? "text-(--color-lime)" : "text-(--color-text-dim)"}`}>
                {shot.is_goal ? "¡GOL!" : "No fue gol"}
              </p>
              <p className="text-sm text-(--color-text-dim)">Puntos esta ronda: {scores[scores.length - 1]}</p>
              <button onClick={next} className="interactive clip-menu border border-(--color-border) bg-(--color-surface-2) px-8 py-3 font-semibold">
                {round + 1 >= shots.length ? "VER RESULTADO" : "SIGUIENTE"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
