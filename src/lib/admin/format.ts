const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_RESEARCH = new Set(["queued", "starting", "running", "ready"]);

export function weekAgoMs(now = Date.now()): number {
  return now - WEEK_MS;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Prefer the cost recorded when a run finishes, then the estimate stored at launch. */
export function recordedRunCost(actual: unknown, estimated: unknown): number {
  const actualCost = asNumber(actual);
  if (actualCost != null) return actualCost;
  return asNumber(estimated) ?? 0;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatCount(amount: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year}, ${hours}:${minutes} UTC`;
}

export function formatDuration(startIso: string | null, endIso: string | null, now = Date.now()): string {
  if (!startIso) return "Unknown";
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return "Unknown";
  const end = endIso ? Date.parse(endIso) : now;
  if (Number.isNaN(end)) return "Unknown";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function jobTypeLabel(kind: string): string {
  if (kind === "contacts") return "Contacts";
  if (kind === "emails") return "Emails";
  return kind || "Unknown";
}

export function jobStatusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type ProfileStatus = {
  research_status: string | null;
  situations_status: string | null;
  updated_at: string;
};

function statusFor(profile: ProfileStatus): string {
  const research = (profile.research_status || "none").toLowerCase();
  const situations = (profile.situations_status || "none").toLowerCase();
  if (research === "failed") return "Research failed";
  if (ACTIVE_RESEARCH.has(research)) return "Researching";
  if (research !== "done") return "Not started";
  if (situations === "failed") return "Signals failed";
  if (ACTIVE_RESEARCH.has(situations)) return "Generating signals";
  if (situations === "done") return "Complete";
  return "In progress";
}

export function onboardingStatus(profiles: ProfileStatus[]): string {
  if (!profiles.length) return "Not started";
  if (profiles.every((profile) => statusFor(profile) === "Complete")) return "Complete";
  const open = profiles.toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .find((profile) => statusFor(profile) !== "Complete");
  return open ? statusFor(open) : "In progress";
}

export function domainList(profiles: Array<{ domain: string; updated_at: string }>): string {
  const domains = profiles.toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .map((profile) => profile.domain)
    .filter(Boolean);
  return domains.length ? domains.join(", ") : "None";
}
