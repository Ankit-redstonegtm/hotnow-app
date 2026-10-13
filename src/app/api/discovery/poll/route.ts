import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { discoveryStatus, discoveryResult, qualifyCandidates, estimateFindAllCost } from "@/lib/engine";
import type { BuyingSituation, Generator } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSellerProfileByUser, getSituations, getRuns, updateRun, upsertCompany, upsertOpportunity } from "@/lib/db/repo";

export const maxDuration = 300;

export async function POST() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const running = await getRuns(sb, profile.id, ["queued", "running"]);
    const situations = await getSituations(sb, profile.id);
    const sitById = new Map(situations.map((s) => [s.id, s]));
    const admin = createAdminClient();

    const report: Array<{ runId: string; status: string; matched?: number; newOpps?: number; error?: string }> = [];

    for (const run of running) {
      try {
        const st = await discoveryStatus(run.provider_job_id);
        if (st.isActive) {
          report.push({ runId: run.id, status: "running", matched: st.matchedCount });
          continue;
        }

        // terminal → ingest
        const { candidates } = await discoveryResult(run.provider_job_id);
        const sRow = sitById.get(run.situation_id);
        const situation = sRow ? toSituation(sRow) : undefined;
        const { qualified } = situation
          ? await qualifyCandidates(candidates, situation)
          : { qualified: [] };

        let newOpps = 0;
        for (const opp of qualified) {
          const companyId = await upsertCompany(admin, opp.company.domain || opp.company.name, opp.company.name);
          const { isNew } = await upsertOpportunity(admin, {
            sellerProfileId: profile.id,
            companyId,
            situationId: run.situation_id,
            runId: run.id,
            opp,
          });
          if (isNew) newOpps++;
        }

        const matched = candidates.filter((c) => /^matched$/i.test(String(c.matchStatus))).length;
        await updateRun(sb, run.id, {
          status: "completed",
          completed_at: new Date().toISOString(),
          candidates_count: candidates.length,
          matched_count: matched,
          actual_cost: estimateFindAllCost((run.generator ?? "base") as Generator, matched),
        });
        report.push({ runId: run.id, status: "completed", matched, newOpps });
      } catch (err) {
        await updateRun(sb, run.id, { status: "failed", error: err instanceof Error ? err.message : "ingest error" });
        report.push({ runId: run.id, status: "failed", error: err instanceof Error ? err.message : "error" });
      }
    }

    const done = report.every((r) => r.status === "completed" || r.status === "failed");
    return NextResponse.json({ runs: report, done, remaining: report.filter((r) => r.status === "running").length });
  } catch (e) {
    return handle(e);
  }
}

function toSituation(s: any): BuyingSituation {
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

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const msg = e instanceof Error ? e.message : "unknown error";
  return NextResponse.json({ error: msg }, { status: 500 });
}
