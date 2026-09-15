// Single source of truth for how a shot's result is shown anywhere in the
// app (timeline, shot lists, player shot maps, pitch markers): a Spanish
// label plus a color+shape, so "red" never has to double as both "a team"
// and "a result" the way the old MatchTimeline did (home/away used to be
// color-coded the same way outcomes are now, which read as "red = missed"
// to a first-time viewer). Team is shown by lane + crest instead.
export type OutcomeKind = "goal" | "saved" | "blocked" | "off_target" | "post";

export interface OutcomeStyle {
  kind: OutcomeKind;
  label: string;
  color: string;
  shape: "ball" | "emoji";
  emoji?: string;
}

const GOAL: OutcomeStyle = { kind: "goal", label: "Gol", color: "var(--color-lime)", shape: "ball" };
const SAVED: OutcomeStyle = { kind: "saved", label: "Atajado", color: "var(--color-gk)", shape: "emoji", emoji: "🧤" };
const BLOCKED: OutcomeStyle = { kind: "blocked", label: "Bloqueado", color: "var(--color-rival)", shape: "emoji", emoji: "🧱" };
const OFF_TARGET: OutcomeStyle = { kind: "off_target", label: "Afuera", color: "var(--color-text-faint)", shape: "emoji", emoji: "❌" };
const POST: OutcomeStyle = { kind: "post", label: "Palo", color: "#ffffff", shape: "emoji", emoji: "🪵" };

const OUTCOME_MAP: Record<string, OutcomeStyle> = {
  Goal: GOAL,
  Saved: SAVED,
  "Saved to Post": SAVED,
  "Saved Off Target": SAVED,
  Blocked: BLOCKED,
  "Off T": OFF_TARGET,
  Wayward: OFF_TARGET,
  Post: POST,
};

export function outcomeStyle(shotOutcome: string | null | undefined, isGoal?: boolean): OutcomeStyle {
  if (isGoal) return GOAL;
  if (shotOutcome && OUTCOME_MAP[shotOutcome]) return OUTCOME_MAP[shotOutcome];
  return OFF_TARGET;
}

export const OUTCOME_LEGEND: OutcomeStyle[] = [GOAL, SAVED, BLOCKED, OFF_TARGET, POST];
