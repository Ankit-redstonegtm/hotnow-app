import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerIntelligence } from "@/lib/providers/clay";
import { mapClayIntelligence } from "@/lib/engine/clay-intelligence";
import {
  getSellerProfileByUser,
  upsertSellerProfile,
  upsertIcp,
  getSituations,
  replaceSituations,
  updateSellerProfile,
} from "@/lib/db/repo";
import { log } from "@/lib/log";

export const maxDuration = 60;

// Poll the Clay run and, on completion, persist seller profile + ICP + situations into the
// existing tables - idempotently:
//  - research_status==='done' short-circuits (already applied), so repeat polls are no-ops.
//  - situations are written only when none exist yet (never overwrites user edits).
//  - a failed run only flips status flags; it never corrupts the profile or situations.
export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ status: "missing" });

    if (profile.research_status === "done" && profile.situations_status === "done") {
      return NextResponse.json({ status: "done", ready: true });
    }
    if (profile.research_status === "failed") {
      return NextResponse.json({ status: "failed", error: profile.research_error ?? "research failed" });
    }
    const runId = profile.research_task_id;
    if (!runId) return NextResponse.json({ status: "idle" });

    const res = await getSellerIntelligence(runId);

    if (res.state === "running") return NextResponse.json({ status: "running" });

    if (res.state === "failed") {
      await updateSellerProfile(sb, profile.id, { research_status: "failed", situations_status: "failed" });
      log.warn("intelligence.failed", { profileId: profile.id, error: res.error });
      return NextResponse.json({ status: "failed", error: res.error ?? "Clay run failed", retryable: true });
    }

    // complete — persist idempotently
    const intel = res.intelligence!;
    const { profile: prof, icp, situations } = mapClayIntelligence(intel, profile.domain);

    await upsertSellerProfile(sb, user.id, prof);
    await upsertIcp(sb, profile.id, icp);

    const existing = await getSituations(sb, profile.id);
    if (existing.length === 0 && situations.length > 0) {
      await replaceSituations(sb, profile.id, situations);
    }
    await updateSellerProfile(sb, profile.id, { research_status: "done", situations_status: "done" });

    log.info("intelligence.done", { profileId: profile.id, situations: situations.length });
    return NextResponse.json({ status: "done", ready: true, situations: situations.length });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.intelligence_status", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
