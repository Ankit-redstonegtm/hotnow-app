import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getListWithItems } from "@/lib/db/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sb } = await requireUser();
    const { id } = await params;
    const { list, items } = await getListWithItems(sb, id);
    if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ list, items });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
