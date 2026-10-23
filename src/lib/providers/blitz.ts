// Blitz API provider - LinkedIn/contact data. Server-side only (BLITZ_API_KEY).
// domain -> company LinkedIn -> decision-makers (employee finder).

const BASE = "https://api.blitz-api.ai";

function key(): string {
  const k = process.env.BLITZ_API_KEY;
  if (!k) throw new Error("BLITZ_API_KEY is not set");
  return k;
}

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": key(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`Blitz ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json as T;
}

export interface BlitzEmployee {
  fullName: string;
  title: string;
  linkedinUrl: string;
  jobLevel?: string;
  jobFunction?: string;
  location?: string;
}

/** Resolve a company domain to its LinkedIn company URL. */
export async function domainToLinkedin(domain: string): Promise<string | null> {
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  // Errors propagate (a 5xx must be retried, not recorded as "no LinkedIn page").
  const r = await call<any>("POST", "/v2/enrichment/domain-to-linkedin", { domain: clean });
  if (r?.found && typeof r.company_linkedin_url === "string") return r.company_linkedin_url;
  return null;
}

/** Find employees at a company by LinkedIn URL. One page. */
export async function employeeFinder(opts: {
  companyLinkedinUrl: string;
  jobLevel?: string[];
  jobFunction?: string[];
  countryCode?: string;
  maxResults?: number;
  page?: number;
}): Promise<{ employees: BlitzEmployee[]; totalPages: number }> {
  const body: Record<string, unknown> = {
    company_linkedin_url: opts.companyLinkedinUrl,
    max_results: Math.min(opts.maxResults ?? 25, 50),
    page: opts.page ?? 1,
  };
  if (opts.jobLevel?.length) body.job_level = opts.jobLevel;
  if (opts.jobFunction?.length) body.job_function = opts.jobFunction;
  if (opts.countryCode) body.country_code = [opts.countryCode.trim().toUpperCase()];

  const r = await call<any>("POST", "/v2/search/employee-finder", body);
  const list = [r.results, r.employees, r.data, r.people].find(Array.isArray) as any[] | undefined;
  // A changed/error response must not mark this company as successfully searched.
  if (!list) throw new Error("Blitz employee finder returned an unexpected response: missing results array");
  const totalPages = r.total_pages || r.pagination?.total_pages || 1;
  return { employees: list.map((e) => mapEmployee(e, opts.companyLinkedinUrl)).filter((e) => e.fullName || e.linkedinUrl), totalPages };
}

/**
 * Find a work email for a person by their LinkedIn URL. Blitz returns `{found, email}`
 * with NO verification signal, so a returned address is "found", not "verified" - callers
 * must record it as email_status 'found', never 'verified'.
 */
export async function enrichEmail(personLinkedinUrl: string): Promise<string | null> {
  if (!personLinkedinUrl) return null;
  // Errors propagate so the queue can retry; only a definitive {found:false} means "none".
  const r = await call<any>("POST", "/v2/enrichment/email", { person_linkedin_url: personLinkedinUrl });
  if (r?.found && typeof r.email === "string" && r.email.trim()) return r.email.trim();
  return null;
}

function mapEmployee(e: any, companyLinkedinUrl: string): BlitzEmployee {
  const normalize = (url: string) => url.toLowerCase().replace(/\/+$/, "");
  const experiences: any[] = Array.isArray(e.experiences) ? e.experiences : [];
  // People can hold several current roles. Use the one at the searched company, never a
  // previous employer's title or the headline to rank a different role.
  const role = experiences.find((x) => x.job_is_current === true && typeof x.company_linkedin_url === "string"
    && normalize(x.company_linkedin_url) === normalize(companyLinkedinUrl))
    ?? experiences.find((x) => x.job_is_current === true && !x.company_linkedin_url);
  const location = typeof e.location === "string" ? e.location
    : e.location && typeof e.location === "object"
      ? [e.location.city, e.location.state_code, e.location.country_code].filter(Boolean).join(", ")
      : typeof e.country === "string" ? e.country : undefined;
  return {
    fullName: e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || e.name || "",
    title: role?.job_title || e.job_title || e.title || e.headline || "",
    linkedinUrl: e.linkedin_url || e.profile_url || e.url || "",
    jobLevel: role?.job_level || e.job_level || e.seniority,
    jobFunction: role?.job_function || e.job_function || e.department,
    location,
  };
}
