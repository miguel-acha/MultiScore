// Circular xG meter: a ring that fills proportional to the probability,
// color interpolated gray -> lime, with the percentage counting up in the
// middle. Used in the Simulator HUD and the game reveal screens.
import CountUp from "./bits/CountUp";

interface XgMeterProps {
  valuePct: number; // 0-100
  label?: string;
  size?: number;
  compareLabel?: string;
  compareValuePct?: number;
}

function ringColor(v: number): string {
  // gray (#5b6577) at 0 -> lime (#c8ff00) at 100
  const t = Math.max(0, Math.min(1, v / 100));
  const from = [91, 101, 119];
  const to = [200, 255, 0];
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

export default function XgMeter({ valuePct, label, size = 168, compareLabel, compareValuePct }: XgMeterProps) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, valuePct)) / 100);
  const color = ringColor(valuePct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.16,1,.3,1), stroke 700ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp value={valuePct} decimals={0} suffix="%" className="font-display text-4xl" style={{ color }} />
        </div>
      </div>
      {label && <span className="text-sm text-(--color-text-dim)">{label}</span>}
      {compareLabel && compareValuePct != null && (
        <span className="text-xs text-(--color-text-faint)">
          {compareLabel}: <CountUp value={compareValuePct} decimals={0} suffix="%" />
        </span>
      )}
    </div>
  );
}
