import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { estimateFindAllCost, LIMITS } from "@/lib/engine";
import type { BuyingSituation, Generator, IcpConstraints } from "@/lib/engine";
import { getSellerProfileByUser, getSituations, getIcp, createRun, getRuns } from "@/lib/db/repo";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const url = new URL(req.url);
    const max = Math.min(
      parseInt(url.searchParams.get("max") ?? String(LIMITS.maxSituationsPerDailyRun), 10),
      LIMITS.maxSituationsPerDailyRun,
    );
    if (!Number.isInteger(max) || max < 1) {
      return NextResponse.json({ error: "max must be a positive integer" }, { status: 400 });
    }

    // Don't relaunch situations that already have an in-flight run.
    const active = await getRuns(sb, profile.id, ["queued", "running"]);
    const busy = new Set(active.map((r) => r.situation_id));

    const icp = (await getIcp(sb, profile.id)) ?? defaultIcp();
    const situations = (await getSituations(sb, profile.id))
      .filter((s) => s.enabled && !busy.has(s.id))
      .slice(0, max);

    if (situations.length === 0) {
      return NextResponse.json({ launched: [], message: "Turn on at least one signal first." });
    }

    // Worker launches provider runs independently of this HTTP request.

    const launched: Array<{ runId: string; situationId: string; name: string }> = [];
    for (const s of situations) {
      const situation = toSituation(s);
      const matchLimit = Math.min(icp.dailyTarget || LIMITS.defaultMatchLimit, LIMITS.maxMatchLimit);
      // Reserve the signal in Postgres before spending on the provider. The
      // partial unique index rejects simultaneous launches for the same signal.
      const dbRunId = await createRun(sb, {
        sellerProfileId: profile.id,
        situationId: s.id,
        generator: situation.generator,
        matchLimit,
        providerJobId: `pending-${crypto.randomUUID()}`,
        estCost: estimateFindAllCost(situation.generator, matchLimit),
      });
      launched.push({ runId: dbRunId, situationId: s.id, name: s.name });
    }

    return NextResponse.json({ launched, queued: true }, { status: 202 });
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

function defaultIcp(): IcpConstraints {
  return { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 5 };
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const msg = e instanceof Error ? e.message : "unknown error";
  return NextResponse.json({ error: msg }, { status: 500 });
}
