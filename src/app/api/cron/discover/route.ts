import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/engine";
import type { IcpConstraints, SellerProfile } from "@/lib/engine";
import {
  getAllSellerProfiles,
  getSellerProfileById,
  getSituations,
  getIcp,
  getRuns,
  getTodayUsage,
  addUsage,
  getLastRunAtBySituation,
} from "@/lib/db/repo";
import { toSituation } from "@/lib/discovery/worker";
import { reconcileStuckRuns } from "@/lib/discovery/reconcile";
import { selectSituation } from "@/lib/discovery/select-situation";
import { startTaskDiscovery, TASK_RUN_COST } from "@/lib/discovery/task-discovery";
import { log } from "@/lib/log";

export const maxDuration = 120;

// Scheduled entrypoint (Vercel Cron). Two jobs:
//  1. ALWAYS: reconcile orphaned runs (free - status reads only). Safe to ship enabled.
//  2. GATED by DAILY_DISCOVERY_ENABLED=true: ONE balanced Task-API discovery per eligible
//     seller per day (one situation → up to 3 companies), under per-user daily caps. This
//     spends money, so it stays OFF until explicitly enabled.
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const reconciled = await reconcileStuckRuns(admin);

  if (process.env.DAILY_DISCOVERY_ENABLED !== "true") {
    return NextResponse.json({ ok: true, mode: "reconcile-only", reconciled });
  }

  const profiles = await getAllSellerProfiles(admin);
  const perSeller: Array<{ sellerProfileId: string; launched: number; skipped?: string }> = [];

  for (const p of profiles) {
    try {
      const usage = await getTodayUsage(admin, p.user_id);
      if (usage.runs >= LIMITS.maxRunsPerUserPerDay || usage.cost >= LIMITS.maxDailyCostPerUserUSD) {
        perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "daily cap" });
        continue;
      }
      // One cycle per user per day: never start if one is already in flight.
      const active = await getRuns(admin, p.id, ["queued", "running"]);
      if (active.length > 0) {
        perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "already running" });
        continue;
      }

      const rows = await getSituations(admin, p.id);
      const enabled = rows.filter((s: any) => s.enabled);
      if (enabled.length === 0) {
        perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "no enabled signals" });
        continue;
      }

      const lastRun = await getLastRunAtBySituation(admin, p.id);
      const chosen = selectSituation(enabled as Array<{ id: string; enabled: boolean }>, lastRun);
      if (!chosen) {
        perSeller.push({ sellerProfileId: p.id, launched: 0, skipped: "none selected" });
        continue;
      }
      const chosenRow = rows.find((s: any) => s.id === chosen.id);

      const full = await getSellerProfileById(admin, p.id);
      const icp = (await getIcp(admin, p.id)) ?? defaultIcp();
      await startTaskDiscovery(admin, {
        sellerProfileId: p.id,
        situationId: chosenRow.id,
        situation: toSituation(chosenRow),
        seller: toSellerProfile(full),
        icp,
      });
      await addUsage(admin, p.user_id, TASK_RUN_COST, 1);
      perSeller.push({ sellerProfileId: p.id, launched: 1 });
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
  if (!secret) return false; // fail closed
  const auth = req.headers.get("authorization");
  const xcron = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || xcron === secret;
}

function toSellerProfile(p: any): SellerProfile {
  return {
    domain: p?.domain ?? "",
    companyName: p?.company_name ?? p?.domain ?? "",
    productDescription: p?.product_description ?? "",
    targetCustomers: p?.target_customers ?? "",
    problemsSolved: p?.problems_solved ?? "",
    buyerPersonas: p?.buyer_personas ?? [],
    industries: p?.industries ?? [],
  };
}

function defaultIcp(): IcpConstraints {
  return { geographies: [], industries: [], excludedIndustries: [], sizeMin: null, sizeMax: null, dailyTarget: 3 };
}
