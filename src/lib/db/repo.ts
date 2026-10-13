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
    // race: another insert won — re-read
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
  const existing = await admin
    .from("opportunities")
    .select("id")
    .eq("seller_profile_id", o.sellerProfileId)
    .eq("company_id", o.companyId)
    .eq("situation_id", o.situationId)
    .maybeSingle();

  if (existing.data?.id) {
    // already delivered for this (seller, company, situation) — refresh delivery timestamp only
    await admin.from("opportunities").update({ last_delivered_at: new Date().toISOString() }).eq("id", existing.data.id);
    return { id: existing.data.id, isNew: false };
  }

  const { data, error } = await admin
    .from("opportunities")
    .insert({
      seller_profile_id: o.sellerProfileId,
      company_id: o.companyId,
      situation_id: o.situationId,
      run_id: o.runId,
      what_happened: o.opp.whatHappened,
      why_it_matters: o.opp.whyItMatters,
      confidence: o.opp.confidence,
      evidence_date: o.opp.evidenceDate ? o.opp.evidenceDate.slice(0, 10) : null,
      status: "new",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const evidenceRows = o.opp.evidence.map((e) => ({
    opportunity_id: data.id,
    reasoning: o.opp.whatHappened,
    source_url: e.url,
    source_date: e.date ? safeDate(e.date) : null,
    citation: e,
  }));
  if (evidenceRows.length) await admin.from("evidence").insert(evidenceRows);

  return { id: data.id, isNew: true };
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
