// Identity helpers for contacts found by more than one provider.

export type ContactSource = "blitz" | "prospeo";
export type ContactPriority = "P1" | "P2" | "P3";

export interface SourcedContact {
  fullName: string;
  title: string;
  linkedinUrl: string;
  jobLevel?: string;
  jobFunction?: string;
  location?: string;
  priority: ContactPriority;
  email?: string;
  mobile?: string;
  sources: ContactSource[];
  personId?: string;
}

const RANK: Record<ContactPriority, number> = { P1: 0, P2: 1, P3: 2 };

export function normalizeLinkedin(url: string | undefined | null): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com") return trimmed.toLowerCase().replace(/\/+$/, "");
    const path = parsed.pathname.replace(/\/+$/, "").replace(/\/{2,}/g, "/").toLowerCase();
    return `https://www.linkedin.com${path}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeEmail(email: string | undefined | null): string {
  return (email || "").trim().toLowerCase();
}

export function normalizeName(name: string | undefined | null): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function contactSourceLabel(sources: string[] | undefined): string {
  const label = [...new Set(sources || [])].filter((source): source is ContactSource => source === "blitz" || source === "prospeo").sort().join(",");
  return label || "blitz";
}

export function classifyContact(person: { title?: string; jobLevel?: string }): ContactPriority {
  const title = `${person.title || ""}`.toLowerCase();
  const level = (person.jobLevel || "").toLowerCase();
  const economicBuyer = /\b(chief|founder|co-?founder|owner|president|ceo|cro|cmo|cfo|coo|cto|cio|cpo|cxo|svp|evp|vp|vice president|head of|managing director|partner)\b/;
  const champion = /\b(director|head|lead|principal|senior manager|manager|gm|general manager)\b/;
  if (level.includes("c-team") || level.includes("c-suite") || level.includes("founder") || level === "partner" || economicBuyer.test(title)) return "P1";
  if (level === "vp" || level === "vice president" || level === "head" || level === "director" || champion.test(title)) return "P2";
  return "P3";
}

function fillGaps(target: SourcedContact, incoming: SourcedContact) {
  if (!target.fullName && incoming.fullName) target.fullName = incoming.fullName;
  if (!target.title && incoming.title) target.title = incoming.title;
  if (!target.linkedinUrl && incoming.linkedinUrl) target.linkedinUrl = incoming.linkedinUrl;
  if (!target.jobLevel && incoming.jobLevel) target.jobLevel = incoming.jobLevel;
  if (!target.jobFunction && incoming.jobFunction) target.jobFunction = incoming.jobFunction;
  if (!target.location && incoming.location) target.location = incoming.location;
  if (!target.email && incoming.email) target.email = incoming.email;
  if (!target.mobile && incoming.mobile) target.mobile = incoming.mobile;
  if (!target.personId && incoming.personId) target.personId = incoming.personId;
  if (RANK[incoming.priority] < RANK[target.priority]) target.priority = incoming.priority;
  target.sources = [...new Set([...target.sources, ...incoming.sources])].sort() as ContactSource[];
}

/** Dedupe by LinkedIn URL, then email, then name. Gap-fill verified email and mobile. */
export function mergeContacts(groups: SourcedContact[][]): SourcedContact[] {
  const merged: SourcedContact[] = [];
  const byLinkedin = new Map<string, SourcedContact>();
  const byEmail = new Map<string, SourcedContact>();
  const byName = new Map<string, SourcedContact>();
  const index = (contact: SourcedContact) => {
    const linkedin = normalizeLinkedin(contact.linkedinUrl);
    const email = normalizeEmail(contact.email);
    const name = normalizeName(contact.fullName);
    if (linkedin) byLinkedin.set(linkedin, contact);
    if (email) byEmail.set(email, contact);
    if (name) byName.set(name, contact);
  };
  for (const group of groups) {
    for (const incoming of group) {
      const linkedin = normalizeLinkedin(incoming.linkedinUrl);
      const email = normalizeEmail(incoming.email);
      const name = normalizeName(incoming.fullName);
      const existing = (linkedin && byLinkedin.get(linkedin)) || (email && byEmail.get(email)) || (name && byName.get(name)) || null;
      if (!existing) {
        const created: SourcedContact = { ...incoming, linkedinUrl: linkedin || incoming.linkedinUrl, sources: [...new Set(incoming.sources)].sort() as ContactSource[] };
        merged.push(created);
        index(created);
        continue;
      }
      fillGaps(existing, { ...incoming, linkedinUrl: linkedin || incoming.linkedinUrl });
      index(existing);
    }
  }
  return merged;
}
