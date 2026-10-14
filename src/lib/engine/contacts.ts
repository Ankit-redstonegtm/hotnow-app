// Contact sourcing — Blitz decision-makers for a company, tiered P1/P2/P3.
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
  opts: { maxPerCall?: number } = {},
): Promise<{ companyLinkedin: string | null; contacts: SourcedContact[] }> {
  const companyLinkedin = await domainToLinkedin(domain);
  if (!companyLinkedin) return { companyLinkedin: null, contacts: [] };

  const max = opts.maxPerCall ?? 12;
  const functions = criteria.jobFunctions?.length ? criteria.jobFunctions : DEFAULT_FUNCTIONS;

  // Call A: C-Team (no function filter) — founders/CxO regardless of tagged function.
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

  return { companyLinkedin, contacts: deduped.map((e) => ({ ...e, priority: classify(e) })) };
}

function classify(e: BlitzEmployee): "P1" | "P2" | "P3" {
  const t = `${e.title || ""}`.toLowerCase();
  const lvl = (e.jobLevel || "").toLowerCase();
  const p1Title = /\b(chief|founder|co-?founder|owner|president|ceo|cro|cmo|cfo|coo|cto|cio|cpo|cxo|svp|evp|vp|vice president|head of|managing director|partner)\b/;
  const p2Title = /\b(director|head|lead|principal|senior manager|manager|gm|general manager)\b/;
  if (lvl.includes("c-team") || p1Title.test(t)) return "P1";
  if (lvl === "vp" || lvl === "director" || p2Title.test(t)) return "P2";
  return "P3";
}
