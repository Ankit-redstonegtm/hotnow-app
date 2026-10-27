import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getSituations, updateSituation } from "@/lib/db/repo";

export const maxDuration = 60;

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

    if (row.research_status !== "done") return NextResponse.json({ error: "Company research is still running" }, { status: 409 });
    if (["queued", "starting", "running", "ready"].includes(row.situations_status)) return NextResponse.json({ status: "running" });
    const { error } = await sb.from("seller_profiles").update({ situations_status: "queued", situations_task_id: null, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("situations_status", row.situations_status);
    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "running" }, { status: 202 });
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
  return NextResponse.json({ error: msg }, { status: 500 });
}
