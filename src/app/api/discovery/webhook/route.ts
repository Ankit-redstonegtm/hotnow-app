import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyParallelWebhook } from "@/lib/parallel-webhook";
import { findAllStatus } from "@/lib/providers/parallel";

// Acknowledge quickly. The worker fetches authoritative results and ingests them.
export async function POST(req: Request) {
  const secret = process.env.PARALLEL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhooks are not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifyParallelWebhook(req.headers, raw, secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const db = createAdminClient(), data = event.data || {};
    if (event.type === "task_run.status" && typeof data.run_id === "string") {
      for (const kind of ["research", "situations"]) {
        const { error } = await db.from("seller_profiles").update({ [kind + "_status"]: "ready" })
          .eq(kind + "_task_id", data.run_id).eq(kind + "_status", "running");
        if (error) throw new Error(error.message);
      }
    } else if (["findall.candidate.generated", "findall.candidate.matched", "findall.candidate.enriched"].includes(event.type) && typeof data.findall_id === "string") {
      const { data: run, error: lookupError } = await db.from("discovery_runs").select("id")
        .eq("provider_job_id", data.findall_id).eq("status", "running").maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (run) {
        // Fetch cumulative counters, rather than incrementing on deliveries that
        // may be repeated. Short timeout keeps callbacks separate from ingestion.
        const progress = await findAllStatus(data.findall_id, 5000);
        const { error } = await db.from("discovery_runs").update({ candidates_count: progress.candidatesCount,
          matched_count: progress.matchedCount }).eq("id", run.id).eq("status", "running");
        if (error) throw new Error(error.message);
      }
    } else if (["findall.run.completed", "findall.run.failed", "findall.run.cancelled"].includes(event.type) && typeof data.findall_id === "string") {
      const metrics = data.status?.metrics;
      const counts: Record<string, number> = {};
      if (Number.isSafeInteger(metrics?.generated_candidates_count) && metrics.generated_candidates_count >= 0) counts.candidates_count = metrics.generated_candidates_count;
      if (Number.isSafeInteger(metrics?.matched_candidates_count) && metrics.matched_candidates_count >= 0) counts.matched_count = metrics.matched_candidates_count;
      if (Object.keys(counts).length) {
        const { error } = await db.from("discovery_runs").update(counts).eq("provider_job_id", data.findall_id).eq("status", "running");
        if (error) throw new Error(error.message);
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not persist event; please retry" }, { status: 503 });
  }
}
