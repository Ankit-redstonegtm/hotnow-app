import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { launchDiscovery, LIMITS } from "@/lib/engine";
import type { BuyingSituation, Generator, IcpConstraints } from "@/lib/engine";
import {
  getAllSellerProfiles,
  getSituations,
  getIcp,
  getRuns,
  createRun,
  getTodayUsage,
  addUsage,
} from "@/lib/db/repo";
import { toSituation, discoveryWebhookUrl } from "@/lib/discovery/worker";
import { reconcileStuckRuns } from "@/lib/discovery/reconcile";
import { planSellerRuns } from "@/lib/discovery/plan";
import { log } from "@/lib/log";

export const maxDuration = 120;

// Scheduled entrypoint (Vercel Cron). Two jobs:
//  1. ALWAYS: reconcile orphaned runs (free - status reads only). Safe to ship enabled.
//  2. GATED by DAILY_DISCOVERY_ENABLED=true: launch the day's discovery per seller, under
//     per-user daily cost + run caps. This spends money, so it stays OFF until explicitly enabled.
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const reconciled = await reconcileStuckRuns(admin);

  const discoveryEnabled = process.env.DAILY_DISCOVERY_ENABLED === "true";
  if (!discoveryEnabled) {
    return NextResponse.json({ ok: true, mode: "reconcile-only", reconciled });
  }

  const webhookUrl = discoveryWebhookUrl();
  const profiles = await getAllSellerProfiles(admin);
  const perSeller: Array<{ sellerProfileId: string; launched: number; skipped?: string }> = [];

  for (const p of profiles) {
    try {
      const usage = await getTodayUsage(admin, p.user_id);
      if (usage.runs >= LIMITS.maxRunsPerUserPerDay || usage.cost >= LIMITS.maxDailyCostPerUserUSD) {
        perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "daily cap reached" });
        continue;
      }

      const active = await getRuns(admin, p.id, ["queued", "running"]);
      const busy = new Set<string>(active.map((r: any) => r.situation_id));
      const icp = (await getIcp(admin, p.id)) ?? defaultIcp();
      const rows = await getSituations(admin, p.id);
      const matchLimit = Math.min(icp.dailyTarget || LIMITS.defaultMatchLimit, LIMITS.maxMatchLimit);

      const plan = planSellerRuns({
        situations: rows.map((s: any) => ({ id: s.id, enabled: s.enabled, generator: (s.generator ?? "base") as Generator })),
        busySituationIds: busy,
        usage,
        matchLimit,
      });

      const rowById = new Map(rows.map((s: any) => [s.id, s]));
      let launched = 0;
      for (const planned of plan.toLaunch) {
        const situation: BuyingSituation = toSituation(rowById.get(planned.situationId));
        const { runId: providerJobId } = await launchDiscovery(situation, icp, { matchLimit: planned.matchLimit, webhookUrl });
        await createRun(admin, {
          sellerProfileId: p.id,
          situationId: planned.situationId,
          generator: planned.generator,
          matchLimit: planned.matchLimit,
          providerJobId,
          estCost: planned.estCost,
        });
        await addUsage(admin, p.user_id, planned.estCost, 1);
        launched++;
      }
      perSeller.push({ sellerProfileId: p.id, launched, skipped: plan.skipped ?? undefined });
    } catch (err) {
      log.error("cron.seller", { sellerProfileId: p.id, err });
      perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "error" });
    }
  }

  const totalLaunched = perSeller.reduce((n, s) => n + s.launched, 0);
  log.info("cron.discover", { sellers: profiles.length, totalLaunched });
  return NextResponse.json({ ok: true, mode: "discovery", reconciled, totalLaunched, perSeller });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed - no secret means no scheduled access
  const auth = req.headers.get("authorization");
  const xcron = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || xcron === secret;
}

function defaultIcp(): IcpConstraints {
  return { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 5 };
}
