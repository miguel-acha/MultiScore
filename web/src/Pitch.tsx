// Reusable full-pitch SVG (StatsBomb coordinates: 120x80, attacking x=120).
// Renders the whole pitch (not just the attacking third) so the user can
// see a defender is only dangerous when it's actually between the shooter
// and the goal - a big source of confusion in the cramped v1 view, where
// "surrounded" visually didn't always mean "blocking".
import { useMemo, useRef } from "react";

const PITCH_X_MAX = 120;
const PITCH_Y_MAX = 80;
const GOAL_Y_LEFT = 36;
const GOAL_Y_RIGHT = 44;
const GOAL_WIDTH = GOAL_Y_RIGHT - GOAL_Y_LEFT;

const VIEW_W = 960;
const VIEW_H = 660;
const PAD = 16;

function toSvg(x: number, y: number): [number, number] {
  const sx = PAD + (x / PITCH_X_MAX) * (VIEW_W - 2 * PAD);
  const sy = PAD + (y / PITCH_Y_MAX) * (VIEW_H - 2 * PAD);
  return [sx, sy];
}

function fromSvg(sx: number, sy: number): [number, number] {
  const x = ((sx - PAD) / (VIEW_W - 2 * PAD)) * PITCH_X_MAX;
  const y = ((sy - PAD) / (VIEW_H - 2 * PAD)) * PITCH_Y_MAX;
  return [x, y];
}

function box(x1: number, y1: number, x2: number, y2: number) {
  const [sx1, sy1] = toSvg(x1, y1);
  const [sx2, sy2] = toSvg(x2, y2);
  return { x: Math.min(sx1, sx2), y: Math.min(sy1, sy2), w: Math.abs(sx2 - sx1), h: Math.abs(sy2 - sy1) };
}

export interface PitchPlayer {
  id: string;
  x: number;
  y: number;
  teammate: boolean;
  isGoalkeeper?: boolean;
  draggable?: boolean;
  label?: string;
}

interface PitchProps {
  shooter: { x: number; y: number };
  players: PitchPlayer[];
  onShooterMove?: (x: number, y: number) => void;
  onPlayerMove?: (id: string, x: number, y: number) => void;
  showTriangle?: boolean;
  goalCoveragePct?: number;
}

