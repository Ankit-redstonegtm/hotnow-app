import { icpInput, inputError } from "@/lib/validation";
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
    const icp = icpInput.parse(await req.json());
    await upsertIcp(sb, profile.id, icp);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  const invalid = inputError(e); if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
}
