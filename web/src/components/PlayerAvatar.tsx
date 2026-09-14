// Square (not round) player photo, so a Wikimedia portrait crop shows the
// face instead of getting chopped into a circle. Shows a shimmering
// placeholder while the image loads (there was previously no loading
// state at all - the photo just popped in, or an unhelpful "?" sat there
// forever if there was no photo), then fades/scales in once it has.
import { useEffect, useState } from "react";
import { User } from "lucide-react";
import type { Player, PlayerListItem } from "../api";
import { stripHtml } from "../lib/format";

const SIZES = {
  sm: 40,
  md: 56,
  lg: 128,
} as const;

interface PlayerAvatarProps {
  // Either a full Player/PlayerListItem object (Players/PlayerView, which
  // already fetched one), or a bare photoUrl+name (ShotCard/MatchTimeline,
  // which get a photo URL for free on every /matches/{id}/shots row and
  // shouldn't fetch a whole Player per row just to show an avatar).
  player?: Player | PlayerListItem | null;
  photoUrl?: string | null;
  name?: string;
  size?: keyof typeof SIZES;
  jerseyNumber?: number | null;
  // Plain-text photo credit (author + license), shown as a native tooltip
  // on hover instead of a permanent "Foto: ..." line under every photo -
  // still visible (satisfies attribution), just not cluttering the page.
  // The full credits also live on /creditos.
  credit?: string | null;
}

export default function PlayerAvatar({ player, photoUrl, name, size = "md", jerseyNumber, credit }: PlayerAvatarProps) {
  const src = player ? player.photo?.thumb_url ?? null : (photoUrl ?? null);
  const altName = player?.name ?? name ?? "";
  const photo = player?.photo;
  const derivedCredit =
    credit !== undefined
      ? credit
      : photo
        ? [stripHtml(photo.artist_html), photo.license].filter(Boolean).join(" · ")
        : undefined;
  const [loaded, setLoaded] = useState(false);
  const px = SIZES[size];

  // Reset the fade-in when the underlying photo changes (e.g. a tooltip
  // avatar reused across different hovered shots) instead of showing the
  // previous photo's "loaded" state on the new src for a frame.
  useEffect(() => setLoaded(false), [src]);

  return (
    <div
      className="clip-menu-sm relative shrink-0 overflow-hidden border border-(--color-border-strong) bg-(--color-surface-3)"
      style={{ width: px, height: px }}
    >
      {!loaded && <div className="skeleton-shimmer absolute inset-0" />}

      {src && (
        <img
          src={src}
          alt={altName}
          title={derivedCredit || undefined}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-300"
          style={{
            objectPosition: "50% 20%",
            opacity: loaded ? 1 : 0,
            transform: loaded ? "scale(1)" : "scale(1.04)",
          }}
        />
      )}

      {!src && (
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
