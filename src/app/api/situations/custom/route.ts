import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, addCustomSituation } from "@/lib/db/repo";

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });
    const { name, description, objective } = await req.json();
    if (!name || !objective) return NextResponse.json({ error: "name and objective required" }, { status: 400 });
    const situation = await addCustomSituation(sb, profile.id, { name, description: description ?? "", objective });
    return NextResponse.json({ situation });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
