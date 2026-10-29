// Prospeo API provider. Server-side only (PROSPEO_API_KEY, sent as X-KEY).
// Search does not reveal email or mobile. Bulk enrich does, and reports total_cost.
// https://prospeo.io/api-docs/search-person
// https://prospeo.io/api-docs/bulk-enrich-person

import type { CreditSink } from "./credits";

export interface ProspeoSearchCriteria {
  jobFunctions?: string[];
  jobLevels?: string[];
  countryCode?: string;
}

const BASE = "https://api.prospeo.io";

const LEVEL_TO_SENIORITY: Record<string, string[]> = {
  "C-Team": ["Founder/Owner", "C-Suite", "Partner"],
  VP: ["Vice President", "Head"],
  Director: ["Director"],
  Manager: ["Manager"],
  Staff: ["Senior"],
};

const FUNCTION_TO_DEPARTMENT: Record<string, string[]> = {
  "Sales & Business Development": ["Sales"],
  Operations: ["Operations"],
  "Advertising & Marketing": ["Marketing"],
  "General Business & Management": ["C-Suite"],
};

export interface ProspeoLead {
  personId?: string;
  fullName: string;
  title: string;
  linkedinUrl: string;
  jobLevel?: string;
  jobFunction?: string;
  location?: string;
  email?: string;
  mobile?: string;
  companyLinkedin?: string;
}

export interface ProspeoEnrichInput {
  identifier: string;
  personId?: string;
  linkedinUrl?: string;
  fullName?: string;
  companyWebsite: string;
}

export class ProspeoKeyMissingError extends Error {
  constructor() { super("PROSPEO_API_KEY is not set"); this.name = "ProspeoKeyMissingError"; }
}

export function verifiedEmail(value: unknown): string | undefined {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!record || record.status !== "VERIFIED" || record.revealed !== true) return undefined;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!email || email.includes("*") || !email.includes("@")) return undefined;
  return email;
}

export function verifiedMobile(value: unknown): string | undefined {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!record || record.status !== "VERIFIED" || record.revealed !== true) return undefined;
  const raw = typeof record.mobile_international === "string" && record.mobile_international.trim()
    ? record.mobile_international
    : record.mobile;
  const mobile = typeof raw === "string" ? raw.trim() : "";
  if (!mobile || mobile.includes("*")) return undefined;
  return mobile;
}

export function prospeoSearchFilters(domain: string, criteria: ProspeoSearchCriteria, maxResults: number) {
  const filters: Record<string, unknown> = {
    company: { websites: { include: [domain] } },
    max_person_per_company: Math.min(100, Math.max(1, maxResults)),
  };
  const seniority = [...new Set((criteria.jobLevels?.length ? criteria.jobLevels : ["C-Team", "VP", "Director"])
    .flatMap(level => LEVEL_TO_SENIORITY[level] || []))].slice(0, 11);
  if (seniority.length) filters.person_seniority = { include: seniority };
  const departments = [...new Set((criteria.jobFunctions?.length ? criteria.jobFunctions : ["Sales & Business Development", "Operations", "General Business & Management"])
    .flatMap(fn => FUNCTION_TO_DEPARTMENT[fn] || []))];
  if (departments.length) filters.person_department = { include: departments };
  const country = countryName(criteria.countryCode);
  if (country) filters.person_location_search = { include: [country] };
  return filters;
}

function countryName(code: string | undefined): string | null {
  const upper = (code || "").trim().toUpperCase();
  if (!upper) return null;
  if (upper === "UK") return "United Kingdom";
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
    return name && name !== upper ? name : null;
  } catch {
    return null;
  }
}

function noteCredits(path: string, json: any, credits?: CreditSink) {
  if (!credits) return;
  if (path === "/search-person") {
    if (json?.error_code === "NO_RESULTS") credits.add("prospeo", 0);
    else if (json?.free === true) credits.add("prospeo", 0);
    else if (json?.free === false) credits.add("prospeo", 1);
    return;
  }
  if (path === "/bulk-enrich-person" && typeof json?.total_cost === "number") credits.add("prospeo", json.total_cost);
}

