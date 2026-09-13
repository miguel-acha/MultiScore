// Reusable half-pitch SVG (StatsBomb coordinates: 120x80, attacking x=120).
// Renders the attacking third with the shooter, freeze-frame players, the
// shot triangle (shooter -> both posts) and optional drag handles for the
// simulator.
import { useMemo } from "react";

const PITCH_X_MIN = 60;
const PITCH_X_MAX = 120;
const PITCH_Y_MAX = 80;
const GOAL_Y_LEFT = 36;
const GOAL_Y_RIGHT = 44;

const VIEW_W = 480;
const VIEW_H = 400;

function toSvg(x: number, y: number): [number, number] {
  const sx = ((x - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * VIEW_W;
  const sy = (y / PITCH_Y_MAX) * VIEW_H;
  return [sx, sy];
}

function fromSvg(sx: number, sy: number): [number, number] {
  const x = (sx / VIEW_W) * (PITCH_X_MAX - PITCH_X_MIN) + PITCH_X_MIN;
  const y = (sy / VIEW_H) * PITCH_Y_MAX;
  return [x, y];
}

export interface PitchPlayer {
  id: string;
  x: number;
  y: number;
  teammate: boolean;
  isGoalkeeper?: boolean;
  draggable?: boolean;
}

interface PitchProps {
  shooter: { x: number; y: number };
  players: PitchPlayer[];
  onShooterMove?: (x: number, y: number) => void;
  onPlayerMove?: (id: string, x: number, y: number) => void;
  showTriangle?: boolean;
}

export default function Pitch({ shooter, players, onShooterMove, onPlayerMove, showTriangle = true }: PitchProps) {
  const [shooterSvgX, shooterSvgY] = toSvg(shooter.x, shooter.y);
  const [leftPostX, leftPostY] = toSvg(120, GOAL_Y_LEFT);
  const [rightPostX, rightPostY] = toSvg(120, GOAL_Y_RIGHT);

  const boxCorners = useMemo(() => {
    const p1 = toSvg(102, 18);
    const p2 = toSvg(120, 62);
    return { x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]), w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) };
  }, []);

  function handleDrag(e: React.MouseEvent<SVGCircleElement>, onMove: (x: number, y: number) => void) {
    const svg = (e.target as SVGElement).ownerSVGElement;
    if (!svg) return;

    function move(ev: MouseEvent) {
      const rect = svg!.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
      const sy = ((ev.clientY - rect.top) / rect.height) * VIEW_H;
      const [x, y] = fromSvg(Math.max(0, Math.min(VIEW_W, sx)), Math.max(0, Math.min(VIEW_H, sy)));
      onMove(Math.max(60, Math.min(120, x)), Math.max(0, Math.min(80, y)));
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" style={{ maxWidth: 480, background: "#e8f5ec", borderRadius: 8 }}>
      {/* pitch outline */}
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="none" stroke="#2f6b3e" strokeWidth={2} />
      {/* penalty box */}
      <rect x={boxCorners.x} y={boxCorners.y} width={boxCorners.w} height={boxCorners.h} fill="none" stroke="#2f6b3e" strokeWidth={1.5} />
      {/* goal */}
      <line x1={leftPostX} y1={leftPostY} x2={rightPostX} y2={rightPostY} stroke="#111" strokeWidth={4} />

      {showTriangle && (
        <polygon
          points={`${shooterSvgX},${shooterSvgY} ${leftPostX},${leftPostY} ${rightPostX},${rightPostY}`}
          fill="rgba(34,197,94,0.15)"
          stroke="rgba(34,197,94,0.5)"
        />
      )}

      {players.map((p) => {
        const [sx, sy] = toSvg(p.x, p.y);
        const fill = p.isGoalkeeper ? "#f59e0b" : p.teammate ? "#3b82f6" : "#ef4444";
        return (
          <circle
            key={p.id}
            cx={sx}
            cy={sy}
            r={7}
            fill={fill}
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: p.draggable ? "grab" : "default" }}
            onMouseDown={(e) => p.draggable && onPlayerMove && handleDrag(e, (x, y) => onPlayerMove(p.id, x, y))}
          />
        );
      })}

      <circle
        cx={shooterSvgX}
        cy={shooterSvgY}
        r={8}
        fill="#22c55e"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: onShooterMove ? "grab" : "default" }}
        onMouseDown={(e) => onShooterMove && handleDrag(e, onShooterMove)}
      />
    </svg>
  );
}
