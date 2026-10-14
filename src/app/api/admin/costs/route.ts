// TEMPORARY cost monitor. Shows spend derived from the DB so we can watch what
// Parallel + Gemini are costing during validation. Numbers:
//   - FindAll (discovery): ACTUAL, summed from discovery_runs.actual_cost.
//   - Research (Parallel Task, processor "core"): ESTIMATE/ceiling - we don't log
//     per-call cost, so we count profiles + un-adopted pre-warms x $0.025.
//   - Gemini situations (gemini-3.8-flash): ESTIMATE - sub-cent per generation.
// For exact billing, check the Parallel + Google AI Studio dashboards.
// Remove this route (and its Settings card) before launch.

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { TASK_PRICE_PER_RUN } from "@/lib/engine/config";

export const maxDuration = 20;

const RESEARCH_TASK_PRICE = TASK_PRICE_PER_RUN.core ?? 0.025; // startResearch uses "core"
const GEMINI_PER_GEN = 0.001; // generous ceiling for gemini-3.8-flash situation gen

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET() {
  try {
    await requireUser();
    const admin = createAdminClient();

    const [runs, profiles, prewarms] = await Promise.all([
      admin.from("discovery_runs").select("actual_cost"),
      admin.from("seller_profiles").select("id", { count: "exact", head: true }),
      admin.from("prewarm_research").select("domain", { count: "exact", head: true }),
    ]);

    const costs = (runs.data ?? []) as { actual_cost: number | null }[];
    const findAllActual = costs.reduce((s, r) => s + Number(r.actual_cost || 0), 0);
    const runsCount = costs.length;
    const profilesCount = profiles.count ?? 0;
    const prewarmCount = prewarms.count ?? 0;

    const researchTasks = profilesCount + prewarmCount;
    const researchEst = researchTasks * RESEARCH_TASK_PRICE;
    const geminiEst = profilesCount * GEMINI_PER_GEN;

    return NextResponse.json({
      parallel: {
        findAllActualUsd: round(findAllActual),
        findAllRuns: runsCount,
        researchEstUsd: round(researchEst),
        researchTasks,
        subtotalUsd: round(findAllActual + researchEst),
      },
      gemini: {
        situationsEstUsd: round(geminiEst),
        generations: profilesCount,
      },
      totalEstUsd: round(findAllActual + researchEst + geminiEst),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
