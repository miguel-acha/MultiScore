// Broadcast-style vertical half-pitch. Rebuilt on a "camera" (see
// lib/pitch.ts) instead of a fixed, distorted viewBox - every camera uses
// the same px-per-yard on both axes, so the penalty arc is a circle and
// the goal is proportioned correctly instead of stretched. Two cameras
// are exported by lib/pitch.ts: CAMERA_ATTACKING (the whole attacking
// third, used for shot maps) and CAMERA_BOX (zoomed on the penalty area,
// the Simulator's default - the goal used to look tiny because the
// wrapper div it sat in had no explicit width, and the crop was 60 yards
// tall for an 8-yard goal).
import { useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  GOAL_Y_LEFT,
  GOAL_Y_RIGHT,
  PITCH_X_MAX,
  VIEW_W,
  PAD,
  box,
  clampPitch,
  fromSvg,
  pxPerYard,
  toSvg,
  viewHeight,
  CAMERA_ATTACKING,
} from "../lib/pitch";
import type { Camera } from "../lib/pitch";
import { goalShadows } from "../lib/geometry";
import { positionAbbr } from "../lib/format";

export interface PitchPlayer {
  id: string;
  x: number;
  y: number;
  teammate: boolean;
  isGoalkeeper?: boolean;
  draggable?: boolean;
  position?: string;
  name?: string;
}

interface HalfPitchProps {
  shooter: { x: number; y: number };
  players: PitchPlayer[];
  onShooterMove?: (x: number, y: number) => void;
  onPlayerMove?: (id: string, x: number, y: number) => void;
  onPlayerDoubleClick?: (id: string) => void;
  showTriangle?: boolean;
  shotEnd?: { x: number; y: number } | null;
  isGoal?: boolean;
  camera?: Camera;
}

let gradId = 0;

