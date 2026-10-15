import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { LIMITS } from "@/lib/engine";
import type { IcpConstraints, SellerProfile } from "@/lib/engine";
import { getSellerProfileByUser, getSituations, getIcp, getRuns, getTodayUsage, addUsage, getLastRunAtBySituation } from "@/lib/db/repo";
import { toSituation } from "@/lib/discovery/worker";
import { selectSituation } from "@/lib/discovery/select-situation";
import { startTaskDiscovery, TASK_RUN_COST } from "@/lib/discovery/task-discovery";
import { log } from "@/lib/log";

export const maxDuration = 120;

// Default discovery = Parallel Task API (one balanced-selected situation per cycle → up to 3
// qualified companies). FindAll code is preserved but no longer auto-invoked here.
export async function POST() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    // Per-user daily caps (same controls the cron enforces).
    const usage = await getTodayUsage(sb, user.id);
    if (usage.runs >= LIMITS.maxRunsPerUserPerDay || usage.cost >= LIMITS.maxDailyCostPerUserUSD) {
      return NextResponse.json({ launched: [], message: "You've reached today's discovery limit. More tomorrow.", skipped: "daily cap" });
    }

    // One discovery cycle at a time (overlap prevention).
    const active = await getRuns(sb, profile.id, ["queued", "running"]);
    if (active.length > 0) {
      return NextResponse.json({ launched: [], message: "A search is already running." });
    }

    const rows = await getSituations(sb, profile.id);
    const enabled = rows.filter((s) => s.enabled);
    if (enabled.length === 0) return NextResponse.json({ launched: [], message: "Turn on at least one signal first." });

    // Balanced, least-recently-used selection of ONE situation.
    const lastRun = await getLastRunAtBySituation(sb, profile.id);
    const chosen = selectSituation(enabled as Array<{ id: string; enabled: boolean }>, lastRun);
    if (!chosen) return NextResponse.json({ launched: [], message: "No eligible signal to run." });
    const chosenRow = rows.find((s) => s.id === chosen.id)!;

    const icp = (await getIcp(sb, profile.id)) ?? defaultIcp();
    const seller = toSellerProfile(profile);

    const { runId } = await startTaskDiscovery(sb, {
      sellerProfileId: profile.id,
      situationId: chosenRow.id,
      situation: toSituation(chosenRow),
      seller,
      icp,
    });
    await addUsage(sb, user.id, TASK_RUN_COST, 1);

    log.info("discovery.start", { provider: "parallel_task", runId, situationId: chosenRow.id });
    return NextResponse.json({ launched: [{ runId, situationId: chosenRow.id, name: chosenRow.name }] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.discovery_start", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

function toSellerProfile(p: any): SellerProfile {
  return {
    domain: p.domain,
    companyName: p.company_name ?? p.domain,
    productDescription: p.product_description ?? "",
    targetCustomers: p.target_customers ?? "",
    problemsSolved: p.problems_solved ?? "",
    buyerPersonas: p.buyer_personas ?? [],
    industries: p.industries ?? [],
  };
}

function defaultIcp(): IcpConstraints {
  return { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 3 };
}
