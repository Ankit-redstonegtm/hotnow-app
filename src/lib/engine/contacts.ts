// Contact sourcing - Blitz decision-makers for a company, tiered P1/P2/P3.
// P1 = economic buyer / decision maker, P2 = champion / influencer, P3 = lower fit.

import { domainToLinkedin, employeeFinder, type BlitzEmployee } from "../providers/blitz";

export interface ContactCriteria {
  jobFunctions?: string[]; // Blitz job_function enum values
  jobLevels?: string[]; // Blitz job_level enum values
  countryCode?: string;
}

export interface SourcedContact extends BlitzEmployee {
  priority: "P1" | "P2" | "P3";
}

const DEFAULT_FUNCTIONS = ["Sales & Business Development", "Operations", "General Business & Management"];

export async function sourceContactsForCompany(
  domain: string,
  criteria: ContactCriteria = {},
  opts: { maxPerCall?: number; personas?: string[] } = {},
): Promise<{ companyLinkedin: string | null; contacts: SourcedContact[] }> {
  const companyLinkedin = await domainToLinkedin(domain);
  if (!companyLinkedin) return { companyLinkedin: null, contacts: [] };

  const max = opts.maxPerCall ?? 12;
  const functions = criteria.jobFunctions?.length ? criteria.jobFunctions : DEFAULT_FUNCTIONS;

  // Call A: C-Team (no function filter) - founders/CxO regardless of tagged function.
  // Call B: senior leaders in the target functions.
  const calls: Promise<{ employees: BlitzEmployee[] }>[] = [
    employeeFinder({ companyLinkedinUrl: companyLinkedin, jobLevel: ["C-Team"], countryCode: criteria.countryCode, maxResults: max }),
    employeeFinder({
      companyLinkedinUrl: companyLinkedin,
      jobLevel: criteria.jobLevels?.length ? criteria.jobLevels : ["VP", "Director"],
      jobFunction: functions,
      countryCode: criteria.countryCode,
      maxResults: max,
    }),
  ];

  const settled = await Promise.allSettled(calls);
  const all: BlitzEmployee[] = [];
  for (const s of settled) if (s.status === "fulfilled") all.push(...s.value.employees);

  // dedupe by linkedin url, then name
  const seen = new Set<string>();
  const deduped: BlitzEmployee[] = [];
  for (const e of all) {
    const k = (e.linkedinUrl || e.fullName).toLowerCase().replace(/\/+$/, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  return { companyLinkedin, contacts: deduped.map((e) => ({ ...e, priority: classifyContact(e, opts.personas) })) };
}

// Generic seniority/role words that don't discriminate one seller's ICP from another's -
// excluded from persona matching so the signal comes from domain words (field, medical,
// roofing, revenue, …), making recommendations seller-specific.
const PERSONA_STOP = new Set([
  "the", "and", "for", "with", "team", "teams", "lead", "leader", "head", "chief", "vice", "president",
  "senior", "junior", "manager", "director", "officer", "staff", "member", "operations", "sales",
  "business", "development", "general", "management", "executive", "representative", "specialist",
]);

/** Significant, discriminating tokens from the seller's buyer personas. */
export function personaTokens(personas: string[] = []): string[] {
  const s = new Set<string>();
  for (const p of personas) {
    for (const w of String(p || "").toLowerCase().split(/[^a-z]+/)) {
      if (w.length >= 4 && !PERSONA_STOP.has(w)) s.add(w);
    }
  }
  return [...s];
}

/** True if a job title aligns with any of the seller's buyer personas (domain-word match). */
export function personaMatchesTitle(title: string | null | undefined, personas: string[] = []): boolean {
  const t = (title || "").toLowerCase();
  if (!t) return false;
  return personaTokens(personas).some((tok) => t.includes(tok));
}

const P1_TITLE = /\b(chief|founder|co-?founder|owner|president|ceo|cro|cmo|cfo|coo|cto|cio|cpo|cxo|svp|evp|vp|vice president|head of|managing director|partner)\b/;
const P2_TITLE = /\b(director|head|lead|principal|senior manager|manager|gm|general manager)\b/;

/**
 * Tier a decision-maker using the SELLER'S buyer personas, not hardcoded sales titles:
 *  - P1: economic buyer (C-level/VP/founder), OR a persona-aligned department leader.
 *  - P2: other department leaders, or a persona match without seniority.
 *  - P3: everyone else.
 * With no personas it degrades to pure seniority (backward compatible).
 */
export function classifyContact(e: Pick<BlitzEmployee, "title" | "jobLevel">, personas: string[] = []): "P1" | "P2" | "P3" {
  const t = `${e.title || ""}`.toLowerCase();
  const lvl = (e.jobLevel || "").toLowerCase();
  const seniorExec = lvl.includes("c-team") || P1_TITLE.test(t);
  const midLeader = lvl === "vp" || lvl === "director" || P2_TITLE.test(t);
  const personaHit = personaMatchesTitle(t, personas);

  if (seniorExec) return "P1";
  if (personaHit && midLeader) return "P1"; // the persona IS a department leader → decision-maker
  if (midLeader || personaHit) return "P2";
  return "P3";
}
