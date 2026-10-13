import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getIcp, upsertIcp } from "@/lib/db/repo";
import type { IcpConstraints } from "@/lib/engine";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ icp: null });
    const icp = await getIcp(sb, profile.id);
    return NextResponse.json({ icp });
  } catch (e) {
    return handle(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });
    const b = await req.json();
    const icp: IcpConstraints = {
      geographies: b.geographies ?? [],
      industries: b.industries ?? [],
      excludedIndustries: b.excludedIndustries ?? [],
      sizeMin: b.sizeMin ?? null,
      sizeMax: b.sizeMax ?? null,
      dailyTarget: b.dailyTarget ?? 5,
    };
    await upsertIcp(sb, profile.id, icp);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
}
