// A player's every shot plotted on the attacking third: marker shape and
// color from lib/outcomes.ts (same vocabulary as the match timeline), size
// by xG. Deliberately a separate, simpler component from HalfPitch (which
// is built for dragging live player pucks around) rather than overloading
// it with a second, static "plot N historical points" mode.
import { useState } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { CAMERA_ATTACKING, GOAL_Y_LEFT, GOAL_Y_RIGHT, PAD, PITCH_X_MAX, VIEW_W, box, pxPerYard, toSvg, viewHeight } from "../lib/pitch";
import { outcomeStyle } from "../lib/outcomes";
import type { Shot } from "../api";

export default function PlayerShotMap({ shots }: { shots: Shot[] }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const camera = CAMERA_ATTACKING;
  const scale = pxPerYard(camera);
  const viewH = viewHeight(camera);
  const lineW = Math.max(1.5, scale * 0.12);

  const [leftPostX, leftPostY] = toSvg(PITCH_X_MAX, GOAL_Y_LEFT, camera);
  const [rightPostX] = toSvg(PITCH_X_MAX, GOAL_Y_RIGHT, camera);
  const goalY = leftPostY;
  const box18 = box(102, 18, 120, 62, camera);
  const box6 = box(114, 30, 120, 50, camera);
  const [penSpotX, penSpotY] = toSvg(108, 40, camera);
  const arcRadiusPx = 10 * scale;
  const arcEdgeY = toSvg(102, 40, camera)[1];
  const arcHalfChord = Math.sqrt(Math.max(0, arcRadiusPx ** 2 - (penSpotY - arcEdgeY) ** 2));

  const hovered = shots.find((s) => s.event_id === hoverId);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${viewH}`}
      width="100%"
      className="block rounded-2xl border border-(--color-border)"
      style={{ maxWidth: 640, background: "#134f2e" }}
    >
      <g stroke="rgba(255,255,255,0.5)" strokeWidth={lineW} fill="none">
        <rect x={PAD} y={PAD} width={VIEW_W - 2 * PAD} height={viewH - 2 * PAD} rx={10} />
        <rect {...box18} />
        <rect {...box6} />
        <path d={`M ${penSpotX - arcHalfChord} ${arcEdgeY} A ${arcRadiusPx} ${arcRadiusPx} 0 0 0 ${penSpotX + arcHalfChord} ${arcEdgeY}`} />
      </g>
      <line x1={leftPostX} y1={goalY} x2={rightPostX} y2={goalY} stroke="#ffffff" strokeWidth={lineW * 2.2} strokeLinecap="round" />
      <circle cx={penSpotX} cy={penSpotY} r={Math.max(2, scale * 0.12)} fill="rgba(255,255,255,0.75)" />

      {shots.map((s, i) => {
        const [sx, sy] = toSvg(s.loc_x, s.loc_y, camera);
        const style = outcomeStyle(s.shot_outcome, s.is_goal === 1);
        const r = 3.5 + Math.min(1, s.xg_full) * 6;
        return (
          <motion.circle
            key={s.event_id}
            cx={sx}
            cy={sy}
            r={r}
            fill={style.shape === "ring" ? "transparent" : style.color}
            stroke={style.color}
            strokeWidth={style.shape === "ring" ? 1.5 : 1}
            opacity={0.9}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: Math.min(i * 0.008, 0.6), type: "spring", stiffness: 300, damping: 20 }}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverId(s.event_id)}
            onMouseLeave={() => setHoverId((h) => (h === s.event_id ? null : h))}
          />
        );
      })}

      <AnimatePresence>
        {hovered && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <foreignObject
              x={Math.min(VIEW_W - 190, Math.max(10, toSvg(hovered.loc_x, hovered.loc_y, camera)[0] - 90))}
              y={Math.max(10, toSvg(hovered.loc_x, hovered.loc_y, camera)[1] - 54)}
              width={180}
              height={46}
            >
              <div className="clip-menu-sm border border-(--color-border-strong) bg-(--color-surface-2) px-2.5 py-1.5 text-xs text-(--color-text)">
                <Link to={`/partido/${hovered.match_id}?tiro=${hovered.event_id}`} className="font-medium hover:text-(--color-lime)">
                  {outcomeStyle(hovered.shot_outcome, hovered.is_goal === 1).label} · xG {hovered.xg_full.toFixed(2)}
                </Link>
                <p className="text-(--color-text-faint)">{hovered.minute}&apos; · {hovered.team} · ver partido</p>
              </div>
            </foreignObject>
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}
