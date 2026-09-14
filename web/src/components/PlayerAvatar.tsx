// Square (not round) player photo, so a Wikimedia portrait crop shows the
// face instead of getting chopped into a circle. Shows a shimmering
// placeholder while the image loads (there was previously no loading
// state at all - the photo just popped in, or an unhelpful "?" sat there
// forever if there was no photo), then fades/scales in once it has.
import { useLayoutEffect, useRef, useState } from "react";
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
  const src = player
    ? ((size === "lg" ? player.photo?.thumb_url_lg : null) ?? player.photo?.thumb_url ?? null)
    : (photoUrl ?? null);
  const altName = player?.name ?? name ?? "";
  const photo = player?.photo;
  const derivedCredit =
    credit !== undefined
      ? credit
      : photo
        ? [stripHtml(photo.artist_html), photo.license].filter(Boolean).join(" · ")
        : undefined;
  // Tracks which src has actually finished loading, instead of a plain
  // loaded boolean reset by a useEffect - that reset ran AFTER onLoad had
  // already fired for a cached image (e.g. the same player's photo shown
  // again in a tooltip or a re-rendered list row), so `loaded` got set to
  // false with nothing left to trigger onLoad again and the avatar stayed
  // invisible forever. Deriving `loaded` straight from a src comparison
  // has no such ordering to get wrong.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const loaded = loadedSrc === src;
  const px = SIZES[size];

  // An <img> whose src is already in the browser cache can finish loading
  // before this component's onLoad handler is even attached (it fires
  // during the same paint as mount) - check img.complete right after
  // mount/src-change so that case still marks it loaded.
  useLayoutEffect(() => {
    setFailed(false);
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedSrc(src);
    }
  }, [src]);

  return (
    <div
      className="clip-menu-sm relative shrink-0 overflow-hidden border border-(--color-border-strong) bg-(--color-surface-3)"
      style={{ width: px, height: px }}
    >
      {!loaded && <div className="skeleton-shimmer absolute inset-0" />}

      {src && !failed && (
        <img
          ref={imgRef}
          src={src}
          alt={altName}
          title={derivedCredit || undefined}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-all duration-300"
          style={{
            objectPosition: "50% 20%",
            opacity: loaded ? 1 : 0,
            transform: loaded ? "scale(1)" : "scale(1.04)",
          }}
        />
      )}

      {(!src || failed) && (
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
