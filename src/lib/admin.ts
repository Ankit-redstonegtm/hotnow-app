// Owner/admin allowlist for the internal /admin area. Override with the
// ADMIN_EMAILS env var (comma-separated); otherwise this default list applies.
const DEFAULT_ADMINS = ["ankit@redstonegtm.com", "ankit@thekiln.com", "ankit@hotnow.co"];

export function adminEmails(): string[] {
  const env = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return env.length ? env : DEFAULT_ADMINS;
}

export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
