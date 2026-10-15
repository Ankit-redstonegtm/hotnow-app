// Reconciliation sweep for orphaned discovery runs.
//
// A run can get stuck in `status='running'` forever if the Parallel webhook is missed
// (misconfigured/dropped) AND the user never reopens a polling tab. Because /api/discovery/start
// refuses to relaunch a situation that still has a running run, a stuck run also deadlocks
// that situation. This sweep re-ingests any run stuck past LIMITS.stuckRunMinutes, which
// finalizes it when the provider reports terminal - reusing the exact same idempotent
// ingestRun as the poll/webhook paths, so it can never double-insert or diverge.
//
// It only reads provider STATUS + RESULT (cheap); it launches no new paid discovery.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITS } from "@/lib/engine";
import { getStuckRuns } from "@/lib/db/repo";
import { notifyIfWaveComplete } from "./worker";
import { ingestAnyRun } from "./task-discovery";
import { log } from "@/lib/log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

export interface ReconcileSummary {
  checked: number;
  finalized: number;
  stillRunning: number;
  failed: number;
}

export async function reconcileStuckRuns(admin: SB, minutes = LIMITS.stuckRunMinutes): Promise<ReconcileSummary> {
  const stuck = await getStuckRuns(admin, minutes);
  const summary: ReconcileSummary = { checked: stuck.length, finalized: 0, stillRunning: 0, failed: 0 };
  const touchedSellers = new Set<string>();

  for (const run of stuck) {
    try {
      const res = await ingestAnyRun(admin, run);
      if (res.status === "completed") summary.finalized++;
      else if (res.status === "failed") summary.failed++;
      else summary.stillRunning++;
      touchedSellers.add(run.seller_profile_id);
    } catch (err) {
      summary.failed++;
      log.error("reconcile.ingest", { runId: run.id, err });
    }
  }

  // A reconciled run may have completed the seller's whole wave - send the Slack ping.
  for (const sellerProfileId of touchedSellers) {
    try {
      await notifyIfWaveComplete(admin, sellerProfileId);
    } catch (err) {
      log.warn("reconcile.notify", { sellerProfileId, err });
    }
  }

  if (stuck.length) log.info("reconcile.sweep", { ...summary });
  return summary;
}
