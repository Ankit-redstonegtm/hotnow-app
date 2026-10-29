// Persistence layer for the engine's outputs. Clients already target the `hotnow`
// schema (db.schema option). User-scoped writes use the request client (RLS);
// cross-user ingest writes (companies/candidates/opportunities) use the admin client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { contactSourceLabel } from "../engine/contact-merge";
import type { BuyingSituation, IcpConstraints, SellerProfile, Opportunity } from "../engine/types";
import { normalizeDomain } from "../util/domain";

// Schema-agnostic client type (our clients target the `hotnow` schema, not `public`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

// ---------------- seller profile ----------------
export async function upsertSellerProfile(sb: SB, userId: string, p: SellerProfile): Promise<string> {
  const existing = await sb.from("seller_profiles").select("id").eq("user_id", userId).eq("domain", normalizeDomain(p.domain)).maybeSingle();
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
  const { data, error } = await sb.from("seller_profiles").upsert({
    user_id: userId, domain: normalizeDomain(domain), research_task_id: taskId,
    research_status: "running", updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,domain" }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getSellerProfileByUser(sb: SB, userId: string) {
  const { headers, cookies } = await import("next/headers");
  const requestHeaders = await headers();
  const explicit = requestHeaders.get("x-hotnow-workspace");
  const selected = explicit || (await cookies()).get("hotnow_workspace")?.value;
  if (selected && /^[0-9a-f-]{36}$/i.test(selected)) {
    const { data, error } = await sb.from("seller_profiles").select("*")
      .eq("user_id", userId).eq("id", selected).maybeSingle();
    if (error) throw new Error(error.message);
    if (data || explicit) return data;
  } else if (explicit) return null;
  const { data, error } = await sb.from("seller_profiles").select("*").eq("user_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getSellerProfileById(sb: SB, id: string) {
  const { data, error } = await sb.from("seller_profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
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
  const { error: deleteError } = await sb.from("buying_situations").delete().eq("seller_profile_id", sellerProfileId);
  if (deleteError) throw new Error(deleteError.message);
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
  const { data, error } = await sb
    .from("buying_situations")
    .select("*")
    .eq("seller_profile_id", sellerProfileId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateSituation(sb: SB, id: string, fields: Record<string, unknown>) {
  const { data: { user } } = await sb.auth.getUser();
  const profile = user && await getSellerProfileByUser(sb, user.id);
  if (!profile) throw new Error("No company selected");
  const { data, error } = await sb.from("buying_situations").update(fields).eq("id", id).eq("seller_profile_id", profile.id).select("id");
  if (!error && !data?.length) throw new Error("Signal not found in this company");
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
  const { data, error } = await sb.from("icp_constraints").select("*").eq("seller_profile_id", sellerProfileId).maybeSingle();
  if (error) throw new Error(error.message);
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
      status: "queued",
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
  const { data, error } = await q.order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRunById(sb: SB, id: string) {
  const { data, error } = await sb.from("discovery_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Look up a run by the provider's job id (FindAll `findall_id`). Used by the webhook. */
export async function getRunByProviderJobId(sb: SB, providerJobId: string) {
  const { data, error } = await sb
    .from("discovery_runs")
    .select("*")
    .eq("provider_job_id", providerJobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
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
export async function upsertOpportunity(
  admin: SB,
  o: {
    sellerProfileId: string;
    companyId: string;
    situationId: string;
    runId: string;
    opp: Opportunity;
  },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await admin.from("opportunities").select("id").eq("seller_profile_id", o.sellerProfileId)
    .eq("company_id", o.companyId).eq("situation_id", o.situationId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  let id = existing.data?.id, isNew = false;
  if (!id) {
    const inserted = await admin.from("opportunities").insert({ seller_profile_id: o.sellerProfileId, company_id: o.companyId,
      situation_id: o.situationId, run_id: o.runId, what_happened: o.opp.whatHappened, why_it_matters: o.opp.whyItMatters,
      confidence: o.opp.confidence, evidence_date: o.opp.evidenceDate ? safeDate(o.opp.evidenceDate) : null, status: "new" }).select("id").single();
    if (inserted.error?.code === "23505") return upsertOpportunity(admin, o);
    if (inserted.error) throw new Error(inserted.error.message);
    id = inserted.data.id; isNew = true;
  } else {
    const { error } = await admin.from("opportunities").update({ last_delivered_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  // Retrying repairs missing evidence; completed runs must not silently lose it.
  const saved = await admin.from("evidence").select("source_url").eq("opportunity_id", id);
  if (saved.error) throw new Error(saved.error.message);
  const seen = new Set((saved.data || []).map((r: any) => r.source_url));
  const evidenceRows = o.opp.evidence.filter(e => { if (seen.has(e.url)) return false; seen.add(e.url); return true; }).map(e => ({
    opportunity_id: id, reasoning: o.opp.whatHappened, source_url: e.url, source_date: e.date ? safeDate(e.date) : null, citation: e,
  }));
  if (evidenceRows.length) {
    const { error } = await admin.from("evidence").insert(evidenceRows);
    if (error) throw new Error(error.message);
  }
  return { id, isNew };
}

export async function getOpportunities(sb: SB, sellerProfileId: string) {
  const { data, error } = await sb
    .from("opportunities")
    .select("*, companies(normalized_domain, name), buying_situations(name), evidence(source_url, source_date)")
    .eq("seller_profile_id", sellerProfileId)
    .order("first_discovered_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

function safeDate(d: string): string | null {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// ---------------- contacts (Blitz decision-makers) ----------------
/** Companies (from opportunities) that still need contact sourcing. */
export async function companiesNeedingContacts(sb: SB, sellerProfileId: string, limit: number) {
  const [{ data, error }, attempted] = await Promise.all([
    sb.from("opportunities").select("id, company_id, companies!inner(normalized_domain, name)")
      .eq("seller_profile_id", sellerProfileId),
    sb.from("contact_sourcing").select("company_id").eq("seller_profile_id", sellerProfileId),
  ]);
  if (error) throw new Error(error.message);
  if (attempted.error) throw new Error(attempted.error.message);
  const seen = new Set<string>((attempted.data ?? []).map((r: any) => r.company_id));
  const out: Array<{ companyId: string; domain: string; name: string; opportunityId: string }> = [];
  for (const r of data ?? []) {
    const c = (r as any).companies;
    if (!c?.normalized_domain || seen.has(r.company_id)) continue;
    seen.add(r.company_id);
    out.push({ companyId: r.company_id, domain: c.normalized_domain, name: c.name, opportunityId: r.id });
    if (out.length >= limit) break;
  }
  return out;
}

export async function countCompaniesNeedingContacts(sb: SB, sellerProfileId: string): Promise<number> {
  return (await companiesNeedingContacts(sb, sellerProfileId, Number.MAX_SAFE_INTEGER)).length;
}

export async function saveContacts(
  admin: SB,
  args: { sellerProfileId: string; companyId: string; opportunityId: string | null; contacts: Array<{ fullName: string; title: string; linkedinUrl: string; jobLevel?: string; jobFunction?: string; priority: string; email?: string; mobile?: string; sources?: string[] }> },
): Promise<number> {
  if (args.contacts.length) {
    const rows = args.contacts.map((c) => ({
      seller_profile_id: args.sellerProfileId,
      company_id: args.companyId,
      opportunity_id: args.opportunityId,
      full_name: c.fullName,
      title: c.title,
      linkedin_url: c.linkedinUrl || null,
      job_level: c.jobLevel ?? null,
      job_function: c.jobFunction ?? null,
      priority: c.priority,
      email: c.email || null,
      mobile: c.mobile || null,
      source: contactSourceLabel(c.sources),
    }));
    const { error } = await admin.from("contacts").upsert(rows, { onConflict: "seller_profile_id,company_id,linkedin_url", ignoreDuplicates: true });
    if (error) throw new Error(error.message.includes("mobile") ? `${error.message} Apply supabase/migrations/005_contact_provider_credits.sql.` : error.message);
  }
  const { error } = await admin.from("contact_sourcing").upsert({ seller_profile_id: args.sellerProfileId, company_id: args.companyId, sourced_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
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
  const { data, error } = await q;
  if (error) throw new Error(error.message);
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
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Record an email lookup result. Pass "" to mark "checked, none found" so we never retry. */
export async function setContactEmail(admin: SB, id: string, email: string) {
  const { error } = await admin.from("contacts").update({ email }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getContacts(sb: SB, sellerProfileId: string) {
  const { data, error } = await sb
    .from("contacts")
    .select("*, companies(normalized_domain, name)")
    .eq("seller_profile_id", sellerProfileId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------- lists ----------------
export async function createList(sb: SB, sellerProfileId: string, name: string, kind: "companies" | "contacts") {
  const { data, error } = await sb.from("lists").insert({ seller_profile_id: sellerProfileId, name, kind }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLists(sb: SB, sellerProfileId: string) {
  const { data, error } = await sb
    .from("lists")
    .select("*, list_items(count)")
    .eq("seller_profile_id", sellerProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addToList(sb: SB, listId: string, items: { opportunityIds?: string[]; contactIds?: string[] }) {
  const { list } = await getListWithItems(sb, listId);
  if (!list) throw new Error("List not found in this company");
  const rows = [
    ...(items.opportunityIds ?? []).map((id) => ({ list_id: listId, opportunity_id: id })),
    ...(items.contactIds ?? []).map((id) => ({ list_id: listId, contact_id: id })),
  ];
  if (!rows.length) return 0;
  if ((list.kind === "contacts" && items.opportunityIds?.length) || (list.kind === "companies" && items.contactIds?.length)) throw new Error("List items must match the list type");
  const column = list.kind === "contacts" ? "contact_id" : "opportunity_id";
  const { data, error } = await sb.from("list_items").upsert(rows, { onConflict: "list_id," + column, ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  return data?.length || 0;
}

export async function getListWithItems(sb: SB, listId: string) {
  const { data: { user } } = await sb.auth.getUser();
  const profile = user && await getSellerProfileByUser(sb, user.id);
  if (!profile) return { list: null, items: [] };
  const { data: list, error } = await sb.from("lists").select("*").eq("id", listId).eq("seller_profile_id", profile.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!list) return { list: null, items: [] };
  const { data: items, error: itemsError } = await sb
    .from("list_items")
    .select("*, opportunities(id, what_happened, why_it_matters, companies(normalized_domain, name), buying_situations(name)), contacts(full_name, title, linkedin_url, priority, email, companies(normalized_domain, name))")
    .eq("list_id", listId);
  if (itemsError) throw new Error(itemsError.message);
  return { list, items: items ?? [] };
}

// ---------------- prewarm research (pre-signup head start) ----------------
/**
 * A research task started for a domain BEFORE the user finished signing up, so
 * the summary is ready by the time they land. Keyed by domain; server-only.
 */
export async function getFreshPrewarm(admin: SB, domain: string, maxAgeMs: number) {
  const { data, error } = await admin.from("prewarm_research").select("*").eq("domain", domain).maybeSingle();
  if (error) throw new Error(error.message);
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
  const { count, error } = await admin
    .from("prewarm_research")
    .select("domain", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ---------------- settings / criteria ----------------
export async function updateSettings(sb: SB, profileId: string, fields: { slack_webhook_url?: string | null; contact_criteria?: unknown }) {
  const { error } = await sb.from("seller_profiles").update(fields).eq("id", profileId);
  if (error) throw new Error(error.message);
}
