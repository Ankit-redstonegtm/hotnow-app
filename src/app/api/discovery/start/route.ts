import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { launchDiscovery, LIMITS } from "@/lib/engine";
import type { BuyingSituation, Generator, IcpConstraints } from "@/lib/engine";
import { getSellerProfileByUser, getSituations, getIcp, createRun, getRuns, getTodayUsage, addUsage } from "@/lib/db/repo";
import { toSituation, discoveryWebhookUrl } from "@/lib/discovery/worker";
import { planSellerRuns } from "@/lib/discovery/plan";
import { log } from "@/lib/log";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const url = new URL(req.url);
    const max = Math.min(
      parseInt(url.searchParams.get("max") ?? String(LIMITS.maxSituationsPerDailyRun), 10) || LIMITS.maxSituationsPerDailyRun,
      LIMITS.maxSituationsPerDailyRun,
    );

    // Per-user daily spend/run caps - the SAME controls the scheduled cron enforces, so a
    // logged-in user (or a replayed session) can't loop this endpoint into unbounded FindAll spend.
    const usage = await getTodayUsage(sb, user.id);

    // Don't relaunch situations that already have an in-flight run (overlap prevention).
    const active = await getRuns(sb, profile.id, ["queued", "running"]);
    const busy = new Set<string>(active.map((r) => r.situation_id));

    const icp = (await getIcp(sb, profile.id)) ?? defaultIcp();
    const matchLimit = Math.min(icp.dailyTarget || LIMITS.defaultMatchLimit, LIMITS.maxMatchLimit);
    const rows = await getSituations(sb, profile.id);

    const plan = planSellerRuns({
      situations: rows.map((s) => ({ id: s.id, enabled: s.enabled, generator: (s.generator ?? "base") as Generator })),
      busySituationIds: busy,
      usage,
      matchLimit,
    });
    const toLaunch = plan.toLaunch.slice(0, max);

    if (toLaunch.length === 0) {
      const enabledCount = rows.filter((s) => s.enabled).length;
      if (plan.skipped) {
        return NextResponse.json({ launched: [], message: "You've reached today's discovery limit. New searches will be available tomorrow.", skipped: plan.skipped });
      }
      if (enabledCount === 0) return NextResponse.json({ launched: [], message: "Turn on at least one signal first." });
      return NextResponse.json({ launched: [], message: "Your signals already have searches running." });
    }

    const webhookUrl = discoveryWebhookUrl();
    const rowById = new Map(rows.map((s) => [s.id, s]));
    const launched: Array<{ runId: string; situationId: string; name: string }> = [];

    for (const planned of toLaunch) {
      const row = rowById.get(planned.situationId);
      const situation: BuyingSituation = toSituation(row);
      const { runId: providerJobId } = await launchDiscovery(situation, icp, { matchLimit: planned.matchLimit, webhookUrl });
      const dbRunId = await createRun(sb, {
        sellerProfileId: profile.id,
        situationId: planned.situationId,
        generator: planned.generator,
        matchLimit: planned.matchLimit,
        providerJobId,
        estCost: planned.estCost,
      });
      await addUsage(sb, user.id, planned.estCost, 1);
      launched.push({ runId: dbRunId, situationId: planned.situationId, name: row?.name ?? "" });
    }

    log.info("discovery.start", { sellerProfileId: profile.id, launched: launched.length });
    return NextResponse.json({ launched });
  } catch (e) {
    return handle(e);
  }
}

function defaultIcp(): IcpConstraints {
  return { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 5 };
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const msg = e instanceof Error ? e.message : "unknown error";
  log.error("api.discovery_start", { err: e });
  return NextResponse.json({ error: msg }, { status: 500 });
}
