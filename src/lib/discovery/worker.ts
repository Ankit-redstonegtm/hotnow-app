import { validSlackUrl } from "@/lib/validation";
import { appBaseUrl } from "@/lib/parallel-webhook";
import { deliverProfile } from "@/lib/delivery/dispatch";
import { loadWaveLeads } from "@/lib/delivery/leads";
import { listConnections, selectTargets } from "@/lib/delivery/store";
import { isTransientParallelError } from "@/lib/providers/parallel";
// Result ingestion and notification helpers for the dedicated worker.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  discoveryStatus,
  discoveryResult,
  qualifyCandidates,
  estimateFindAllCost,
} from "@/lib/engine";
import type { BuyingSituation, Generator } from "@/lib/engine";
import {
  getSituations,
  getRuns,
  updateRun,
  upsertCompany,
  upsertOpportunity,
  getSellerProfileById,
} from "@/lib/db/repo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

export interface IngestResult {
  runId: string;
  status: "running" | "completed" | "failed";
  matched?: number;
  newOpps?: number;
  error?: string;
}

/** Map a buying_situations row to the engine shape. */
export function toSituation(s: any): BuyingSituation {
  return {
    name: s.name,
    description: s.description ?? "",
    demandHypothesis: s.demand_hypothesis ?? "",
    observableIndicators: s.observable_indicators ?? [],
    evidenceSources: s.evidence_sources ?? [],
    discoveryObjective: s.discovery_objective ?? "",
    matchConditions: s.match_conditions ?? [],
    generator: (s.generator ?? "base") as Generator,
    source: s.source ?? "ai",
  };
}

/**
 * Ingest one discovery run if (and only if) it has reached a terminal state.
 * Idempotent-safe to call repeatedly: if the provider run is still active it
 * persists cumulative counters and returns running.
 */
export async function ingestRun(admin: SB, run: any, situation?: BuyingSituation): Promise<IngestResult> {
  try {
    // The launcher reserves a DB row before calling the provider.
    if (run.status === "queued") {
      if (Date.now() - Date.parse(run.requested_at) > 5 * 60 * 1000) {
        throw new Error("Discovery launch expired. Please start a new search.");
      }
      return { runId: run.id, status: "running" };
    }
    const st = await discoveryStatus(run.provider_job_id);
    await updateRun(admin, run.id, { candidates_count: st.candidatesCount, matched_count: st.matchedCount, error: null });
    if (st.isActive) return { runId: run.id, status: "running", matched: st.matchedCount };
    if (/failed|error|cancel/i.test(st.status)) throw new Error("Parallel search " + st.status + ": " + (st.terminationReason || "No results available"));

    // Atomic lease: polling and webhooks can arrive concurrently. Only one
    // worker ingests a finished run; a crashed worker becomes retryable.
    const { data: claimed, error: claimError } = await admin.from("discovery_runs")
      .update({ ingestion_claimed_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
      .eq("id", run.id).in("status", ["queued", "running"])
      .or(`ingestion_claimed_until.is.null,ingestion_claimed_until.lt.${new Date().toISOString()}`)
      .select("id");
    if (claimError) throw new Error(claimError.message);
    if (!claimed?.length) return { runId: run.id, status: "running" };

    const { candidates } = await discoveryResult(run.provider_job_id);

    let sit = situation;
    if (!sit) {
      const rows = await getSituations(admin, run.seller_profile_id);
      const row = rows.find((s: any) => s.id === run.situation_id);
      sit = row ? toSituation(row) : undefined;
    }
    const { qualified } = sit ? await qualifyCandidates(candidates, sit) : { qualified: [] };

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

    const matched = candidates.filter((c) => /^matched$/i.test(String(c.matchStatus))).length;
    await updateRun(admin, run.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      candidates_count: candidates.length,
      matched_count: matched,
      actual_cost: estimateFindAllCost((run.generator ?? "base") as Generator, matched),
    });
    return { runId: run.id, status: "completed", matched, newOpps };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ingest error";
    if (isTransientParallelError(err)) {
      await updateRun(admin, run.id, { ingestion_claimed_until: null, error: "Connection interrupted; retrying automatically." });
      return { runId: run.id, status: "running" };
    }
    await updateRun(admin, run.id, { status: "failed", completed_at: new Date().toISOString(), error: msg });
    return { runId: run.id, status: "failed", error: msg };
  }
}

/**
 * When a seller's whole discovery wave has finished (no runs left queued/running),
 * deliver the new opportunities to every connected destination.
 * Idempotent: the first caller to see the finished wave claims it via `notified_at`,
 * so the poll path and the webhook path can both call this without double-pinging.
 */
export async function notifyIfWaveComplete(admin: SB, sellerProfileId: string): Promise<void> {
  const stillRunning = await getRuns(admin, sellerProfileId, ["queued", "running"]);
  if (stillRunning.length > 0) return;

  const profile = await getSellerProfileById(admin, sellerProfileId);
  const legacy = typeof profile?.slack_webhook_url === "string" ? profile.slack_webhook_url : null;
  let connections: Awaited<ReturnType<typeof listConnections>> = [];
  try { connections = await listConnections(admin, sellerProfileId); } catch { connections = []; }
  if (!selectTargets(connections, legacy).length) return;

  const since = Date.now() - 30 * 60 * 1000;
  const wave = (await getRuns(admin, sellerProfileId, ["completed", "failed"])).filter(
    (r: any) => r.completed_at && Date.parse(r.completed_at) >= since,
  );
  const unnotified = wave.filter((r: any) => !r.notified_at);
  if (unnotified.length === 0) return; // already announced this wave

  // Claim BEFORE sending so a concurrent webhook+poll don't both ping.
  const stamp = new Date().toISOString();
  const { data: claimed, error } = await admin.from("discovery_runs")
    .update({ notified_at: stamp }).in("id", unnotified.map((r: any) => r.id))
    .is("notified_at", null).select("id");
  if (error || !claimed?.length) return;

  const completedRunIds = wave.filter((r: any) => r.status === "completed").map((r: any) => r.id);
  let newCount = 0;
  if (completedRunIds.length) {
    // run_id is stamped on an opportunity only at first insert, so rows whose
    // run_id is in this wave are exactly the opportunities newly discovered now.
    const { count } = await admin
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("run_id", completedRunIds);
    newCount = count ?? 0;
  }

  const base = appBaseUrl() ?? "https://app.hotnow.co";
  const summary = newCount > 0
    ? `HotNow found ${newCount} new ${newCount === 1 ? "opportunity" : "opportunities"}. ${base}/dashboard`
    : "HotNow finished scanning your signals. No new opportunities this run.";
  let leads: Awaited<ReturnType<typeof loadWaveLeads>> = [];
  if (newCount > 0) {
    try { leads = await loadWaveLeads(admin, completedRunIds, base); } catch { leads = []; }
  }
  try {
    await deliverProfile({ admin, profileId: sellerProfileId, legacyWebhook: legacy, summary, leads });
  } catch { /* delivery is best-effort; the wave is already claimed */ }
}

/** POST a simple message to a Slack incoming-webhook URL. Never throws. */
export async function notifySlack(webhookUrl: string, text: string): Promise<void> {
  if (!validSlackUrl(webhookUrl)) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    /* notification is best-effort */
  }
}

export { appBaseUrl, discoveryWebhookUrl } from "@/lib/parallel-webhook";
