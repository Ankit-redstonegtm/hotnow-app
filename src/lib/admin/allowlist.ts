const DEFAULT_ADMIN_EMAIL = "ankit@redstonegtm.com";

/** Emails allowed to open /admin. Empty or unset uses the default allowlist. */
export function adminEmails(): ReadonlySet<string> {
  // Dynamic lookup so the value is read at request time, not folded in at build.
  const raw = process.env["ADMIN_EMAILS"];
  const source = raw && raw.trim() ? raw : DEFAULT_ADMIN_EMAIL;
  return new Set(source.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}
