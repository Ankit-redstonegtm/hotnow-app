// Persistence layer for the engine's outputs. Clients already target the `hotnow`
// schema (db.schema option). User-scoped writes use the request client (RLS);
// cross-user ingest writes (companies/candidates/opportunities) use the admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuyingSituation, IcpConstraints, SellerProfile, Opportunity } from "../engine/types";
import { normalizeDomain } from "../util/domain";

// Schema-agnostic client type (our clients target the `hotnow` schema, not `public`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

// ---------------- seller profile ----------------
export async function upsertSellerProfile(sb: SB, userId: string, p: SellerProfile): Promise<string> {
  const existing = await sb.from("seller_profiles").select("id").eq("user_id", userId).maybeSingle();
  const row = {
    user_id: userId,
    domain: p.domain,
    company_name: p.companyName,
    product_description: p.productDescription,
    target_customers: p.targetCustomers,
    problems_solved: p.problemsSolved,
    buyer_personas: p.buyerPersonas,
    industries: p.industries,
    raw_research: p.raw ?? null,
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    const { error } = await sb.from("seller_profiles").update(row).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return existing.data.id;
  }
  const { data, error } = await sb.from("seller_profiles").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Create/reset the seller profile row for an async research job and store the task id. */
export async function beginResearch(sb: SB, userId: string, domain: string, taskId: string): Promise<string> {
  const existing = await sb.from("seller_profiles").select("id").eq("user_id", userId).maybeSingle();
  const row = {
    user_id: userId,
    domain,
    research_task_id: taskId,
    research_status: "running",
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    const { error } = await sb.from("seller_profiles").update(row).eq("id", existing.data.id);
    if (error) throw new Error(error.message);
    return existing.data.id;
  }
  const { data, error } = await sb.from("seller_profiles").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getSellerProfileByUser(sb: SB, userId: string) {
  const { data } = await sb.from("seller_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data;
}

export async function getSellerProfileById(sb: SB, id: string) {
  const { data } = await sb.from("seller_profiles").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function updateSellerProfile(sb: SB, id: string, fields: Record<string, unknown>) {
  const { error } = await sb
    .from("seller_profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------- situations ----------------
export async function replaceSituations(sb: SB, sellerProfileId: string, situations: BuyingSituation[]) {
  await sb.from("buying_situations").delete().eq("seller_profile_id", sellerProfileId);
  const rows = situations.map((s) => ({
    seller_profile_id: sellerProfileId,
    name: s.name,
    description: s.description,
    demand_hypothesis: s.demandHypothesis,
    observable_indicators: s.observableIndicators,
    evidence_sources: s.evidenceSources,
    discovery_objective: s.discoveryObjective,
    match_conditions: s.matchConditions,
    generator: s.generator,
    enabled: true,
    source: s.source,
  }));
  const { data, error } = await sb.from("buying_situations").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return data;
}

export async function getSituations(sb: SB, sellerProfileId: string) {
  const { data } = await sb
    .from("buying_situations")
    .select("*")
    .eq("seller_profile_id", sellerProfileId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function updateSituation(sb: SB, id: string, fields: Record<string, unknown>) {
  const { error } = await sb.from("buying_situations").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addCustomSituation(
  sb: SB,
  sellerProfileId: string,
  s: { name: string; description: string; objective: string },
) {
  const row = {
    seller_profile_id: sellerProfileId,
    name: s.name,
    description: s.description,
    demand_hypothesis: "",
    observable_indicators: [],
    evidence_sources: [],
    discovery_objective: s.objective,
    match_conditions: [
      { name: "situation_match", description: s.objective },
      {
        name: "end_operator",
        description:
          "The company is an end operator experiencing the situation, not a software/SaaS vendor, consultancy, agency, staffing firm, or data/directory provider.",
      },
    ],
    generator: "base",
    enabled: true,
    source: "user",
  };
  const { data, error } = await sb.from("buying_situations").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------------- icp ----------------
export async function upsertIcp(sb: SB, sellerProfileId: string, icp: IcpConstraints) {
  const row = {
    seller_profile_id: sellerProfileId,
    geographies: icp.geographies,
    industries: icp.industries,
    excluded_industries: icp.excludedIndustries,
    size_min: icp.sizeMin ?? null,
    size_max: icp.sizeMax ?? null,
    daily_target: icp.dailyTarget,
  };
  const { error } = await sb.from("icp_constraints").upsert(row, { onConflict: "seller_profile_id" });
  if (error) throw new Error(error.message);
}

export async function getIcp(sb: SB, sellerProfileId: string): Promise<IcpConstraints | null> {
  const { data } = await sb.from("icp_constraints").select("*").eq("seller_profile_id", sellerProfileId).maybeSingle();
  if (!data) return null;
  return {
    geographies: data.geographies ?? [],
    industries: data.industries ?? [],
    excludedIndustries: data.excluded_industries ?? [],
    sizeMin: data.size_min,
    sizeMax: data.size_max,
    dailyTarget: data.daily_target ?? 5,
  };
}

// ---------------- discovery runs ----------------
export async function createRun(
  sb: SB,
  r: { sellerProfileId: string; situationId: string; generator: string; matchLimit: number; providerJobId: string; estCost: number },
): Promise<string> {
  const { data, error } = await sb
    .from("discovery_runs")
    .insert({
      seller_profile_id: r.sellerProfileId,
      situation_id: r.situationId,
      provider: "parallel",
      provider_job_id: r.providerJobId,
      generator: r.generator,
      match_limit: r.matchLimit,
      status: "running",
      est_cost: r.estCost,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getRuns(sb: SB, sellerProfileId: string, statuses?: string[]) {
  let q = sb.from("discovery_runs").select("*").eq("seller_profile_id", sellerProfileId);
  if (statuses?.length) q = q.in("status", statuses);
  const { data } = await q.order("requested_at", { ascending: false });
  return data ?? [];
}

export async function getRunById(sb: SB, id: string) {
  const { data } = await sb.from("discovery_runs").select("*").eq("id", id).maybeSingle();
  return data;
}

/** Look up a run by the provider's job id (FindAll `findall_id`). Used by the webhook. */
export async function getRunByProviderJobId(sb: SB, providerJobId: string) {
  const { data } = await sb
    .from("discovery_runs")
    .select("*")
    .eq("provider_job_id", providerJobId)
    .maybeSingle();
  return data;
}

export async function updateRun(sb: SB, id: string, fields: Record<string, unknown>) {
  const { error } = await sb.from("discovery_runs").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------- companies (shared identity) ----------------
export async function upsertCompany(admin: SB, domain: string, name: string): Promise<string> {
  const normalized = normalizeDomain(domain) || domain;
  const existing = await admin.from("companies").select("id").eq("normalized_domain", normalized).maybeSingle();
  if (existing.data?.id) {
    await admin.from("companies").update({ last_evidence_at: new Date().toISOString() }).eq("id", existing.data.id);
    return existing.data.id;
  }
  const { data, error } = await admin
    .from("companies")
    .insert({ normalized_domain: normalized, name, last_evidence_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) {
    // race: another insert won - re-read
    const retry = await admin.from("companies").select("id").eq("normalized_domain", normalized).maybeSingle();
    if (retry.data?.id) return retry.data.id;
    throw new Error(error.message);
  }
  return data.id;
}

// ---------------- opportunities + evidence (dedup) ----------------
const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, moderate: 2, low: 1 };
function confRank(c?: string | null): number {
  return CONFIDENCE_RANK[(c ?? "").toLowerCase()] ?? 0;
}

/**
 * Should a re-discovered opportunity REPLACE the existing one's "why now"? Yes when the
 * new evidence is strictly stronger: higher confidence, or equal confidence but a fresher
 * evidence date. Pure (no I/O) so the dedup rule is unit-testable.
 */
export function isStrongerEvidence(
  newConf: string | null | undefined,
  newDate: string | null | undefined,
  oldConf: string | null | undefined,
  oldDate: string | null | undefined,
): boolean {
  const nr = confRank(newConf);
  const or = confRank(oldConf);
  if (nr > or) return true;
  if (nr < or) return false;
  return (newDate ?? "") > (oldDate ?? "");
}

/**
 * Persist one qualified opportunity for a seller, deduped at the SELLER + COMPANY level
 * (one company surfaces once per seller, regardless of how many situations match it -
 * the locked MVP rule). The live UNIQUE(seller, company, situation) stays as a backstop.
 *
 * When the same company is re-discovered under a different/stronger situation, we DON'T
 * create a second opportunity; instead we keep the single row and UPGRADE it in place if
 * the new evidence is strictly stronger (higher confidence, else fresher date), preserving
 * the strongest "why now". Weaker re-discoveries only refresh the delivery timestamp.
 */
export async function upsertOpportunity(
  admin: SB,
  o: {
    sellerProfileId: string;
    companyId: string;
    situationId: string;
    runId: string;
    opp: Opportunity;
  },
): Promise<{ id: string; isNew: boolean; upgraded?: boolean }> {
  const newDate = o.opp.evidenceDate ? o.opp.evidenceDate.slice(0, 10) : null;

  // Seller-level dedup: ignore situation_id so a company already delivered under ANY
  // situation is not delivered again.
  const existing = await admin
    .from("opportunities")
    .select("id, confidence, evidence_date, situation_id")
    .eq("seller_profile_id", o.sellerProfileId)
    .eq("company_id", o.companyId)
    .order("first_discovered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    const stronger = isStrongerEvidence(o.opp.confidence, newDate, existing.data.confidence, existing.data.evidence_date);

    const patch: Record<string, unknown> = { last_delivered_at: new Date().toISOString() };
    if (stronger) {
      patch.what_happened = o.opp.whatHappened;
      patch.why_it_matters = o.opp.whyItMatters;
      patch.confidence = o.opp.confidence;
      patch.evidence_date = newDate;
      patch.situation_id = o.situationId;
    }
    await admin.from("opportunities").update(patch).eq("id", existing.data.id);

    // Add any new evidence URLs (keeps the strongest supporting citations around).
    if (stronger && o.opp.evidence.length) {
      await addEvidence(admin, existing.data.id, o.opp.whatHappened, o.opp.evidence);
    }
    return { id: existing.data.id, isNew: false, upgraded: stronger };
  }

  const inserted = await admin
    .from("opportunities")
    .insert({
      seller_profile_id: o.sellerProfileId,
      company_id: o.companyId,
      situation_id: o.situationId,
      run_id: o.runId,
      what_happened: o.opp.whatHappened,
      why_it_matters: o.opp.whyItMatters,
      confidence: o.opp.confidence,
      evidence_date: newDate,
      status: "new",
    })
    .select("id")
    .single();

  if (inserted.error) {
    // Concurrency backstop: a racing insert for the same (seller, company) won. Re-read.
    const retry = await admin
      .from("opportunities")
      .select("id")
      .eq("seller_profile_id", o.sellerProfileId)
      .eq("company_id", o.companyId)
      .limit(1)
      .maybeSingle();
    if (retry.data?.id) {
      await admin.from("opportunities").update({ last_delivered_at: new Date().toISOString() }).eq("id", retry.data.id);
      return { id: retry.data.id, isNew: false };
    }
    throw new Error(inserted.error.message);
  }

  await addEvidence(admin, inserted.data.id, o.opp.whatHappened, o.opp.evidence);
  return { id: inserted.data.id, isNew: true };
}

/** Insert evidence rows for an opportunity, skipping source URLs already attached. */
async function addEvidence(admin: SB, opportunityId: string, reasoning: string, evidence: Opportunity["evidence"]) {
  if (!evidence.length) return;
  const existing = await admin.from("evidence").select("source_url").eq("opportunity_id", opportunityId);
  const have = new Set((existing.data ?? []).map((r: any) => r.source_url));
  const rows = evidence
    .filter((e) => e.url && !have.has(e.url))
    .map((e) => ({
      opportunity_id: opportunityId,
      reasoning,
      source_url: e.url,
      source_date: e.date ? safeDate(e.date) : null,
      citation: e,
    }));
  if (rows.length) await admin.from("evidence").insert(rows);
}

export async function getOpportunities(sb: SB, sellerProfileId: string) {
  const { data } = await sb
    .from("opportunities")
    .select("*, companies(normalized_domain, name), buying_situations(name), evidence(source_url, source_date)")
    .eq("seller_profile_id", sellerProfileId)
    .order("first_discovered_at", { ascending: false });
  return data ?? [];
}

function safeDate(d: string): string | null {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// ---------------- contacts (Blitz decision-makers) ----------------
/** Companies (from opportunities) that still need contact sourcing. */
export async function companiesNeedingContacts(sb: SB, sellerProfileId: string, limit: number) {
  const { data } = await sb
    .from("opportunities")
    .select("id, company_id, companies!inner(normalized_domain, name, contacts_sourced_at)")
    .eq("seller_profile_id", sellerProfileId)
    .is("companies.contacts_sourced_at", null)
    .limit(limit);
  const seen = new Set<string>();
  const out: Array<{ companyId: string; domain: string; name: string; opportunityId: string }> = [];
  for (const r of data ?? []) {
    const c = (r as any).companies;
    if (!c?.normalized_domain || seen.has(r.company_id)) continue;
    seen.add(r.company_id);
    out.push({ companyId: r.company_id, domain: c.normalized_domain, name: c.name, opportunityId: r.id });
  }
  return out;
}

export async function countCompaniesNeedingContacts(sb: SB, sellerProfileId: string): Promise<number> {
  const { data } = await sb
    .from("opportunities")
    .select("company_id, companies!inner(contacts_sourced_at)")
    .eq("seller_profile_id", sellerProfileId)
    .is("companies.contacts_sourced_at", null);
  return new Set((data ?? []).map((r: any) => r.company_id)).size;
}

export async function saveContacts(
  admin: SB,
  args: { sellerProfileId: string; companyId: string; opportunityId: string | null; contacts: Array<{ fullName: string; title: string; linkedinUrl: string; jobLevel?: string; jobFunction?: string; priority: string }> },
): Promise<number> {
  if (args.contacts.length) {
    const rows = args.contacts.map((c) => ({
      seller_profile_id: args.sellerProfileId,
      company_id: args.companyId,
      opportunity_id: args.opportunityId,
      full_name: c.fullName,
      title: c.title,
      linkedin_url: c.linkedinUrl,
      job_level: c.jobLevel ?? null,
      job_function: c.jobFunction ?? null,
      priority: c.priority,
      source: "blitz",
    }));
    await admin.from("contacts").upsert(rows, { onConflict: "seller_profile_id,company_id,linkedin_url", ignoreDuplicates: true });
  }
  await admin.from("companies").update({ contacts_sourced_at: new Date().toISOString() }).eq("id", args.companyId);
  return args.contacts.length;
}

/** Contacts that still need an email lookup (null = never attempted). Highest-priority first. */
export async function contactsNeedingEmail(sb: SB, sellerProfileId: string, limit: number, tiers?: string[]) {
  let q = sb
    .from("contacts")
    .select("id, linkedin_url, priority")
    .eq("seller_profile_id", sellerProfileId)
    .is("email", null)
    .not("linkedin_url", "is", null)
    .order("priority", { ascending: true })
    .limit(limit);
  if (tiers?.length) q = q.in("priority", tiers);
  const { data } = await q;
  return (data ?? []).filter((c: any) => c.linkedin_url);
}

export async function countContactsNeedingEmail(sb: SB, sellerProfileId: string, tiers?: string[]): Promise<number> {
  let q = sb
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("seller_profile_id", sellerProfileId)
    .is("email", null)
    .not("linkedin_url", "is", null);
  if (tiers?.length) q = q.in("priority", tiers);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Record an email lookup result. Pass "" to mark "checked, none found" so we never retry.
 * email_status is set alongside: non-empty → 'found' (UNVERIFIED), "" → 'none'. We never
 * write 'verified' here - that is reserved for an explicit provider verification signal.
 */
export async function setContactEmail(admin: SB, id: string, email: string) {
  const email_status = email ? "found" : "none";
  await admin.from("contacts").update({ email, email_status }).eq("id", id);
}

export async function getContacts(sb: SB, sellerProfileId: string) {
  const { data } = await sb
    .from("contacts")
    .select("*, companies(normalized_domain, name)")
    .eq("seller_profile_id", sellerProfileId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------- lists ----------------
export async function createList(sb: SB, sellerProfileId: string, name: string, kind: "companies" | "contacts") {
  const { data, error } = await sb.from("lists").insert({ seller_profile_id: sellerProfileId, name, kind }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLists(sb: SB, sellerProfileId: string) {
  const { data } = await sb
    .from("lists")
    .select("*, list_items(count)")
    .eq("seller_profile_id", sellerProfileId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function addToList(sb: SB, listId: string, items: { opportunityIds?: string[]; contactIds?: string[] }) {
  const rows = [
    ...(items.opportunityIds ?? []).map((id) => ({ list_id: listId, opportunity_id: id })),
    ...(items.contactIds ?? []).map((id) => ({ list_id: listId, contact_id: id })),
  ];
  if (!rows.length) return 0;
  const { error } = await sb.from("list_items").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function getListWithItems(sb: SB, listId: string) {
  const { data: list } = await sb.from("lists").select("*").eq("id", listId).single();
  const { data: items } = await sb
    .from("list_items")
    .select("*, opportunities(id, what_happened, why_it_matters, companies(normalized_domain, name), buying_situations(name)), contacts(full_name, title, linkedin_url, priority, companies(normalized_domain, name))")
    .eq("list_id", listId);
  return { list, items: items ?? [] };
}

// ---------------- prewarm research (pre-signup head start) ----------------
/**
 * A research task started for a domain BEFORE the user finished signing up, so
 * the summary is ready by the time they land. Keyed by domain; server-only.
 */
export async function getFreshPrewarm(admin: SB, domain: string, maxAgeMs: number) {
  const { data } = await admin.from("prewarm_research").select("*").eq("domain", domain).maybeSingle();
  if (!data) return null;
  if (Date.now() - Date.parse(data.created_at) > maxAgeMs) return null;
  return data as { domain: string; task_id: string; created_at: string };
}

export async function upsertPrewarm(admin: SB, domain: string, taskId: string) {
  const { error } = await admin
    .from("prewarm_research")
    .upsert({ domain, task_id: taskId, created_at: new Date().toISOString() }, { onConflict: "domain" });
  if (error) throw new Error(error.message);
}

/** Crude global abuse guard: how many prewarms were started in the last `windowMs`. */
export async function countRecentPrewarms(admin: SB, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await admin
    .from("prewarm_research")
    .select("domain", { count: "exact", head: true })
    .gte("created_at", since);
  return count ?? 0;
}

// ---------------- settings / criteria ----------------
export async function updateSettings(sb: SB, profileId: string, fields: { slack_webhook_url?: string | null; contact_criteria?: unknown }) {
  const { error } = await sb.from("seller_profiles").update(fields).eq("id", profileId);
  if (error) throw new Error(error.message);
}

// ---------------- opportunity detail ----------------
/** One opportunity with its company, situation, and evidence. RLS-scoped via `sb`. */
export async function getOpportunityDetail(sb: SB, opportunityId: string, sellerProfileId: string) {
  const { data } = await sb
    .from("opportunities")
    .select(
      "*, companies(id, normalized_domain, name), buying_situations(name), evidence(source_url, source_date, citation, reasoning)",
    )
    .eq("id", opportunityId)
    .eq("seller_profile_id", sellerProfileId)
    .maybeSingle();
  return data;
}

/** Contacts for a company under a seller, prioritized P1→P3. RLS-scoped via `sb`. */
export async function getContactsForCompany(sb: SB, sellerProfileId: string, companyId: string) {
  const { data } = await sb
    .from("contacts")
    .select("id, full_name, title, linkedin_url, priority, email, email_status")
    .eq("seller_profile_id", sellerProfileId)
    .eq("company_id", companyId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------- outreach drafts ----------------
export interface OutreachDraftRow {
  channel: "email" | "linkedin";
  subject: string | null;
  body: string;
  followups: unknown;
  model: string | null;
  updated_at: string;
}

export async function getOutreachDrafts(sb: SB, opportunityId: string, contactId?: string | null, sellerProfileId?: string) {
  let q = sb.from("outreach_drafts").select("*").eq("opportunity_id", opportunityId);
  // Defense-in-depth: scope to the caller's profile in addition to RLS.
  if (sellerProfileId) q = q.eq("seller_profile_id", sellerProfileId);
  if (contactId) q = q.eq("contact_id", contactId);
  const { data } = await q;
  return (data ?? []) as any[];
}

/** Upsert the email + linkedin draft rows for one opportunity+contact. RLS-scoped via `sb`. */
export async function saveOutreachDrafts(
  sb: SB,
  args: {
    sellerProfileId: string;
    opportunityId: string;
    contactId: string | null;
    model: string;
    email?: { subject: string; body: string };
    linkedin?: { body: string };
    followups?: unknown;
  },
) {
  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  if (args.email) {
    rows.push({
      seller_profile_id: args.sellerProfileId,
      opportunity_id: args.opportunityId,
      contact_id: args.contactId,
      channel: "email",
      subject: args.email.subject,
      body: args.email.body,
      followups: args.followups ?? null,
      model: args.model,
      updated_at: now,
    });
  }
  if (args.linkedin) {
    rows.push({
      seller_profile_id: args.sellerProfileId,
      opportunity_id: args.opportunityId,
      contact_id: args.contactId,
      channel: "linkedin",
      subject: null,
      body: args.linkedin.body,
      followups: null,
      model: args.model,
      updated_at: now,
    });
  }
  if (!rows.length) return;
  const { error } = await sb.from("outreach_drafts").upsert(rows, { onConflict: "opportunity_id,contact_id,channel" });
  if (error) throw new Error(error.message);
}

// ---------------- opportunity feedback (quality signal for the founder) ----------------
export const FEEDBACK_REASONS = ["wrong_company", "wrong_timing", "weak_evidence", "wrong_contact", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

/** True if the opportunity exists AND belongs to this seller (RLS-scoped). */
export async function opportunityBelongsToSeller(sb: SB, opportunityId: string, sellerProfileId: string): Promise<boolean> {
  const { data } = await sb
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("seller_profile_id", sellerProfileId)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function getOpportunityFeedback(sb: SB, opportunityId: string) {
  const { data } = await sb
    .from("opportunity_feedback")
    .select("verdict, reason, updated_at")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  return data ?? null;
}

export async function setOpportunityFeedback(
  sb: SB,
  args: { opportunityId: string; sellerProfileId: string; verdict: "useful" | "not_relevant"; reason?: string | null },
) {
  const { error } = await sb.from("opportunity_feedback").upsert(
    {
      opportunity_id: args.opportunityId,
      seller_profile_id: args.sellerProfileId,
      verdict: args.verdict,
      reason: args.reason ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "opportunity_id" },
  );
  if (error) throw new Error(error.message);
}

// ---------------- usage counters (per-user daily spend cap) ----------------
export async function getTodayUsage(admin: SB, userId: string): Promise<{ runs: number; cost: number }> {
  const { data } = await admin
    .from("usage_counters")
    .select("runs_count, cost")
    .eq("user_id", userId)
    .eq("day", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  return { runs: data?.runs_count ?? 0, cost: Number(data?.cost ?? 0) };
}

/** Increment today's run count + estimated cost for a user (atomic upsert). */
export async function addUsage(admin: SB, userId: string, costDelta: number, runsDelta = 1) {
  const day = new Date().toISOString().slice(0, 10);
  const cur = await getTodayUsage(admin, userId);
  const { error } = await admin
    .from("usage_counters")
    .upsert(
      { user_id: userId, day, runs_count: cur.runs + runsDelta, cost: cur.cost + costDelta },
      { onConflict: "user_id,day" },
    );
  if (error) throw new Error(error.message);
}

// ---------------- cron helpers ----------------
/** Runs stuck in `running` past `minutes` - treated as orphaned (webhook missed + tab closed). */
export async function getStuckRuns(admin: SB, minutes: number) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await admin
    .from("discovery_runs")
    .select("*")
    .eq("status", "running")
    .lt("requested_at", cutoff);
  return data ?? [];
}

/** All seller profiles (owner user_id included) for the scheduled daily sweep. */
export async function getAllSellerProfiles(admin: SB) {
  const { data } = await admin.from("seller_profiles").select("id, user_id, domain");
  return data ?? [];
}
