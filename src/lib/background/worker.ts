// Runs in a separate long-lived process (see scripts/background-worker.ts), never in a
// request handler or a browser timer. Queue state lives in Supabase, so a restart loses nothing.
import { randomUUID } from "node:crypto";
import { claimEnrichmentJobs, processEnrichmentJob } from "./jobs";
import { log } from "@/lib/log";

const MAX_ACTIVE = 3; // bounded pool so one slow provider call cannot block other workspaces
const workerId = randomUUID();
const active = new Set<string>();

/** Claim due jobs and process one batch of each. Called every few seconds by the worker loop. */
export async function tick() {
  const claimed = await claimEnrichmentJobs(workerId, MAX_ACTIVE - active.size);
  for (const job of claimed) {
    if (active.has(job.id)) continue; // already in flight in this process
    active.add(job.id);
    void processEnrichmentJob(job, workerId)
      .catch((err) => log.error("background.worker", { jobId: job.id, err }))
      .finally(() => active.delete(job.id));
  }
}

export function activeJobs() { return active.size; }
