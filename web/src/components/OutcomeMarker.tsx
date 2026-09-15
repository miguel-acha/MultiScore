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
        // The real ball artwork the user picked, not a hand-drawn
        // approximation - a goal reads instantly as "the" soccer ball icon
        // this way, instead of just a big colored dot that blended into
        // the other outcome dots at a glance.
        <image href="/images/ball.png" x={1} y={1} width={18} height={18} preserveAspectRatio="xMidYMid meet" />
      )}
      {style.shape === "emoji" && (
        <text x={10} y={10.5} textAnchor="middle" dominantBaseline="central" fontSize={16}>
          {style.emoji}
        </text>
      )}
    </svg>
  );
}
