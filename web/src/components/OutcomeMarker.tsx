// Shared shot-outcome glyph: a goal is a soccer-ball shape (bigger, most
// visually "loud" by design - it's the moment that matters most) and a
// save is a small plain dot. Distinguishing gol/atajado by SHAPE and SIZE,
// not just color, was requested after lime (goal) and yellow (saved) read
// as too similar at a glance in the timeline and shot maps - see
// lib/outcomes.ts for the color/shape/label source of truth this reads.
//
// Works both as a standalone HTML icon (just pass size) and nested inside
// an existing <svg> positioned by center point (pass x/y too, e.g.
// PlayerShotMap's pitch) - SVG allows a nested <svg> to open a new
// viewport, so no separate component is needed for the two contexts.
import type { OutcomeStyle } from "../lib/outcomes";

export default function OutcomeMarker({
  style,
  size,
  x,
  y,
  className,
}: {
  style: OutcomeStyle;
  size: number;
  x?: number;
  y?: number;
  className?: string;
}) {
  const props =
    x != null && y != null
      ? { x: x - size / 2, y: y - size / 2, width: size, height: size }
      : { width: size, height: size };

  return (
    <svg {...props} viewBox="0 0 20 20" className={className ?? "block"} style={{ overflow: "visible" }}>
      {style.shape === "ball" && (
        <>
          <circle cx={10} cy={10} r={9} fill={style.color} stroke="#07090d" strokeWidth={1} />
          <polygon points="10,5.5 13.2,8 12,11.8 8,11.8 6.8,8" fill="#07090d" />
        </>
      )}
      {style.shape === "square" && <rect x={3} y={3} width={14} height={14} rx={3} fill={style.color} stroke="#07090d" strokeWidth={1} />}
      {style.shape === "ring" && <circle cx={10} cy={10} r={7.5} fill="none" stroke={style.color} strokeWidth={2} />}
      {style.shape === "circle" && <circle cx={10} cy={10} r={7} fill={style.color} stroke="#07090d" strokeWidth={1.5} />}
    </svg>
  );
}
