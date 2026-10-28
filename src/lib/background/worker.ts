// Durable queue state lives in Supabase. Run this in a separate process, never a
// request handler or browser timer. A bounded pool avoids one slow job blocking others.
import { createAdminClient } from "@/lib/supabase/admin";
import { startResearch, finishResearch, launchDiscovery, type SellerIntelligence } from "@/lib/engine";
import { updateSellerProfile, upsertIcp, replaceSituations, getIcp, getSituations, updateRun, getFreshPrewarm } from "@/lib/db/repo";
import { ingestRun, notifyIfWaveComplete, toSituation } from "@/lib/discovery/worker";
import { discoveryWebhookUrl } from "@/lib/parallel-webhook";
import { isTransientClayError } from "@/lib/providers/clay";

import { claimEnrichmentJobs, processEnrichmentJob } from "./jobs";
const active = new Set<string>();
const lastStarted = new Map<string, number>();
const MAX_ACTIVE = 3;
const stamp = () => new Date().toISOString();
async function checked(query: any) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function profileJob(row: any, kind: "research" | "situations") {
  const db = createAdminClient(), statusKey = `${kind}_status`, taskKey = `${kind}_task_id`;
  let state = row[statusKey];
  try {
    if (state === "queued") {
      const claimed = await checked(db.from("seller_profiles").update({ [statusKey]: "starting", updated_at: stamp() })
        .eq("id", row.id).eq(statusKey, "queued").select("id"));
      if (!claimed.length) return;
      state = "starting";
      // Clay's input is the domain only, so a signup prewarm is reusable even when
      // the user also typed a description. Regenerating signals starts a new run.
      const prewarm = kind === "research" ? await getFreshPrewarm(db, row.domain, 30 * 60 * 1000) : null;
      const taskId = prewarm?.task_id || (await startResearch(row.domain, { itemId: row.id })).taskId;
      await updateSellerProfile(db, row.id, { [taskKey]: taskId, [statusKey]: "running" });
      return;
    }
    if (state === "starting") {
      // An interrupted provider POST may have succeeded. Never automatically spend twice.
      if (Date.now() - Date.parse(row.updated_at) > 5 * 60_000) throw new Error("Launch interrupted. Check Clay before retrying.");
      return;
    }
    if (!row[taskKey]) throw new Error("Missing provider task ID. Please retry.");
    const intelligence = await finishResearch(row[taskKey], row.domain);
    if (!intelligence) return;
    await persistIntelligence(db, row, intelligence);
  } catch (error) {
    if (state !== "starting" && isTransientClayError(error)) return;
    await updateSellerProfile(db, row.id, { [statusKey]: "failed",
      raw_research: { ...row.raw_research, _background: { ...row.raw_research?._background,
        [`${kind}Error`]: error instanceof Error ? error.message : "Background task failed" } } });
  }
}

async function persistIntelligence(db: ReturnType<typeof createAdminClient>, row: any, intelligence: SellerIntelligence) {
  const noted = row.raw_research?._background?.description;
  const productDescription = intelligence.profile.productDescription || (typeof noted === "string" ? noted.trim() : "");
  const background = row.raw_research?._background;
  const base = intelligence.profile.raw && typeof intelligence.profile.raw === "object" ? intelligence.profile.raw as Record<string, unknown> : {};
  const existing = await getIcp(db, row.id);
  await upsertIcp(db, row.id, { ...intelligence.icp, dailyTarget: existing?.dailyTarget ?? intelligence.icp.dailyTarget });
  await replaceSituations(db, row.id, intelligence.situations);
  await updateSellerProfile(db, row.id, {
    company_name: intelligence.profile.companyName,
    product_description: productDescription,
    target_customers: intelligence.profile.targetCustomers,
    problems_solved: intelligence.profile.problemsSolved,
    buyer_personas: intelligence.profile.buyerPersonas,
    industries: intelligence.profile.industries,
    raw_research: background ? { ...base, _background: background } : intelligence.profile.raw ?? null,
    research_status: "done",
    situations_status: "done",
    situations_task_id: null,
  });
}

