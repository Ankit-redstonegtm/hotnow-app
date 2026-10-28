import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadCard } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadWaveLeads(admin: SB, runIds: string[], appUrl: string): Promise<LeadCard[]> {
  if (!runIds.length) return [];
  const { data, error } = await admin.from("opportunities")
    .select("what_happened, why_it_matters, confidence, evidence_date, first_discovered_at, companies(name, normalized_domain), buying_situations(name), evidence(source_url)")
    .in("run_id", runIds)
    .order("first_discovered_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, any>) => {
    const company = one(row.companies);
    const situation = one(row.buying_situations);
    const evidence = one(row.evidence);
    return {
      company: company?.name || company?.normalized_domain || "Company",
      domain: company?.normalized_domain || "",
      signal: situation?.name || "",
      whatHappened: row.what_happened || "",
      whyItMatters: row.why_it_matters || "",
      confidence: row.confidence || "",
      evidenceDate: row.evidence_date || "",
      sourceUrl: evidence?.source_url || "",
      discoveredAt: row.first_discovered_at ? String(row.first_discovered_at).slice(0, 10) : "",
      link: `${appUrl}/dashboard/companies`,
    };
  });
}
