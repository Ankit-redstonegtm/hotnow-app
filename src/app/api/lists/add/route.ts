import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { addToList } from "@/lib/db/repo";

export async function POST(req: Request) {
  try {
    const { sb } = await requireUser();
    const { listId, opportunityIds, contactIds } = await req.json();
    if (!listId) return NextResponse.json({ error: "listId required" }, { status: 400 });
    const added = await addToList(sb, listId, { opportunityIds, contactIds });
    return NextResponse.json({ added });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
