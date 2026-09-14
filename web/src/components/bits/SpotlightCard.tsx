// Card with a soft radial highlight that follows the pointer — the
// react-bits "spotlight" effect, implemented with a CSS custom property
// updated on pointermove so it costs no re-render.
import type { ReactNode, CSSProperties } from "react";
import { useRef } from "react";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  spotlightColor?: string;
  onClick?: () => void;
}

export default function SpotlightCard({
  children,
  className = "",
  style,
  spotlightColor = "rgba(200, 255, 0, 0.14)",
  onClick,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onClick={onClick}
      className={`relative overflow-hidden ${className}`}
      style={{
        ...style,
        backgroundImage: `radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlightColor}, transparent 70%)`,
      }}
    >
      {children}
    </div>
  );
}
