// Small burst of lime particles on confirm — react-bits "ClickSpark",
// implemented as a lightweight canvas-free absolute-positioned burst that
// mounts, animates once via CSS, then unmounts itself.
import { useEffect, useState } from "react";

interface Spark {
  id: number;
  angle: number;
}

let sparkId = 0;

export function useClickSpark() {
  const [sparks, setSparks] = useState<Spark[]>([]);

  function fire() {
    const n = 10;
    const next = Array.from({ length: n }, (_, i) => ({ id: sparkId++, angle: (360 / n) * i }));
    setSparks(next);
  }

  return { sparks, fire, clear: () => setSparks([]) };
}

export function ClickSparkLayer({ sparks, onDone }: { sparks: Spark[]; onDone: () => void }) {
  useEffect(() => {
    if (sparks.length === 0) return;
    const t = setTimeout(onDone, 500);
    return () => clearTimeout(t);
  }, [sparks, onDone]);

  if (sparks.length === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {sparks.map((s) => (
        <span
          key={s.id}
          className="spark-particle absolute h-1 w-3 rounded-full bg-[var(--color-lime)]"
          style={{ "--a": `${s.angle}deg` } as React.CSSProperties}
        />
      ))}
      <style>{`
        .spark-particle {
          transform: rotate(var(--a)) translateX(0);
          animation: spark-fly 480ms ease-out forwards;
        }
        @keyframes spark-fly {
          from { opacity: 1; transform: rotate(var(--a)) translateX(0); }
          to { opacity: 0; transform: rotate(var(--a)) translateX(38px); }
        }
      `}</style>
    </span>
  );
}
