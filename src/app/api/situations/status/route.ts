import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getSituations } from "@/lib/db/repo";

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
    if (row.situations_status === "failed") return NextResponse.json({ status: "failed", error: row.raw_research?._background?.situationsError || "Signal generation failed" });
    return NextResponse.json({ status: ["queued", "starting", "running", "ready"].includes(row.situations_status) ? "running" : row.situations_status ?? "none", stage: row.situations_status, situations: existing });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ status: "failed", error: e instanceof Error ? e.message : "error" }, { status: 200 });
  }
}
