// TypeScript port of ml/multiscore/geometry.py's goal_shadow_interval /
// goal_coverage_pct — used ONLY to draw where each defender's shadow
// falls on the goal line (so the covered part of the goal actually lines
// up with the players on screen), never to compute the xG-relevant
// percentage itself, which always comes from the API.
export const GOAL_X = 120;
export const GOAL_Y_LEFT_POST = 36;
export const GOAL_Y_RIGHT_POST = 44;
const OBSTACLE_HALF_WIDTH_YD = 0.25 / 0.9144; // same 0.25m half-width as the Python version

export interface Point {
  x: number;
  y: number;
}

export function goalShadowInterval(shooter: Point, obstacle: Point): [number, number] | null {
  if (obstacle.x <= shooter.x) return null;
  const t = (GOAL_X - shooter.x) / (obstacle.x - shooter.x);
  if (t <= 0) return null;
  const projectedY = shooter.y + t * (obstacle.y - shooter.y);
  const halfWidth = OBSTACLE_HALF_WIDTH_YD * t;
  return [projectedY - halfWidth, projectedY + halfWidth];
}

/** Merged, clamped-to-goal shadow intervals for a list of obstacles - each
 * one is a [lo, hi] segment (in StatsBomb y units) of the goal line that
 * obstacle blocks as seen from the shooter. */
export function goalShadows(shooter: Point, obstacles: Point[]): [number, number][] {
  const intervals: [number, number][] = [];
  for (const obstacle of obstacles) {
    const shadow = goalShadowInterval(shooter, obstacle);
    if (!shadow) continue;
    const lo = Math.max(shadow[0], GOAL_Y_LEFT_POST);
    const hi = Math.min(shadow[1], GOAL_Y_RIGHT_POST);
    if (hi > lo) intervals.push([lo, hi]);
  }
  return intervals;
}
