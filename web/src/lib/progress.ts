// Local-only "profile": game records live in localStorage, wrapped in
// try/catch since it can throw (private browsing, blocked storage) and
// there's no login yet — see the plan's "ideas for later" for real
// profiles/multiplayer.
export interface GameProgress {
  nickname: string | null;
  totalScore: number;
  gamesPlayed: number;
  bestStreak: number;
  bestScoreGuessXg: number;
  bestScoreGoalOrNot: number;
}

const KEY = "multiscore.progress.v1";

const DEFAULT_PROGRESS: GameProgress = {
  nickname: null,
  totalScore: 0,
  gamesPlayed: 0,
  bestStreak: 0,
  bestScoreGuessXg: 0,
  bestScoreGoalOrNot: 0,
};

export function loadProgress(): GameProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    return { ...DEFAULT_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(p: GameProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore — storage unavailable
  }
}

export function recordRound(opts: {
  mode: "guessXg" | "goalOrNot";
  roundScore: number;
  streak: number;
}): GameProgress {
  const p = loadProgress();
  p.totalScore += opts.roundScore;
  p.bestStreak = Math.max(p.bestStreak, opts.streak);
  saveProgress(p);
  return p;
}

export function finishGame(opts: { mode: "guessXg" | "goalOrNot"; finalScore: number }): GameProgress {
  const p = loadProgress();
  p.gamesPlayed += 1;
  if (opts.mode === "guessXg") p.bestScoreGuessXg = Math.max(p.bestScoreGuessXg, opts.finalScore);
  else p.bestScoreGoalOrNot = Math.max(p.bestScoreGoalOrNot, opts.finalScore);
  saveProgress(p);
  return p;
}