export default function HalfPitch({
  shooter,
  players,
  onShooterMove,
  onPlayerMove,
  onPlayerDoubleClick,
  showTriangle = true,
  shotEnd,
  isGoal,
  camera = CAMERA_ATTACKING,
}: HalfPitchProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useMemo(() => `hp${gradId++}`, []);
  const scale = pxPerYard(camera);
  const viewH = viewHeight(camera);

  const [shooterSvgX, shooterSvgY] = toSvg(shooter.x, shooter.y, camera);
  const [leftPostX, leftPostY] = toSvg(PITCH_X_MAX, GOAL_Y_LEFT, camera);
  const [rightPostX] = toSvg(PITCH_X_MAX, GOAL_Y_RIGHT, camera);
  const goalY = leftPostY;
  const lineW = Math.max(1.5, scale * 0.12);

  const box18 = useMemo(() => box(102, 18, 120, 62, camera), [camera]);
  const box6 = useMemo(() => box(114, 30, 120, 50, camera), [camera]);
  const [penSpotX, penSpotY] = toSvg(108, 40, camera);
  const arcRadiusPx = 10 * scale;
  const arcEdgeY = toSvg(102, 40, camera)[1];
  const arcDx = penSpotY - arcEdgeY; // distance box-edge to spot, in px (both axes share scale)
  const arcHalfChord = Math.sqrt(Math.max(0, arcRadiusPx ** 2 - arcDx ** 2));

  // Corner arcs sit at the goal-line corners (x=120, y=0 and y=80) - only
  // relevant/visible when the camera's y-range reaches a touchline.
  const cornerRadius = 1 * scale;
  const showLeftCorner = camera.yMin <= 0;
  const showRightCorner = camera.yMax >= 80;
  const [leftCornerX, leftCornerY] = toSvg(120, 0, camera);
  const [rightCornerX, rightCornerY] = toSvg(120, 80, camera);

  // Real shadows each rival/keeper casts on the goal line, from the same
  // geometry the model uses (lib/geometry.ts), instead of one bar
  // centered on the goal regardless of where the blockers actually stand.
  const shadowIntervals = useMemo(() => {
    const obstacles = players.filter((p) => !p.teammate).map((p) => ({ x: p.x, y: p.y }));
    return goalShadows({ x: shooter.x, y: shooter.y }, obstacles);
  }, [players, shooter]);

  function handlePointerDown(e: React.PointerEvent<SVGElement>, onMove: (x: number, y: number) => void) {
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function move(ev: PointerEvent) {
      const rect = svg!.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * VIEW_W;
      const sy = ((ev.clientY - rect.top) / rect.height) * viewH;
      const [x, y] = fromSvg(sx, sy, camera);
      const [cx, cy] = clampPitch(x, y, camera);
      onMove(cx, cy);
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const [shotEndSvgX, shotEndSvgY] = shotEnd ? toSvg(shotEnd.x, shotEnd.y, camera) : [0, 0];
  const netDepth = 4.2 * scale;

  return (
    <motion.svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      animate={{ viewBox: `0 0 ${VIEW_W} ${viewH}` }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      width="100%"
      className="block rounded-2xl border border-(--color-border)"
      style={{ maxWidth: 640, background: "#0a2e1e", touchAction: "none" }}
    >
      <defs>
        <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c6b3f" />
          <stop offset="55%" stopColor="#186238" />
          <stop offset="100%" stopColor="#134f2e" />
        </linearGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="15%" r="85%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </radialGradient>
        <linearGradient id={`${uid}-triangle`} x1={shooterSvgX} y1={shooterSvgY} x2={(leftPostX + rightPostX) / 2} y2={goalY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.03" />
          <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0.22" />
        </linearGradient>
        <pattern id={`${uid}-net`} width={netDepth / 5} height={netDepth / 5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d={`M 0 0 L 0 ${netDepth / 5}`} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
          <path d={`M 0 0 L ${netDepth / 5} 0`} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
        </pattern>
        <linearGradient id={`${uid}-post`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6dbe3" />
        </linearGradient>
        <filter id={`${uid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.05" />
          </feComponentTransfer>
        </filter>
      </defs>

      {/* grass */}
      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={viewH - 2 * PAD} rx={10} fill={`url(#${uid}-grass)`} />
      {Array.from({ length: Math.ceil((camera.xMax - camera.xMin) / 5) + 1 }).map((_, i) => {
        const yTop = toSvg(camera.xMax - i * 5, camera.yMin, camera)[1];
        const stripeH = 5 * scale;
        return (
          <rect
            key={i}
            x={PAD}
            y={Math.max(PAD, yTop)}
            width={VIEW_W - 2 * PAD}
            height={stripeH}
            fill={i % 2 === 0 ? "rgba(255,255,255,0.035)" : "transparent"}
          />
        );
      })}
      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={viewH - 2 * PAD} rx={10} fill="#ffffff" filter={`url(#${uid}-grain)`} />
      <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={viewH - 2 * PAD} rx={10} fill={`url(#${uid}-vignette)`} />

      {/* pitch markings */}
      <g stroke="rgba(255,255,255,0.92)" strokeWidth={lineW} fill="none">
        <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={viewH - 2 * PAD} rx={10} />
        <rect {...box18} />
        <rect {...box6} />
        <path
          d={`M ${penSpotX - arcHalfChord} ${arcEdgeY} A ${arcRadiusPx} ${arcRadiusPx} 0 0 0 ${penSpotX + arcHalfChord} ${arcEdgeY}`}
        />
        {showLeftCorner && (
          <path d={`M ${leftCornerX + cornerRadius} ${leftCornerY} A ${cornerRadius} ${cornerRadius} 0 0 1 ${leftCornerX} ${leftCornerY + cornerRadius}`} />
        )}
        {showRightCorner && (
          <path d={`M ${rightCornerX} ${rightCornerY + cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${rightCornerX - cornerRadius} ${rightCornerY}`} />
        )}
      </g>
      <circle cx={penSpotX} cy={penSpotY} r={Math.max(2, scale * 0.12)} fill="rgba(255,255,255,0.85)" />

      {/* goal, with real depth: back of the net is narrower than the
          front (posts), a diamond mesh, and a ground shadow - instead of
          a flat rectangle with two lines through it. */}
      <g>
        <ellipse cx={(leftPostX + rightPostX) / 2} cy={goalY + 3} rx={(rightPostX - leftPostX) / 2 + 6} ry={5} fill="rgba(0,0,0,0.35)" />
        <path
          d={`M ${leftPostX} ${goalY} L ${leftPostX + netDepth * 0.12} ${goalY - netDepth} L ${rightPostX - netDepth * 0.12} ${goalY - netDepth} L ${rightPostX} ${goalY} Z`}
          fill={`url(#${uid}-net)`}
          opacity={0.9}
        />
        <path
          d={`M ${leftPostX} ${goalY} L ${leftPostX + netDepth * 0.12} ${goalY - netDepth} L ${rightPostX - netDepth * 0.12} ${goalY - netDepth} L ${rightPostX} ${goalY} Z`}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
        {isGoal && (
          <motion.path
            d={`M ${leftPostX} ${goalY} L ${leftPostX + netDepth * 0.12} ${goalY - netDepth} L ${rightPostX - netDepth * 0.12} ${goalY - netDepth} L ${rightPostX} ${goalY} Z`}
            fill="#ffffff"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          />
        )}
        <line x1={leftPostX} y1={goalY - netDepth} x2={leftPostX + netDepth * 0.12} y2={goalY - netDepth} stroke="#e8e8e8" strokeWidth={lineW * 1.6} strokeLinecap="round" />
        <line
          x1={leftPostX + netDepth * 0.12}
          y1={goalY - netDepth}
          x2={rightPostX - netDepth * 0.12}
          y2={goalY - netDepth}
          stroke={`url(#${uid}-post)`}
          strokeWidth={lineW * 2}
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))" }}
        />
        <line x1={leftPostX} y1={goalY - netDepth} x2={leftPostX} y2={goalY} stroke="#ffffff" strokeWidth={lineW * 2} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))" }} />
        <line x1={rightPostX} y1={goalY - netDepth} x2={rightPostX} y2={goalY} stroke="#ffffff" strokeWidth={lineW * 2} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))" }} />
        <line x1={leftPostX} y1={goalY} x2={rightPostX} y2={goalY} stroke="#ffffff" strokeWidth={lineW * 2.4} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))" }} />
      </g>

      {/* the real, per-defender shadow on the goal line */}
      {shadowIntervals.map(([lo, hi], i) => {
        const [x1] = toSvg(120, lo, camera);
        const [x2] = toSvg(120, hi, camera);
        return (
          <line key={i} x1={x1} y1={goalY} x2={x2} y2={goalY} stroke="var(--color-rival)" strokeWidth={lineW * 2.4} strokeLinecap="round" opacity={0.85} />
        );
      })}

      {showTriangle && (
        <polygon
          points={`${shooterSvgX},${shooterSvgY} ${leftPostX},${goalY} ${rightPostX},${goalY}`}
          fill={`url(#${uid}-triangle)`}
          stroke="rgba(200,255,0,0.3)"
          strokeWidth={1}
        />
      )}

      {shotEnd && (
        <>
          <motion.line
            x1={shooterSvgX}
            y1={shooterSvgY}
            x2={shotEndSvgX}
            y2={shotEndSvgY}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={2}
            strokeDasharray="1 5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          <motion.circle
            r={3.5}
            fill="#ffffff"
            initial={{ cx: shooterSvgX, cy: shooterSvgY, opacity: 0 }}
            animate={{ cx: shotEndSvgX, cy: shotEndSvgY, opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </>
      )}

      {players.map((p) => {
        const [sx, sy] = toSvg(p.x, p.y, camera);
        const fill = p.isGoalkeeper ? "var(--color-gk)" : p.teammate ? "var(--color-teammate)" : "var(--color-rival)";
        const radius = p.isGoalkeeper ? 11 : 9.5;
        const abbr = p.isGoalkeeper ? "GK" : positionAbbr(p.position);
        return (
          <motion.g
            key={p.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            onDoubleClick={() => onPlayerDoubleClick?.(p.id)}
          >
            <ellipse cx={sx} cy={sy + radius * 0.75} rx={radius * 0.9} ry={radius * 0.32} fill="rgba(0,0,0,0.4)" />
            <circle
              cx={sx}
              cy={sy}
              r={radius}
              fill={fill}
              stroke="#ffffff"
              strokeWidth={2}
              data-player-id={p.id}
              style={{ cursor: p.draggable ? "grab" : "default" }}
              onPointerDown={(e) => p.draggable && onPlayerMove && handlePointerDown(e, (x, y) => onPlayerMove(p.id, x, y))}
            >
              {p.name && <title>{p.name}</title>}
            </circle>
            {abbr && (
              <text x={sx} y={sy + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#07090d" pointerEvents="none">
                {abbr}
              </text>
            )}
          </motion.g>
        );
      })}

      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
        <ellipse cx={shooterSvgX} cy={shooterSvgY + 8} rx={9} ry={3} fill="rgba(0,0,0,0.4)" />
        <circle
          cx={shooterSvgX}
          cy={shooterSvgY}
          r={10}
          fill="var(--color-shooter)"
          stroke="var(--color-lime)"
          strokeWidth={2.5}
          style={{ cursor: onShooterMove ? "grab" : "default", filter: "drop-shadow(0 0 6px rgba(200,255,0,0.6))" }}
          onPointerDown={(e) => onShooterMove && handlePointerDown(e, onShooterMove)}
        />
      </motion.g>
    </motion.svg>
  );
}
