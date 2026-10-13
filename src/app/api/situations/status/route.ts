import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { finishSituations } from "@/lib/engine";
import { getSellerProfileByUser, getSituations, replaceSituations, updateSellerProfile } from "@/lib/db/repo";

export const maxDuration = 60;

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const row = await getSellerProfileByUser(sb, user.id);
    if (!row) return NextResponse.json({ status: "none" });

    // already have situations?
    const existing = await getSituations(sb, row.id);
    if (row.situations_status === "done" && existing.length) {
      return NextResponse.json({ status: "done", situations: existing });
    }
    if (row.situations_status !== "running" || !row.situations_task_id) {
      return NextResponse.json({ status: row.situations_status ?? "none", situations: existing });
    }

    const situations = await finishSituations(row.situations_task_id);
    if (!situations) return NextResponse.json({ status: "running" });

    const saved = await replaceSituations(sb, row.id, situations);
    await updateSellerProfile(sb, row.id, { situations_status: "done", situations_task_id: null });
    return NextResponse.json({ status: "done", situations: saved });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ status: "failed", error: e instanceof Error ? e.message : "error" }, { status: 200 });
  }
}
