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
import OutcomeMarker from "./OutcomeMarker";
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
  const hoveredStyle = hovered ? outcomeStyle(hovered.shot_outcome, hovered.is_goal === 1) : null;

  return (
    // Fills its grid column instead of capping at a fixed 640px - on
    // PlayerView's wide `1fr` column that cap left the pitch looking
    // tiny with a huge dead gap next to it, unlike every other full-width
    // panel on the page.
    <div className="w-full">
      {/* Fixed-height info strip above the pitch, not a floating tooltip
          anchored to the hovered point - that used to sit right on top of
          (and hide) the very ball marker you're hovering, especially now
          that goal markers are big. Same pattern as MatchTimeline's strip. */}
      <div className="mb-2 flex h-11 items-center border border-(--color-border) bg-(--color-surface-2) px-3 clip-menu-sm">
        <AnimatePresence mode="wait">
          {hovered && hoveredStyle ? (
            <motion.div
              key={hovered.event_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex w-full items-center gap-2 text-xs"
            >
              <OutcomeMarker style={hoveredStyle} size={16} />
              <Link to={`/partido/${hovered.match_id}?tiro=${hovered.event_id}`} className="font-medium hover:text-(--color-lime)">
                {hoveredStyle.label} · xG {hovered.xg_full.toFixed(2)}
              </Link>
              <span className="text-(--color-text-faint)">{hovered.minute}&apos; · {hovered.team} · ver partido</span>
            </motion.div>
          ) : (
            <p className="text-xs text-(--color-text-faint)">Pasá el mouse sobre un disparo para ver el detalle.</p>
          )}
        </AnimatePresence>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        width="100%"
        className="block rounded-2xl border border-(--color-border)"
        style={{ background: "#134f2e" }}
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
        // Goals scale a lot more with xG than other outcomes, and start
        // bigger - hundreds of shots plotted together were reading as an
        // undifferentiated speckle; a big, classic ball for the high-value
        // moments (goals) is what should pop out of that noise.
        const size = (style.shape === "ball" ? 13 : 13) + Math.min(1, s.xg_full) * (style.shape === "ball" ? 15 : 8);
        return (
          <motion.g
            key={s.event_id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: Math.min(i * 0.008, 0.6), type: "spring", stiffness: 300, damping: 20 }}
            style={{ cursor: "pointer", transformOrigin: `${sx}px ${sy}px` }}
            onMouseEnter={() => setHoverId(s.event_id)}
            onMouseLeave={() => setHoverId((h) => (h === s.event_id ? null : h))}
          >
            <OutcomeMarker style={style} size={size} x={sx} y={sy} />
          </motion.g>
        );
      })}

    </svg>
    </div>
  );
}
