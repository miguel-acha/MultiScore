// A club shows its real crest when we have one (see ml/multiscore/crests.py
// for how narrow that coverage is - most La Liga clubs fall back to the
// initials badge), a national team always shows its flag, and anything
// still missing falls back to the initials badge as before.
import { initials, nameHue } from "../lib/format";
import { useTeams } from "../lib/useTeams";

const SIZES = { sm: 24, md: 32, lg: 44 } as const;

export default function TeamBadge({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  const teams = useTeams();
  const px = SIZES[size];
  const entry = teams?.[name];

  if (!teams) {
    return <div className="skeleton-shimmer clip-menu-sm shrink-0 rounded" style={{ width: px, height: px }} />;
  }

  if (entry?.kind === "national" && entry.iso2) {
    return (
      <span
        className={`fi fi-${entry.iso2} fi-square shrink-0 rounded-sm border border-(--color-border-strong)`}
        style={{ fontSize: px }}
        title={name}
      />
    );
  }

  if (entry?.kind === "club" && entry.thumb_url) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded bg-(--color-surface-2) p-1"
        style={{ width: px, height: px }}
        title={name}
      >
        <img src={entry.thumb_url} alt={name} className="h-full w-full object-contain" />
      </div>
    );
  }

  const hue = nameHue(name);
  return (
    <div
      style={{
        width: px,
        height: px,
        fontSize: px * 0.32,
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
