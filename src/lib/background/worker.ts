// Durable queue state lives in Supabase. Run this in a separate process, never a
// request handler or browser timer. A bounded pool avoids one slow job blocking others.
import { createAdminClient } from "@/lib/supabase/admin";
import { startResearch, finishResearch, startSituations, finishSituations, defaultIcp, launchDiscovery } from "@/lib/engine";
import { updateSellerProfile, upsertIcp, replaceSituations, getIcp, getSituations, updateRun, getFreshPrewarm } from "@/lib/db/repo";
import { ingestRun, notifyIfWaveComplete, toSituation } from "@/lib/discovery/worker";
import { discoveryWebhookUrl } from "@/lib/parallel-webhook";
import { isTransientParallelError } from "@/lib/providers/parallel";

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
      if (kind === "research") {
        const description = row.raw_research?._background?.description;
        const prewarm = !description ? await getFreshPrewarm(db, row.domain, 30 * 60 * 1000) : null;
        const taskId = prewarm?.task_id || (await startResearch(row.domain, description)).taskId;
        await updateSellerProfile(db, row.id, { [taskKey]: taskId, [statusKey]: "running" });
      } else {
        const result = await startSituations({ domain: row.domain, companyName: row.company_name || row.domain,
          productDescription: row.product_description || "", targetCustomers: row.target_customers || "",
          problemsSolved: row.problems_solved || "", buyerPersonas: row.buyer_personas || [], industries: row.industries || [] });
        if (result.situations) {
          await replaceSituations(db, row.id, result.situations);
          await updateSellerProfile(db, row.id, { [statusKey]: "done", [taskKey]: null });
        } else await updateSellerProfile(db, row.id, { [taskKey]: result.taskId, [statusKey]: "running" });
      }
      return;
    }
    if (state === "starting") {
      // An interrupted provider POST may have succeeded. Never automatically spend twice.
      if (Date.now() - Date.parse(row.updated_at) > 5 * 60_000) throw new Error("Launch interrupted. Check Parallel before retrying.");
      return;
    }
    if (!row[taskKey]) throw new Error("Missing provider task ID. Please retry.");
    if (kind === "research") {
      const profile = await finishResearch(row[taskKey], row.domain);
      if (!profile) return;
      await upsertIcp(db, row.id, defaultIcp(profile));
      await updateSellerProfile(db, row.id, { company_name: profile.companyName, product_description: profile.productDescription,
        target_customers: profile.targetCustomers, problems_solved: profile.problemsSolved,
        buyer_personas: profile.buyerPersonas, industries: profile.industries, raw_research: profile.raw,
        research_status: "done", ...(row.situations_status === "none" ? { situations_status: "queued" } : {}) });
    } else {
      const situations = await finishSituations(row[taskKey]);
      if (!situations) return;
      await replaceSituations(db, row.id, situations);
      await updateSellerProfile(db, row.id, { situations_status: "done", situations_task_id: null });
    }
  } catch (error) {
    if (state !== "starting" && isTransientParallelError(error)) return;
    await updateSellerProfile(db, row.id, { [statusKey]: "failed",
      raw_research: { ...row.raw_research, _background: { ...row.raw_research?._background,
        [`${kind}Error`]: error instanceof Error ? error.message : "Background task failed" } } });
  }
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
  for (const row of profiles) for (const kind of ["research", "situations"] as const)
    if (["queued", "starting", "running", "ready"].includes(row[`${kind}_status`]))
      jobs.push({ id: `${row.id}:${kind}`, run: () => profileJob(row, kind) });
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
