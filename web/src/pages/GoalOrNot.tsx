// Game mode 2: "Gol o no gol" — you vs the model, both bet a confidence on
// 10 balanced real shots, scored with a Brier-style formula so always
// betting "no gol" doesn't win.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import type { ChallengeShot } from "../api";
import HalfPitch from "../components/HalfPitch";
import type { PitchPlayer } from "../components/HalfPitch";
import LogoSpinner from "../components/LogoSpinner";
import { finishGame, recordRound } from "../lib/progress";

const N_ROUNDS = 10;

const CONFIDENCE_OPTIONS = [
  { label: "Seguro no", p: 0.1 },
  { label: "Creo que no", p: 0.3 },
  { label: "50/50", p: 0.5 },
  { label: "Creo que gol", p: 0.7 },
  { label: "Seguro gol", p: 0.9 },
];

function brierScore(p: number, outcome: number): number {
  return Math.round(100 * (1 - (p - outcome) ** 2));
}

type Phase = "loading" | "guessing" | "revealed" | "finished" | "error";

export default function GoalOrNot() {
  const navigate = useNavigate();
  const [shots, setShots] = useState<ChallengeShot[]>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [userScores, setUserScores] = useState<number[]>([]);
  const [aiScores, setAiScores] = useState<number[]>([]);
  const [lastPick, setLastPick] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .challengeShots(N_ROUNDS, true)
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

  function pick(p: number) {
    if (!shot) return;
    const outcome = shot.is_goal;
    const userScore = brierScore(p, outcome);
    const aiScore = brierScore(shot.xg_full, outcome);
    setLastPick(p);
    setUserScores((prev) => [...prev, userScore]);
    setAiScores((prev) => [...prev, aiScore]);
    const nextStreak = userScore > aiScore ? streak + 1 : 0;
    setStreak(nextStreak);
    recordRound({ mode: "goalOrNot", roundScore: userScore, streak: nextStreak });
    setPhase("revealed");
  }

  function next() {
    if (round + 1 >= shots.length) {
      const total = userScores.reduce((a, b) => a + b, 0);
      finishGame({ mode: "goalOrNot", finalScore: total });
      setPhase("finished");
    } else {
      setRound((r) => r + 1);
      setPhase("guessing");
    }
  }

  if (phase === "error") return <div className="text-(--color-rival)">Error: {error}</div>;
  if (phase === "loading" || !shot) return <LogoSpinner label="Cargando disparos…" />;

  const userTotal = userScores.reduce((a, b) => a + b, 0);
  const aiTotal = aiScores.reduce((a, b) => a + b, 0);

  if (phase === "finished") {
    const won = userTotal > aiTotal;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <p className="text-xs uppercase tracking-widest text-(--color-text-faint)">{won ? "¡Le ganaste al modelo!" : "Ganó el modelo"}</p>
        <p className="font-display text-3xl">
          <span className={won ? "text-(--color-lime)" : ""}>VOS {userTotal}</span>
          {" – "}
          <span className={!won ? "text-(--color-lime)" : ""}>IA {aiTotal}</span>
        </p>
        <p className="text-sm text-(--color-text-dim)">
          Diferencia: {Math.abs(userTotal - aiTotal)} pts en {shots.length} rondas
        </p>
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

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-xl items-center justify-between">
        <Link to="/jugar" className="interactive rounded-full border border-(--color-border) p-2 hover:border-(--color-lime)">
          <ArrowLeft size={18} />
        </Link>
        <p className="text-sm text-(--color-text-dim)">
          Ronda {round + 1} / {shots.length} · {shot.home_team} vs {shot.away_team}, minuto {shot.minute}
        </p>
        <p className="text-stat text-(--color-lime)">
          VOS {userTotal} – IA {aiTotal}
        </p>
      </div>

      <HalfPitch shooter={{ x: shot.loc_x, y: shot.loc_y }} players={pitchPlayers} isGoal={phase === "revealed" && shot.is_goal === 1} />

      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        <AnimatePresence mode="wait">
          {phase === "guessing" ? (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid w-full grid-cols-2 gap-2 sm:grid-cols-5">
              {CONFIDENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => pick(opt.p)}
                  className="interactive clip-menu-sm border border-(--color-border) bg-(--color-surface) px-3 py-3 text-xs font-medium hover:border-(--color-lime) hover:text-(--color-lime)"
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex w-full flex-col items-center gap-3">
              <p className={`font-display text-3xl ${shot.is_goal ? "text-(--color-lime)" : "text-(--color-text-dim)"}`}>
                {shot.is_goal ? "¡GOL!" : "ATAJADA / AFUERA"}
              </p>
              <p className="text-sm text-(--color-text-dim)">
                Tu apuesta: {Math.round((lastPick ?? 0) * 100)}% · IA (xG): {Math.round(shot.xg_full * 100)}%
              </p>
              <p className="text-sm">
                Puntos: vos {userScores[userScores.length - 1]} · IA {aiScores[aiScores.length - 1]}
              </p>
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
