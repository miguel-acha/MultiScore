// Shimmering placeholder block, used everywhere a "Cargando…" text used to
// sit alone - match grids, the match page, player cards, model page.
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-lg bg-(--color-surface-2) ${className}`} />;
}
