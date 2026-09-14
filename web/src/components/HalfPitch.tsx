// Vertical half-pitch: only the attacking third+ (StatsBomb x in
// [60,120]) with the goal at the TOP of the screen — shooting "up the
// screen", like an EA-style shot-menu pitch, instead of the old full
// horizontal pitch with a tiny goal on the right.
import { useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  GOAL_Y_LEFT,
  GOAL_Y_RIGHT,
  HALF_X_MIN,
  PITCH_X_MAX,
  PITCH_Y_MAX,
  VIEW_H,
  VIEW_W,
  PAD,
  box,
  clampPitch,
  fromSvg,
  toSvg,
} from "../lib/pitch";

export interface PitchPlayer {
  id: string;
  x: number;
  y: number;
  teammate: boolean;
  isGoalkeeper?: boolean;
  draggable?: boolean;
}

interface HalfPitchProps {
  shooter: { x: number; y: number };
  players: PitchPlayer[];
  onShooterMove?: (x: number, y: number) => void;
  onPlayerMove?: (id: string, x: number, y: number) => void;
  showTriangle?: boolean;
  goalCoveragePct?: number;
  shotEnd?: { x: number; y: number } | null;
}

export default function HalfPitch({
  shooter,
  players,
  onShooterMove,
  onPlayerMove,
  showTriangle = true,
  goalCoveragePct,
  shotEnd,
}: HalfPitchProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [shooterSvgX, shooterSvgY] = toSvg(shooter.x, shooter.y);
  const [leftPostX, leftPostY] = toSvg(PITCH_X_MAX, GOAL_Y_LEFT);
  const [rightPostX] = toSvg(PITCH_X_MAX, GOAL_Y_RIGHT);
  const goalY = leftPostY;

  const box18 = useMemo(() => box(102, 18, 120, 62), []);
  const box6 = useMemo(() => box(114, 30, 120, 50), []);
  const [penSpotX, penSpotY] = toSvg(108, 40);
  // Penalty arc: a 10-yard circle around the spot, drawn as an ellipse in
  // SVG space since the pitch-x and pitch-y axes are scaled slightly
  // differently to fill the viewBox. Only the part poking out past the
  // box edge (x=102) is visible, same as on a real pitch.
  const pxPerYardX = (VIEW_W - 2 * PAD) / PITCH_Y_MAX;
  const pxPerYardY = (VIEW_H - 2 * PAD) / (PITCH_X_MAX - HALF_X_MIN);
  const arcRx = 10 * pxPerYardX;
  const arcRy = 10 * pxPerYardY;
  const arcEdgeY = toSvg(102, 40)[1];
  const arcHalfChord = 8 * pxPerYardX;

  function handlePointerDown(e: React.PointerEvent<SVGElement>, onMove: (x: number, y: number) => void) {
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function move(ev: PointerEvent) {
      const rect = svg!.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
      const sy = ((ev.clientY - rect.top) / rect.height) * VIEW_H;
      const [x, y] = fromSvg(sx, sy);
      const [cx, cy] = clampPitch(x, y);
      onMove(cx, cy);
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const coveragePx =
    goalCoveragePct != null ? (Math.min(100, Math.max(0, goalCoveragePct)) / 100) * (rightPostX - leftPostX) : 0;

  const [shotEndSvgX, shotEndSvgY] = shotEnd ? toSvg(shotEnd.x, shotEnd.y) : [0, 0];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      className="block rounded-2xl border border-(--color-border)"
      style={{ maxWidth: 640, background: "var(--color-surface)", touchAction: "none" }}
    >
      <defs>
        <linearGradient id="pitch-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f4a30" />
          <stop offset="100%" stopColor="#0a2e1e" />
        </linearGradient>
      </defs>
      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={VIEW_H - 2 * PAD} rx={10} fill="url(#pitch-fill)" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect
          key={i}
          x={PAD}
          y={PAD + (i * (VIEW_H - 2 * PAD)) / 7}
          width={VIEW_W - 2 * PAD}
          height={(VIEW_H - 2 * PAD) / 7}
          fill={i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent"}
        />
      ))}

      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={VIEW_H - 2 * PAD} rx={10} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2.5} />

      <rect {...box18} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
      <rect {...box6} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
      <circle cx={penSpotX} cy={penSpotY} r={4} fill="rgba(255,255,255,0.75)" />
      <path
        d={`M ${penSpotX - arcHalfChord} ${arcEdgeY} A ${arcRx} ${arcRy} 0 0 0 ${penSpotX + arcHalfChord} ${arcEdgeY}`}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={2}
      />

      {/* goal + net — drawn with real visual weight (thick glowing posts,
          a deep net) instead of a hairline, so it reads as a goal even at
          a glance rather than disappearing at the top of the pitch. */}
      <g>
        {(() => {
          const netDepth = 30;
          const postW = rightPostX - leftPostX;
          return (
            <>
              <rect x={leftPostX} y={goalY - netDepth} width={postW} height={netDepth} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth={2} />
              {Array.from({ length: 7 }).map((_, i) => (
                <line key={`v${i}`} x1={leftPostX + (postW * i) / 6} y1={goalY - netDepth} x2={leftPostX + (postW * i) / 6} y2={goalY} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
              ))}
              {Array.from({ length: 4 }).map((_, i) => (
                <line key={`h${i}`} x1={leftPostX} y1={goalY - netDepth + (netDepth * (i + 1)) / 4} x2={rightPostX} y2={goalY - netDepth + (netDepth * (i + 1)) / 4} stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
              ))}
              {/* posts */}
              <line x1={leftPostX} y1={goalY - netDepth} x2={leftPostX} y2={goalY} stroke="#fff" strokeWidth={5} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))" }} />
              <line x1={rightPostX} y1={goalY - netDepth} x2={rightPostX} y2={goalY} stroke="#fff" strokeWidth={5} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))" }} />
              {/* crossbar + goal line, the two most important edges */}
              <line x1={leftPostX} y1={goalY - netDepth} x2={rightPostX} y2={goalY - netDepth} stroke="#fff" strokeWidth={5} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))" }} />
              <line x1={leftPostX} y1={goalY} x2={rightPostX} y2={goalY} stroke="#fff" strokeWidth={6} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.75))" }} />
            </>
          );
        })()}
      </g>

      {goalCoveragePct != null && goalCoveragePct > 0 && (
        <line
          x1={(leftPostX + rightPostX) / 2 - coveragePx / 2}
          y1={goalY}
          x2={(leftPostX + rightPostX) / 2 + coveragePx / 2}
          y2={goalY}
          stroke="#ff4d5e"
          strokeWidth={7}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}

      {showTriangle && (
        <polygon
          points={`${shooterSvgX},${shooterSvgY} ${leftPostX},${goalY} ${rightPostX},${goalY}`}
          fill="rgba(200,255,0,0.08)"
          stroke="rgba(200,255,0,0.3)"
        />
      )}

      {shotEnd && (
        <line
          x1={shooterSvgX}
          y1={shooterSvgY}
          x2={shotEndSvgX}
          y2={shotEndSvgY}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}

      {players.map((p) => {
        const [sx, sy] = toSvg(p.x, p.y);
        const fill = p.isGoalkeeper ? "var(--color-gk)" : p.teammate ? "var(--color-teammate)" : "var(--color-rival)";
        const radius = p.isGoalkeeper ? 11 : 9;
        return (
          <motion.g key={p.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}>
            <circle
              cx={sx}
              cy={sy}
              r={radius}
              fill={fill}
              stroke="#07090d"
              strokeWidth={2}
              data-player-id={p.id}
              style={{ cursor: p.draggable ? "grab" : "default" }}
              onPointerDown={(e) => p.draggable && onPlayerMove && handlePointerDown(e, (x, y) => onPlayerMove(p.id, x, y))}
            />
            {p.isGoalkeeper && (
              <text x={sx} y={sy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#07090d" pointerEvents="none">
                GK
              </text>
            )}
          </motion.g>
        );
      })}

      <motion.circle
        cx={shooterSvgX}
        cy={shooterSvgY}
        r={10}
        fill="var(--color-shooter)"
        stroke="var(--color-lime)"
        strokeWidth={2.5}
        style={{ cursor: onShooterMove ? "grab" : "default", filter: "drop-shadow(0 0 6px rgba(200,255,0,0.6))" }}
        onPointerDown={(e) => onShooterMove && handlePointerDown(e, onShooterMove)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      />
    </svg>
  );
}
