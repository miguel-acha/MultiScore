import { initials, nameHue } from "../lib/format";

export default function TeamBadge({ name, size = 32 }: { name: string; size?: number }) {
  const hue = nameHue(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: `linear-gradient(135deg, hsl(${hue} 70% 22%), hsl(${hue} 60% 14%))`,
        borderColor: `hsl(${hue} 70% 45% / 0.5)`,
      }}
      className="clip-menu-sm flex shrink-0 items-center justify-center border font-display font-bold text-(--color-text)"
      title={name}
    >
      {initials(name)}
    </div>
  );
}
