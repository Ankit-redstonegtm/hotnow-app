import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, updateSellerProfile } from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    return NextResponse.json({ profile });
  } catch (e) {
    return handle(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });
    const body = await req.json();
    const allowed = ["company_name", "product_description", "target_customers", "problems_solved", "buyer_personas", "industries"];
    const fields: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) fields[k] = body[k];
    await updateSellerProfile(sb, profile.id, fields);
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