export default function Pitch({
  shooter,
  players,
  onShooterMove,
  onPlayerMove,
  showTriangle = true,
  goalCoveragePct,
}: PitchProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [shooterSvgX, shooterSvgY] = toSvg(shooter.x, shooter.y);
  const [leftPostX, leftPostY] = toSvg(PITCH_X_MAX, GOAL_Y_LEFT);
  const [rightPostX, rightPostY] = toSvg(PITCH_X_MAX, GOAL_Y_RIGHT);
  const [centerX, centerY] = toSvg(PITCH_X_MAX / 2, PITCH_Y_MAX / 2);

  const rightBox = useMemo(() => box(102, 18, 120, 62), []);
  const rightSixYard = useMemo(() => box(114, 30, 120, 50), []);
  const leftBox = useMemo(() => box(0, 18, 18, 62), []);
  const leftSixYard = useMemo(() => box(0, 30, 6, 50), []);
  const [rightPenSpotX, rightPenSpotY] = toSvg(108, 40);
  const [leftPenSpotX, leftPenSpotY] = toSvg(12, 40);
  const [rightArcX] = toSvg(102, 40);
  const [leftArcX] = toSvg(18, 40);
  // Penalty arc: radius = 10yd from the spot, drawn only where it pokes
  // out past the box edge (the part actually visible on a real pitch).
  const arcRadiusPx = (10 / PITCH_X_MAX) * (VIEW_W - 2 * PAD);
  const arcDx = rightPenSpotX - rightArcX;
  const arcHalfChord = Math.sqrt(Math.max(0, arcRadiusPx ** 2 - arcDx ** 2));

  function handlePointerDown(e: React.PointerEvent<SVGElement>, onMove: (x: number, y: number) => void) {
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function move(ev: PointerEvent) {
      const rect = svg!.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
      const sy = ((ev.clientY - rect.top) / rect.height) * VIEW_H;
      const [x, y] = fromSvg(sx, sy);
      onMove(Math.max(0, Math.min(PITCH_X_MAX, x)), Math.max(0, Math.min(PITCH_Y_MAX, y)));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const coveragePx = goalCoveragePct != null ? (Math.min(100, Math.max(0, goalCoveragePct)) / 100) * (rightPostY - leftPostY) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      style={{ maxWidth: 960, width: "100%", background: "#0e3b2a", borderRadius: 10, display: "block", touchAction: "none" }}
    >
      {/* alternating mow stripes for a broadcast feel */}
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x={PAD + (i * (VIEW_W - 2 * PAD)) / 8}
          y={PAD}
          width={(VIEW_W - 2 * PAD) / 8}
          height={VIEW_H - 2 * PAD}
          fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
        />
      ))}

      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={VIEW_H - 2 * PAD} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
      <line x1={centerX} y1={PAD} x2={centerX} y2={VIEW_H - PAD} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
      <circle cx={centerX} cy={centerY} r={40} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />

      {/* penalty areas, both ends, for pitch context */}
      <rect {...rightBox} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      <rect {...rightSixYard} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
      <circle cx={rightPenSpotX} cy={rightPenSpotY} r={4} fill="rgba(255,255,255,0.5)" />
      <path
        d={`M ${rightArcX} ${rightPenSpotY - arcHalfChord} A ${arcRadiusPx} ${arcRadiusPx} 0 0 0 ${rightArcX} ${rightPenSpotY + arcHalfChord}`}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={1.5}
      />
      <rect {...leftBox} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      <rect {...leftSixYard} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      <circle cx={leftPenSpotX} cy={leftPenSpotY} r={4} fill="rgba(255,255,255,0.3)" />
      <path
        d={`M ${leftArcX} ${leftPenSpotY - arcHalfChord} A ${arcRadiusPx} ${arcRadiusPx} 0 0 1 ${leftArcX} ${leftPenSpotY + arcHalfChord}`}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1.5}
      />

      {/* attacking goal, highlighted */}
      <line x1={leftPostX} y1={leftPostY} x2={rightPostX} y2={rightPostY} stroke="#fff" strokeWidth={5} strokeLinecap="round" />
      {/* the covered portion of the goal mouth, centered - a simplified but
          honest stand-in for the exact shadow shape (the API only reports a
          percentage, not the intervals), so the user can *see* what
          "goal_coverage_pct" means instead of just reading a number. */}
      {goalCoveragePct != null && goalCoveragePct > 0 && (
        <line
          x1={rightPostX}
          y1={(leftPostY + rightPostY) / 2 - coveragePx / 2}
          x2={rightPostX}
          y2={(leftPostY + rightPostY) / 2 + coveragePx / 2}
          stroke="#ef4444"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}

      {showTriangle && (
        <polygon
          points={`${shooterSvgX},${shooterSvgY} ${leftPostX},${leftPostY} ${rightPostX},${rightPostY}`}
          fill="rgba(74,222,128,0.14)"
          stroke="rgba(74,222,128,0.45)"
        />
      )}

      {players.map((p) => {
        const [sx, sy] = toSvg(p.x, p.y);
        const fill = p.isGoalkeeper ? "#facc15" : p.teammate ? "#38bdf8" : "#f87171";
        const radius = p.isGoalkeeper ? 10 : 8;
        return (
          <g key={p.id}>
            <circle
              cx={sx}
              cy={sy}
              r={radius}
              fill={fill}
              stroke="#0b1220"
              strokeWidth={2}
              style={{ cursor: p.draggable ? "grab" : "default" }}
              onPointerDown={(e) => p.draggable && onPlayerMove && handlePointerDown(e, (x, y) => onPlayerMove(p.id, x, y))}
            />
            {p.isGoalkeeper && (
              <text x={sx} y={sy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0b1220" pointerEvents="none">
                A
              </text>
            )}
          </g>
        );
      })}

      <circle
        cx={shooterSvgX}
        cy={shooterSvgY}
        r={9}
        fill="#4ade80"
        stroke="#0b1220"
        strokeWidth={2}
        style={{ cursor: onShooterMove ? "grab" : "default" }}
        onPointerDown={(e) => onShooterMove && handlePointerDown(e, onShooterMove)}
      />
    </svg>
  );
}

export const GOAL_WIDTH_YD = GOAL_WIDTH;
