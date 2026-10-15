// Task-API discovery (the new default, replacing FindAll as the auto-invoked provider).
// One Parallel Task (processor "pro", ~$0.10 flat) researches up to ~10 companies currently
// experiencing ONE buying situation; we qualify deterministically and deliver up to 3.
// FindAll code is preserved but not auto-invoked from here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { taskCreate, taskCheck } from "@/lib/providers/parallel";
import { TASK_PRICE_PER_RUN } from "@/lib/engine/config";
import type { BuyingSituation, IcpConstraints, Opportunity, SellerProfile } from "@/lib/engine";
import { normalizeDomain, isAggregatorDomain } from "@/lib/util/domain";
import { createRun, updateRun, upsertCompany, upsertOpportunity, getSituations } from "@/lib/db/repo";
import { ingestRun, toSituation, type IngestResult } from "./worker";
import { log } from "@/lib/log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

export const TASK_PROVIDER = "parallel_task";
export const TASK_PROCESSOR = "pro";
export const TASK_CANDIDATE_TARGET = 10;
export const TASK_DELIVER_MAX = 3;
export const TASK_RUN_COST = TASK_PRICE_PER_RUN[TASK_PROCESSOR] ?? 0.1;

export const TASK_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      description: "Up to 10 companies currently experiencing the buying situation, each with dated public evidence.",
      items: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          company_domain: { type: "string", description: "Official company website domain, e.g. example.com (not a job board or directory)" },
          company_description: { type: "string" },
          industry: { type: "string" },
          headquarters_country: { type: "string" },
          employee_count: { type: "string" },
          buying_situation_id: { type: "string" },
          observed_event: { type: "string", description: "The specific observable event at this company" },
          event_date: { type: "string", description: "Date of the evidence source, YYYY-MM-DD" },
          evidence_url: { type: "string", description: "Specific public source URL for the event (not the homepage)" },
          evidence_summary: { type: "string" },
          why_this_company_needs_the_product_now: { type: "string" },
          icp_fit_reason: { type: "string" },
          confidence: { type: "string", description: "high | medium | low" },
        },
        required: ["company_name", "company_domain", "observed_event", "evidence_url", "buying_situation_id", "confidence"],
      },
    },
  },
  required: ["companies"],
};