async function call(path: string, body: unknown, credits?: CreditSink): Promise<any> {
  const apiKey = process.env.PROSPEO_API_KEY;
  if (!apiKey) throw new ProspeoKeyMissingError();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "X-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: true, error_code: "INVALID_RESPONSE" }; }
  const code = json?.error_code;
  if (code === "NO_RESULTS" || code === "NO_MATCH") {
    noteCredits(path, json, credits);
    return json;
  }
  if (!res.ok || json?.error === true) {
    const detail = typeof json?.filter_error === "string" ? `: ${json.filter_error}` : "";
    throw new Error(`Prospeo POST ${path} -> ${res.status}: ${code || "REQUEST_FAILED"}${detail}`);
  }
  noteCredits(path, json, credits);
  return json;
}

export function mapProspeoLead(row: any): ProspeoLead | null {
  const person = row?.person ?? row;
  if (!person || typeof person !== "object") return null;
  const current = Array.isArray(person.job_history) ? person.job_history.find((job: any) => job?.current) : undefined;
  const fullName = person.full_name || [person.first_name, person.last_name].filter(Boolean).join(" ");
  const linkedinUrl = typeof person.linkedin_url === "string" ? person.linkedin_url : "";
  if (!fullName && !linkedinUrl) return null;
  const location = person.location && typeof person.location === "object"
    ? [person.location.city, person.location.state, person.location.country].filter(Boolean).join(", ")
    : undefined;
  return {
    personId: typeof person.person_id === "string" ? person.person_id : undefined,
    fullName: fullName || "",
    title: person.current_job_title || current?.title || "",
    linkedinUrl,
    jobLevel: current?.seniority || undefined,
    jobFunction: Array.isArray(current?.departments) ? current.departments.find((item: unknown) => typeof item === "string") : undefined,
    location: location || undefined,
    email: verifiedEmail(person.email),
    mobile: verifiedMobile(person.mobile),
    companyLinkedin: typeof row?.company?.linkedin_url === "string" ? row.company.linkedin_url : undefined,
  };
}

export async function searchPeople(domain: string, criteria: ProspeoSearchCriteria, maxResults: number, credits?: CreditSink): Promise<ProspeoLead[]> {
  const filters = prospeoSearchFilters(domain, criteria, maxResults);
  let json: any;
  try {
    json = await call("/search-person", { page: 1, filters }, credits);
  } catch (error) {
    if (!filters.person_location_search || !(error instanceof Error) || !error.message.includes("INVALID_FILTERS")) throw error;
    console.warn(`[contacts] Prospeo rejected the location filter for ${domain}; retrying without it`);
    const rest = { ...filters };
    delete rest.person_location_search;
    json = await call("/search-person", { page: 1, filters: rest }, credits);
  }
  if (json?.error_code === "NO_RESULTS") return [];
  const results = Array.isArray(json?.results) ? json.results : null;
  if (!results) throw new Error("Prospeo search-person returned an unexpected response: missing results array");
  return results.map(mapProspeoLead).filter((lead: ProspeoLead | null): lead is ProspeoLead => !!lead);
}

export async function bulkEnrich(inputs: ProspeoEnrichInput[], mode: "email" | "mobile", credits?: CreditSink): Promise<Map<string, ProspeoLead>> {
  const matched = new Map<string, ProspeoLead>();
  for (let offset = 0; offset < inputs.length; offset += 50) {
    const data = inputs.slice(offset, offset + 50).map(input => ({
      identifier: input.identifier,
      ...(input.personId ? { person_id: input.personId } : {}),
      ...(input.linkedinUrl ? { linkedin_url: input.linkedinUrl } : {}),
      ...(input.fullName ? { full_name: input.fullName } : {}),
      ...(input.companyWebsite ? { company_website: input.companyWebsite } : {}),
    }));
    const body = mode === "mobile"
      ? { only_verified_email: false, enrich_mobile: true, only_verified_mobile: true, data }
      : { only_verified_email: true, enrich_mobile: false, data };
    const json = await call("/bulk-enrich-person", body, credits);
    for (const row of json?.matched || []) {
      const lead = mapProspeoLead(row);
      if (lead && typeof row?.identifier === "string") matched.set(row.identifier, lead);
    }
  }
  return matched;
}
