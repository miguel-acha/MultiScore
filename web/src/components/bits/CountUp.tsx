// Animates a number counting up to `value` whenever it changes. Used for
// xG percentages, stat totals, etc. — small, dependency-free version of
// the react-bits CountUp pattern built on our own rAF loop (no extra lib).
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  style?: CSSProperties;
}

export default function CountUp({ value, duration = 700, decimals = 0, suffix = "", className, style }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={className} style={style}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
