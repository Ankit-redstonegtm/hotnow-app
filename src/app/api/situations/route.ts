import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { startSituations } from "@/lib/engine";
import type { SellerProfile } from "@/lib/engine";
import { getSellerProfileByUser, getSituations, replaceSituations, updateSituation, updateSellerProfile } from "@/lib/db/repo";
import { log } from "@/lib/log";

export const maxDuration = 60;

function toProfile(row: any): SellerProfile {
  return {
    domain: row.domain,
    companyName: row.company_name ?? row.domain,
    productDescription: row.product_description ?? "",
    targetCustomers: row.target_customers ?? "",
    problemsSolved: row.problems_solved ?? "",
    buyerPersonas: row.buyer_personas ?? [],
    industries: row.industries ?? [],
  };
}

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ situations: [] });
    const situations = await getSituations(sb, profile.id);
    return NextResponse.json({ situations });
  } catch (e) {
    return handle(e);
  }
}

export async function POST() {
  try {
    const { sb, user } = await requireUser();
    const row = await getSellerProfileByUser(sb, user.id);
    if (!row) return NextResponse.json({ error: "research your company first" }, { status: 400 });

    const { taskId, situations } = await startSituations(toProfile(row), { count: 5 });

    if (situations) {
      // fast path (non-Parallel LLM): generated inline
      const saved = await replaceSituations(sb, row.id, situations);
      await updateSellerProfile(sb, row.id, { situations_status: "done", situations_task_id: null });
      return NextResponse.json({ status: "done", situations: saved });
    }
    // async path: store task id, client polls /status
    await updateSellerProfile(sb, row.id, { situations_task_id: taskId, situations_status: "running" });
    return NextResponse.json({ status: "running" });
  } catch (e) {
    return handle(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { sb } = await requireUser();
    const { id, ...fields } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const allowed = ["name", "description", "demand_hypothesis", "discovery_objective", "match_conditions", "generator", "enabled"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in fields) patch[k] = fields[k];
    await updateSituation(sb, id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const msg = e instanceof Error ? e.message : "unknown error";
  log.error("api.situations", { err: e });
  return NextResponse.json({ error: msg }, { status: 500 });
}
