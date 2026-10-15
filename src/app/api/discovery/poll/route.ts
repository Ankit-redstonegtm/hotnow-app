// In-session fallback: the dashboard polls this while a tab is open. With the
// webhook wired (/api/discovery/webhook) most runs are already ingested by the
// time this fires; this remains the path for local dev (where Parallel can't
// reach us) and as a safety net. Both paths share lib/discovery/worker.

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSellerProfileByUser, getSituations, getRuns } from "@/lib/db/repo";
import { notifyIfWaveComplete, toSituation } from "@/lib/discovery/worker";
import { ingestAnyRun } from "@/lib/discovery/task-discovery";

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

    const report = [] as Array<{ runId: string; status: string; matched?: number; newOpps?: number; error?: string }>;
    for (const run of running) {
      const sRow = sitById.get(run.situation_id);
      const res = await ingestAnyRun(admin, run, sRow ? toSituation(sRow) : undefined);
      report.push(res);
    }

    await notifyIfWaveComplete(admin, profile.id);

    const done = report.every((r) => r.status === "completed" || r.status === "failed");
    return NextResponse.json({ runs: report, done, remaining: report.filter((r) => r.status === "running").length });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
