// Shared discovery ingest + notification worker.
// Used by BOTH the in-session poll route (/api/discovery/poll) and the
// background webhook route (/api/discovery/webhook) so the two paths can never
// diverge. All writes go through the admin (service-role) client because the
// webhook path has no user session.

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
 * returns { status: "running" } and writes nothing.
 */
export async function ingestRun(admin: SB, run: any, situation?: BuyingSituation): Promise<IngestResult> {
  try {
    const st = await discoveryStatus(run.provider_job_id);
    if (st.isActive) return { runId: run.id, status: "running", matched: st.matchedCount };

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
    await updateRun(admin, run.id, { status: "failed", completed_at: new Date().toISOString(), error: msg });
    return { runId: run.id, status: "failed", error: msg };
  }
}

/**
 * When a seller's whole discovery wave has finished (no runs left queued/running),
 * send a single Slack notification with the count of genuinely-new opportunities.
 * Idempotent: the first caller to see the finished wave claims it via `notified_at`,
 * so the poll path and the webhook path can both call this without double-pinging.
 */
export async function notifyIfWaveComplete(admin: SB, sellerProfileId: string): Promise<void> {
  const stillRunning = await getRuns(admin, sellerProfileId, ["queued", "running"]);
  if (stillRunning.length > 0) return;

  const profile = await getSellerProfileById(admin, sellerProfileId);
  const slack = profile?.slack_webhook_url;
  if (!slack) return;

  const since = Date.now() - 30 * 60 * 1000;
  const wave = (await getRuns(admin, sellerProfileId, ["completed", "failed"])).filter(
    (r: any) => r.completed_at && Date.parse(r.completed_at) >= since,
  );
  const unnotified = wave.filter((r: any) => !r.notified_at);
  if (unnotified.length === 0) return; // already announced this wave

  // Claim BEFORE sending so a concurrent webhook+poll don't both ping.
  const stamp = new Date().toISOString();
  await Promise.all(unnotified.map((r: any) => updateRun(admin, r.id, { notified_at: stamp })));

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
  const text =
    newCount > 0
      ? `:fire: *HotNow* found *${newCount}* new ${newCount === 1 ? "opportunity" : "opportunities"} ready to review. ${base}/dashboard`
      : `:mag: *HotNow* finished scanning your signals. No new opportunities this run.`;
  await notifySlack(slack, text);
}

/** POST a simple message to a Slack incoming-webhook URL. Never throws. */
export async function notifySlack(webhookUrl: string, text: string): Promise<void> {
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

/** Public base URL of the deployed app, used to build the webhook + deep links. */
export function appBaseUrl(): string | undefined {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit && /^https:\/\//.test(explicit) && !/localhost|127\.0\.0\.1/.test(explicit)) {
    return explicit.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

/** Webhook URL to hand Parallel, or undefined when we can't be reached (local dev). */
export function discoveryWebhookUrl(): string | undefined {
  const base = appBaseUrl();
  return base ? `${base}/api/discovery/webhook` : undefined;
}
