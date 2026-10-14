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
 * Ingest a discovery run's results - INCREMENTALLY while it runs, then finalize.
 *
 * FindAll's /result endpoint returns a live snapshot of every candidate found so
 * far, each tagged matched/generated/unmatched/discarded. So on each poll tick we
 * qualify + upsert the matched ones RIGHT AWAY instead of waiting for the whole
 * run - the user sees their first lead in ~90s instead of ~8min, with no change to
 * the final set. This is safe to call repeatedly: upsertOpportunity dedupes on
 * UNIQUE(seller, company, situation), so re-processing the growing snapshot each
 * tick never double-inserts - it only surfaces genuinely-new matches.
 *
 * The run is left "running" (and keeps being polled) until the provider reports a
 * terminal state; only then do we stamp completed_at + final counts. A transient
 * error mid-run is swallowed (status "running") so a single bad snapshot fetch
 * can't kill a run that's still going - we just retry on the next tick.
 */
export async function ingestRun(admin: SB, run: any, situation?: BuyingSituation): Promise<IngestResult> {
  let st;
  try {
    st = await discoveryStatus(run.provider_job_id);
  } catch (err) {
    // Couldn't even read status - treat as a transient blip, don't touch the run.
    return { runId: run.id, status: "running", error: err instanceof Error ? err.message : "status error" };
  }

  try {
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

    // Still active: the matched leads above are already persisted + visible. Keep
    // the run open so the dashboard keeps polling for the rest.
    if (st.isActive) {
      return { runId: run.id, status: "running", matched, newOpps };
    }

    // Terminal: finalize with the authoritative final counts.
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
    // A hiccup while the run is still going shouldn't fail it - retry next tick.
    if (st.isActive) return { runId: run.id, status: "running", error: msg };
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
