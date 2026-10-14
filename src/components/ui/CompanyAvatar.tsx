// Tasteful company avatar: a monogram on a deterministic, muted tint derived from the
// company's identity. No external/logo network calls (privacy + no layout shift). The
// palette is a small, restrained set chosen to harmonize with the app's neutrals.

const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#eef1f6", fg: "#3b4a63" }, // slate
  { bg: "#fdeceb", fg: "#b23b32" }, // warm red (brand-adjacent)
  { bg: "#eaf2ec", fg: "#2f6b45" }, // green
  { bg: "#f0edf7", fg: "#5a4a86" }, // violet
  { bg: "#fbf0e5", fg: "#9a5a22" }, // amber
  { bg: "#e9f1f5", fg: "#2c5d74" }, // teal
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string, domain?: string | null): string {
  const base = (name || domain || "").trim();
  if (!base) return "·";
  const words = base.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\s.]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function CompanyAvatar({
  name,
  domain,
  size = 36,
}: {
  name: string;
  domain?: string | null;
  size?: number;
}) {
  const key = (domain || name || "").toLowerCase();
  const { bg, fg } = PALETTE[hash(key) % PALETTE.length];
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center shrink-0 font-semibold select-none"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.38),
        letterSpacing: "-0.02em",
      }}
    >
      {initials(name, domain)}
    </span>
  );
}
