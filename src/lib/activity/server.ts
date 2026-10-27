import type { SupabaseClient } from "@supabase/supabase-js";
import { discoveryWebhookUrl } from "@/lib/parallel-webhook";
import { missingJobsSchema } from "@/lib/background/jobs";
import { isActive, type ActivityItem, type ActivitySnapshot } from "./types";
type SB = SupabaseClient<any, any, any, any, any>;

export async function getActivity(sb: SB, userId: string): Promise<ActivitySnapshot> {
  const { data: profiles, error } = await sb.from("seller_profiles")
    .select("id,domain,company_name,research_status,situations_status,updated_at,background:raw_research->_background").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (profiles || []).map(p => p.id);
  const items: ActivityItem[] = [];
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const workspace = (id: string) => ({ workspaceId: id, workspace: profileMap.get(id)?.company_name || profileMap.get(id)?.domain || "Company" });
  for (const p of profiles || []) for (const kind of ["research", "situations"] as const) {
    const state = p[`${kind}_status`];
    if (!state || state === "none") continue;
    items.push({ id: `${p.id}:${kind}`, ...workspace(p.id), kind,
      title: kind === "research" ? "Company research" : "Buying signals",
      status: state === "done" ? "completed" : state === "failed" ? "failed" : state === "queued" ? "queued" : "running",
      phase: state === "queued" ? "Waiting for a worker" : state === "starting" ? "Starting research" : state === "ready" ? "Saving findings" : state === "done" ? "Research saved to your workspace" : state === "failed" ? "Research needs attention" : kind === "research" ? "Researching your company and customers" : "Identifying situations that create demand",
      timestamp: p.updated_at, error: state === "failed" ? (p.background as any)?.[`${kind}Error`] : undefined });
  }
  let queueAvailable = true;
  if (ids.length) {
    const runColumns = "id,seller_profile_id,status,provider_job_id,candidates_count,matched_count,match_limit,error,requested_at,completed_at,ingestion_claimed_until,buying_situations(name)";
    const [activeRuns, recentRuns, activeJobs, recentJobs] = await Promise.all([
      sb.from("discovery_runs").select(runColumns).in("seller_profile_id", ids).in("status", ["queued", "running"]),
      sb.from("discovery_runs").select(runColumns).in("seller_profile_id", ids).not("status", "in", "(queued,running)").order("requested_at", { ascending: false }).limit(25),
      sb.from("background_jobs").select("*").in("seller_profile_id", ids).in("status", ["queued", "running", "retrying"]),
      sb.from("background_jobs").select("*").in("seller_profile_id", ids).not("status", "in", "(queued,running,retrying)").order("updated_at", { ascending: false }).limit(25),
    ]);
    for (const result of [activeRuns, recentRuns]) if (result.error) throw new Error(result.error.message);
    for (const result of [activeJobs, recentJobs]) if (result.error) {
      if (missingJobsSchema(result.error)) queueAvailable = false; else throw new Error(result.error.message);
    }
    for (const r of [...(activeRuns.data || []), ...(recentRuns.data || [])]) items.push({
      id: r.id, ...workspace(r.seller_profile_id), kind: "discovery", title: (r.buying_situations as any)?.name || "Company discovery",
      status: r.status, phase: r.status === "queued" ? "Waiting for a worker" : r.status === "completed" ? "Companies and evidence saved" : r.status === "failed" ? "Search needs attention" : r.provider_job_id.startsWith("pending-") ? "Starting Parallel search" : r.ingestion_claimed_until && Date.parse(r.ingestion_claimed_until) > Date.now() ? "Checking evidence and saving companies" : "Finding companies and verifying matches",
      candidates: r.candidates_count, matched: r.matched_count, target: r.match_limit, error: r.error || undefined, timestamp: r.completed_at || r.requested_at });
    for (const j of [...(activeJobs.data || []), ...(recentJobs.data || [])]) items.push({
      id: j.id, ...workspace(j.seller_profile_id), kind: j.kind, title: j.kind === "contacts" ? "Find decision-makers" : "Find work emails",
      status: j.status, phase: j.status === "cancelled" ? "Stopped; saved results are kept" : j.cancel_requested && isActive(j) ? "Stopping after the current lookup" : j.step, timestamp: j.updated_at,
      completed: j.completed_items, total: j.total_items, results: j.result_count, attempts: j.attempts,
      error: j.last_error || undefined, canCancel: isActive(j) && !j.cancel_requested, canRetry: ["failed", "cancelled"].includes(j.status) });
  }
  items.sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return { items: [...items.filter(isActive), ...items.filter(i => !isActive(i)).slice(0, 25)], active: items.filter(isActive).length,
    mode: discoveryWebhookUrl() ? "webhook" : "background", observedAt: new Date().toISOString(), queueAvailable };
}
