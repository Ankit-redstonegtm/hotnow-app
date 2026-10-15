// Deterministic, locale-independent date formatting.
// toLocaleDateString varies between the Node server (ICU) and the browser — e.g. "Sept" vs
// "Sep" — which causes React hydration mismatches. These helpers use fixed month names and
// UTC getters so server and client always agree (our dates are date-only / ISO instants).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "28 Sep" — compact table format. Returns "—" for empty/invalid. */
export function fmtShortDate(iso?: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sep 28, 2026" — detail format. Returns null for empty/invalid. */
export function fmtLongDate(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
