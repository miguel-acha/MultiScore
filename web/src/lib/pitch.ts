// Coordinate conversion for the vertical half-pitch. StatsBomb uses a
// 120x80 pitch with the attacking direction toward x=120 (the right edge
// in the raw data). We only ever show the attacking half (x in [60,120])
// and draw it with the goal at the TOP of the screen, because that reads
// as "shooting up the screen at goal" the way EA-style shot menus do.
//
// Mapping: svgX = y (StatsBomb y runs 0..80, left touchline to right
// touchline as seen from behind the attacking goal), svgY = 120 - x (so
// x=120, the goal line, maps to svgY=0, the top).
export const PITCH_X_MAX = 120;
export const PITCH_Y_MAX = 80;
// Cropped to the attacking 45 yards (not the full 60-yard half) so the
// goal reads as a real goal instead of a hairline at the top of a long
// pitch — StatsBomb shots below x=75 are under 0.4% of the data, so
// almost nothing gets clamped off-screen by this.
export const HALF_X_MIN = 75;

export const GOAL_Y_LEFT = 36;
export const GOAL_Y_RIGHT = 44;
export const GOAL_WIDTH_YD = GOAL_Y_RIGHT - GOAL_Y_LEFT;

// Viewbox for the half-pitch SVG: wide short rectangle, x in [0,80], y in
// [0,60] (only the 60-yard attacking half, StatsBomb x in [60,120]).
export const VIEW_W = 800;
export const VIEW_H = 620;
export const PAD = 18;

export function toSvg(x: number, y: number): [number, number] {
  const sx = PAD + (y / PITCH_Y_MAX) * (VIEW_W - 2 * PAD);
  const sy = PAD + ((PITCH_X_MAX - x) / (PITCH_X_MAX - HALF_X_MIN)) * (VIEW_H - 2 * PAD);
  return [sx, sy];
}

export function fromSvg(sx: number, sy: number): [number, number] {
  const y = ((sx - PAD) / (VIEW_W - 2 * PAD)) * PITCH_Y_MAX;
  const x = PITCH_X_MAX - ((sy - PAD) / (VIEW_H - 2 * PAD)) * (PITCH_X_MAX - HALF_X_MIN);
  return [x, y];
}

export function clampPitch(x: number, y: number): [number, number] {
  return [Math.max(HALF_X_MIN, Math.min(PITCH_X_MAX, x)), Math.max(0, Math.min(PITCH_Y_MAX, y))];
}

export function box(x1: number, y1: number, x2: number, y2: number) {
  const [sx1, sy1] = toSvg(x1, y1);
  const [sx2, sy2] = toSvg(x2, y2);
  return { x: Math.min(sx1, sx2), y: Math.min(sy1, sy2), width: Math.abs(sx2 - sx1), height: Math.abs(sy2 - sy1) };
}