async function discoveryJob(row: any) {
  const db = createAdminClient();
  if (row.status === "queued") {
    const claimed = await checked(db.from("discovery_runs").update({ status: "running",
      ingestion_claimed_until: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", row.id).eq("status", "queued").select("id"));
    if (!claimed.length) return;
    try {
      const situation = (await getSituations(db, row.seller_profile_id)).find((s: any) => s.id === row.situation_id);
      if (!situation) throw new Error("Signal no longer exists");
      const icp = await getIcp(db, row.seller_profile_id) || { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 5 };
      const { runId } = await launchDiscovery(toSituation(situation), icp, { matchLimit: row.match_limit, webhookUrl: discoveryWebhookUrl() });
      await updateRun(db, row.id, { provider_job_id: runId, ingestion_claimed_until: null, error: null });
    } catch (error) {
      await updateRun(db, row.id, { status: "failed", completed_at: stamp(), error: error instanceof Error ? error.message : "Launch failed" });
    }
    return;
  }
  if (row.provider_job_id.startsWith("pending-")) {
    if (Date.parse(row.ingestion_claimed_until || row.requested_at) < Date.now())
      await updateRun(db, row.id, { status: "failed", completed_at: stamp(), error: "Launch interrupted. Check Parallel before retrying." });
    return;
  }
  await ingestRun(db, row);
  await notifyIfWaveComplete(db, row.seller_profile_id);
}

export async function tick() {
  const db = createAdminClient();
  const [profiles, runs] = await Promise.all([
    checked(db.from("seller_profiles").select("*").or("research_status.in.(queued,starting,running,ready),situations_status.in.(queued,starting,running,ready)")),
    checked(db.from("discovery_runs").select("*").in("status", ["queued", "running"]).order("requested_at")),
  ]);
  const jobs: { id: string; run: () => Promise<void> }[] = [];
  for (const row of profiles) {
    const researchLive = ["queued", "starting", "running", "ready"].includes(row.research_status);
    for (const kind of ["research", "situations"] as const) {
      if (!["queued", "starting", "running", "ready"].includes(row[`${kind}_status`])) continue;
      // One Clay run writes the seller and the situations. Don't start a second while research is in flight.
      if (kind === "situations" && researchLive) continue;
      jobs.push({ id: `${row.id}:${kind}`, run: () => profileJob(row, kind) });
    }
  }
  for (const row of runs) jobs.push({ id: row.id, run: () => discoveryJob(row) });
  // Round-robin checks: slow, unfinished provider runs must not starve later users.
  const liveIds = new Set(jobs.map(job => job.id));
  for (const id of lastStarted.keys()) if (!liveIds.has(id)) lastStarted.delete(id);
  jobs.sort((a, b) => (lastStarted.get(a.id) || 0) - (lastStarted.get(b.id) || 0));
  // A unique token per claim fences off stale work after cancellation/retry,
  // including a retry handled by this same process.
  const claimToken = crypto.randomUUID();
  const enrichments = await claimEnrichmentJobs(claimToken, Math.max(0, MAX_ACTIVE - active.size - Math.min(jobs.length, 1)));
  for (const job of enrichments) {
    if (active.has(job.id)) {
      await checked(db.from("background_jobs").update({ status: "queued", locked_by: null, locked_until: null })
        .eq("id", job.id).eq("locked_by", claimToken).select("id"));
    } else jobs.unshift({ id: job.id, run: () => processEnrichmentJob(job, claimToken) });
  }
  for (const job of jobs) {
    if (active.size >= MAX_ACTIVE) break;
    if (active.has(job.id)) continue;
    active.add(job.id);
    lastStarted.set(job.id, Date.now());
    void job.run().catch(() => console.error("Background job encountered a database error; will retry.")).finally(() => active.delete(job.id));
  }
}

export function activeJobs() { return active.size; }
