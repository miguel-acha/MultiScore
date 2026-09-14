export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function pctFromWhole(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(v)}%`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

// Deterministic color per team/player name, used for badges/avatars when
// there's no photo or crest — same name always gets the same hue so a
// team looks consistent across cards.
export function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

const POSITION_ABBR: Record<string, string> = {
  Goalkeeper: "GK",
  "Right Back": "RB",
  "Right Center Back": "RCB",
  "Center Back": "CB",
  "Left Center Back": "LCB",
  "Left Back": "LB",
  "Right Wing Back": "RWB",
  "Left Wing Back": "LWB",
  "Right Defensive Midfield": "RDM",
  "Center Defensive Midfield": "CDM",
  "Left Defensive Midfield": "LDM",
  "Right Midfield": "RM",
  "Right Center Midfield": "RCM",
  "Center Midfield": "CM",
  "Left Center Midfield": "LCM",
  "Left Midfield": "LM",
  "Right Attacking Midfield": "RAM",
  "Center Attacking Midfield": "CAM",
  "Left Attacking Midfield": "LAM",
  "Right Wing": "RW",
  "Right Center Forward": "RCF",
  "Center Forward": "CF",
  "Left Center Forward": "LCF",
  "Left Wing": "LW",
};

export function positionAbbr(position: string | null | undefined): string | null {
  if (!position) return null;
  return POSITION_ABBR[position] ?? null;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