/** Pull the recency window (days) from a situation's match conditions, else default 120. */
export function recencyDaysFor(situation?: BuyingSituation): number {
  if (!situation) return 120;
  const txt = [situation.discoveryObjective, ...(situation.matchConditions || []).map((m) => m.description)].join(" ");
  const m = txt.match(/(\d{2,3})\s*days/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export function buildTaskPrompt(seller: SellerProfile, icp: IcpConstraints, situation: BuyingSituation): string {
  const recency = recencyDaysFor(situation);
  const industries = (icp.industries?.length ? icp.industries : seller.industries) || [];
  const geos = icp.geographies || [];
  const size = icp.sizeMin || icp.sizeMax ? `~${icp.sizeMin ?? "?"}–${icp.sizeMax ?? "?"} employees` : "no strict size";
  const excl = icp.excludedIndustries || [];
  const indicators = (situation.observableIndicators || []).filter(Boolean);

  return `You are a B2B prospecting researcher. Find up to ${TASK_CANDIDATE_TARGET} REAL companies CURRENTLY experiencing a specific buying situation, so the seller can contact them now. Finding companies that merely fit the ICP is NOT enough — each must show public evidence of the observable event below.

SELLER
- Company: ${seller.companyName} (${seller.domain})
- Sells: ${seller.productDescription || seller.problemsSolved || ""}

ICP (the kind of company to find)
- ${icp.geographies?.length ? `Geographies: ${geos.join(", ")}.` : ""} ${industries.length ? `Industries: ${industries.join(", ")}.` : ""} Size: ${size}.
- Fit: ${seller.targetCustomers || ""}

BUYING SITUATION: ${situation.name}
- Demand thesis: ${situation.demandHypothesis}
- OBSERVABLE EVENT to find: ${situation.discoveryObjective || situation.description}
${indicators.length ? `- Observable indicators: ${indicators.join("; ")}` : ""}

EVIDENCE REQUIREMENTS (critical)
- For EACH company, cite a SPECIFIC, PUBLIC, DATED source (evidence_url) proving the event — a press release, news item, filing, or job posting. NOT the company homepage.
- The event must be RECENT: within the last ${recency} days. Put the source date in event_date (YYYY-MM-DD).
- Always return an OFFICIAL company_domain (the company's own website). If you cannot find the official domain, omit that company.
- Do NOT fabricate companies, URLs, or dates. Fewer real companies is better than padding to ${TASK_CANDIDATE_TARGET}.

EXCLUSIONS
- Exclude software/SaaS vendors, consultancies, agencies, staffing firms, and data/directory providers (the seller's competitors / non-end-operators).
${excl.length ? `- Also exclude: ${excl.join("; ")}.` : ""}

OUTPUT
- Return the companies array. Set buying_situation_id = "${situation.name}". confidence = high/medium/low by evidence strength and recency.`;
}

/** Start one Task-API discovery run for a situation. Returns the run id (non-blocking). */
export async function startTaskDiscovery(
  sb: SB,
  args: { sellerProfileId: string; situationId: string; situation: BuyingSituation; seller: SellerProfile; icp: IcpConstraints },
): Promise<{ runId: string; providerJobId: string }> {
  const prompt = buildTaskPrompt(args.seller, args.icp, args.situation);
  const { runId: providerJobId } = await taskCreate({ input: prompt, jsonSchema: TASK_OUTPUT_SCHEMA, processor: TASK_PROCESSOR });
  const runId = await createRun(sb, {
    sellerProfileId: args.sellerProfileId,
    situationId: args.situationId,
    provider: TASK_PROVIDER,
    generator: TASK_PROCESSOR,
    matchLimit: TASK_CANDIDATE_TARGET,
    providerJobId,
    estCost: TASK_RUN_COST,
  });
  log.info("discovery.task.start", { runId, situationId: args.situationId });
  return { runId, providerJobId };
}

interface TaskCompany {
  company_name?: string; company_domain?: string; company_description?: string;
  observed_event?: string; event_date?: string; evidence_url?: string; evidence_summary?: string;
  why_this_company_needs_the_product_now?: string; icp_fit_reason?: string; confidence?: string;
}

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, moderate: 2, low: 1 };

/**
 * Deterministic qualification of Task companies (do NOT trust self-reported confidence alone):
 *  - must have an official, non-aggregator domain
 *  - must have an observed_event and a specific evidence_url
 *  - must be recent (dated within the window); undated is kept but capped to low confidence
 *  - deduped within the batch by normalized domain
 */
export function qualifyTaskCompanies(companies: TaskCompany[], situation: BuyingSituation | undefined, recencyDays: number): Opportunity[] {
  const now = Date.now();
  const seen = new Set<string>();
  const out: Opportunity[] = [];

  for (const c of companies || []) {
    const domain = normalizeDomain(c.company_domain || "");
    if (!domain || isAggregatorDomain(domain)) continue; // no official domain
    if (seen.has(domain)) continue;
    const event = (c.observed_event || "").trim();
    if (!event) continue;
    const url = (c.evidence_url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue; // need a specific source

    let confidence = (c.confidence || "medium").toLowerCase();
    const evDate = (c.event_date || "").trim();
    if (evDate) {
      const t = Date.parse(evDate);
      if (!Number.isNaN(t)) {
        const ageDays = (now - t) / 86_400_000;
        if (ageDays > recencyDays) continue; // stale
      }
    } else {
      confidence = "low"; // unverifiable recency
    }
    if (!(confidence in CONF_RANK)) confidence = "medium";

    seen.add(domain);
    out.push({
      company: { name: (c.company_name || domain).trim(), domain },
      situationName: situation?.name || "Buying signal",
      whatHappened: event,
      whyItMatters: (c.why_this_company_needs_the_product_now || "").trim() || situation?.demandHypothesis || "",
      confidence,
      evidence: [{ url, title: c.evidence_summary || undefined, date: evDate || undefined }],
      evidenceDate: evDate || undefined,
      discoveredAt: new Date().toISOString(),
    });
  }

  // Best first, deliver at most TASK_DELIVER_MAX.
  out.sort((a, b) => (CONF_RANK[b.confidence] ?? 0) - (CONF_RANK[a.confidence] ?? 0) || (b.evidenceDate ?? "").localeCompare(a.evidenceDate ?? ""));
  return out.slice(0, TASK_DELIVER_MAX);
}

/** Ingest a Task-API run: poll, qualify, persist up to 3 (deduped), finalize. Idempotent. */
export async function ingestTaskRun(admin: SB, run: any, situation?: BuyingSituation): Promise<IngestResult> {
  let chk;
  try {
    chk = await taskCheck<{ companies: TaskCompany[] }>(run.provider_job_id);
  } catch (err) {
    return { runId: run.id, status: "running", error: err instanceof Error ? err.message : "status error" };
  }

  if (chk.failed) {
    await updateRun(admin, run.id, { status: "failed", completed_at: new Date().toISOString(), error: "Task run failed" });
    return { runId: run.id, status: "failed", error: "Task run failed" };
  }
  if (!chk.done) return { runId: run.id, status: "running" };

  try {
    let sit = situation;
    if (!sit) {
      const rows = await getSituations(admin, run.seller_profile_id);
      const row = rows.find((s: any) => s.id === run.situation_id);
      sit = row ? toSituation(row) : undefined;
    }
    const companies = (chk.content?.companies ?? []) as TaskCompany[];
    const qualified = qualifyTaskCompanies(companies, sit, recencyDaysFor(sit));

    let newOpps = 0;
    for (const opp of qualified) {
      const companyId = await upsertCompany(admin, opp.company.domain || opp.company.name, opp.company.name);
      const { isNew } = await upsertOpportunity(admin, {
        sellerProfileId: run.seller_profile_id,
        companyId,
        situationId: run.situation_id,
        runId: run.id,
        opp,
      });
      if (isNew) newOpps++;
    }

    await updateRun(admin, run.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      candidates_count: companies.length,
      matched_count: qualified.length,
      actual_cost: TASK_RUN_COST,
    });
    return { runId: run.id, status: "completed", matched: qualified.length, newOpps };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ingest error";
    await updateRun(admin, run.id, { status: "failed", completed_at: new Date().toISOString(), error: msg });
    return { runId: run.id, status: "failed", error: msg };
  }
}

/** Dispatch ingest by provider: Task runs here, FindAll runs through the legacy worker. */
export async function ingestAnyRun(admin: SB, run: any, situation?: BuyingSituation): Promise<IngestResult> {
  if (run.provider === TASK_PROVIDER) return ingestTaskRun(admin, run, situation);
  return ingestRun(admin, run, situation);
}
