// A slow, single-direction spin on the badge for "loading" states that
// show the logo instead of a skeleton - deliberately gentle (8s per turn,
// no bounce/pulse) so it reads as "working" rather than a glitch.
export default function LogoSpinner({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <img
        src="/images/logo-badge-128.webp"
        alt=""
        className="animate-spin-slow"
        style={{ width: size, height: size }}
      />
      {label && <p className="text-sm text-(--color-text-dim)">{label}</p>}
    </div>
  );
}
