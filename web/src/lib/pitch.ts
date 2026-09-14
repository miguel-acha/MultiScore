// Coordinate conversion for the vertical half-pitch, driven by a "camera"
// instead of a fixed crop - the SVG viewBox height is derived from the
// camera's extent so px-per-yard is always the same on both axes (a
// fixed-viewBox version was visibly stretched: the penalty arc rendered
// as an ellipse, the goal was proportionally tiny). The goal is always at
// the TOP of the screen: StatsBomb's attacking direction is x=120, and
// svgY = (camera.xMax - x) * scale, so higher x (closer to goal) means a
// smaller svgY.
export const PITCH_X_MAX = 120;
export const PITCH_Y_MAX = 80;

export const GOAL_Y_LEFT = 36;
export const GOAL_Y_RIGHT = 44;
export const GOAL_WIDTH_YD = GOAL_Y_RIGHT - GOAL_Y_LEFT;

export interface Camera {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// "attacking": the whole attacking third-plus, full pitch width.
export const CAMERA_ATTACKING: Camera = { xMin: 72, xMax: 120, yMin: 0, yMax: 80 };
// "box": zoomed to the penalty area, so the goal reads as an actual goal.
export const CAMERA_BOX: Camera = { xMin: 94, xMax: 120, yMin: 10, yMax: 70 };

export const VIEW_W = 800;
export const PAD = 20;

export function pxPerYard(camera: Camera): number {
  return (VIEW_W - 2 * PAD) / (camera.yMax - camera.yMin);
}

export function viewHeight(camera: Camera): number {
  return 2 * PAD + pxPerYard(camera) * (camera.xMax - camera.xMin);
}

export function toSvg(x: number, y: number, camera: Camera): [number, number] {
  const scale = pxPerYard(camera);
  const sx = PAD + (y - camera.yMin) * scale;
  const sy = PAD + (camera.xMax - x) * scale;
  return [sx, sy];
}

export function fromSvg(sx: number, sy: number, camera: Camera): [number, number] {
  const scale = pxPerYard(camera);
  const y = camera.yMin + (sx - PAD) / scale;
  const x = camera.xMax - (sy - PAD) / scale;
  return [x, y];
}

export function clampPitch(x: number, y: number, camera: Camera): [number, number] {
  return [
    Math.max(Math.max(0, camera.xMin), Math.min(Math.min(PITCH_X_MAX, camera.xMax), x)),
    Math.max(Math.max(0, camera.yMin), Math.min(Math.min(PITCH_Y_MAX, camera.yMax), y)),
  ];
}

export function box(x1: number, y1: number, x2: number, y2: number, camera: Camera) {
  const [sx1, sy1] = toSvg(x1, y1, camera);
  const [sx2, sy2] = toSvg(x2, y2, camera);
  return { x: Math.min(sx1, sx2), y: Math.min(sy1, sy2), width: Math.abs(sx2 - sx1), height: Math.abs(sy2 - sy1) };
}
