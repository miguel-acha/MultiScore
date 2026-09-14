// Square (not round) player photo, so a Wikimedia portrait crop shows the
// face instead of getting chopped into a circle. Shows a shimmering
// placeholder while the image loads (there was previously no loading
// state at all - the photo just popped in, or an unhelpful "?" sat there
// forever if there was no photo), then fades/scales in once it has.
import { useState } from "react";
import { User } from "lucide-react";
import type { Player, PlayerListItem } from "../api";

const SIZES = {
  sm: 40,
  md: 56,
  lg: 128,
} as const;

interface PlayerAvatarProps {
  player: Player | PlayerListItem | null;
  size?: keyof typeof SIZES;
  jerseyNumber?: number | null;
}

export default function PlayerAvatar({ player, size = "md", jerseyNumber }: PlayerAvatarProps) {
  const [loaded, setLoaded] = useState(false);
  const px = SIZES[size];
  const hasPhoto = !!player?.photo;

  return (
    <div
      className="clip-menu-sm relative shrink-0 overflow-hidden border border-(--color-border-strong) bg-(--color-surface-3)"
      style={{ width: px, height: px }}
    >
      {!loaded && <div className="skeleton-shimmer absolute inset-0" />}

      {hasPhoto && (
        <img
          src={player!.photo!.thumb_url}
          alt={player!.name}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-300"
          style={{
            objectPosition: "50% 20%",
            opacity: loaded ? 1 : 0,
            transform: loaded ? "scale(1)" : "scale(1.04)",
          }}
        />
      )}

      {!hasPhoto && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-(--color-text-faint)">
          <User size={px * 0.42} strokeWidth={1.5} />
          {jerseyNumber != null && (
            <span className="text-stat leading-none" style={{ fontSize: px * 0.2 }}>
              {jerseyNumber}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
