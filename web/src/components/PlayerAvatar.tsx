import type { Player } from "../api";
import { initials } from "../lib/format";

export default function PlayerAvatar({ player, size = 44 }: { player: Player | null; size?: number }) {
  const style = { width: size, height: size };
  if (player?.photo) {
    return (
      <img
        src={player.photo.thumb_url}
        alt={player.name}
        style={style}
        className="rounded-full border-2 border-(--color-border-strong) object-cover"
      />
    );
  }
  return (
    <div
      style={{ ...style, fontSize: size * 0.34 }}
      className="flex items-center justify-center rounded-full border-2 border-(--color-border-strong) bg-(--color-surface-3) font-semibold text-(--color-text)"
    >
      {player ? initials(player.nickname || player.name) : "?"}
    </div>
  );
}
