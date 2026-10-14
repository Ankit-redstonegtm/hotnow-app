import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getLists, createList, addToList } from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ lists: [] });
    return NextResponse.json({ lists: await getLists(sb, profile.id) });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });
    const { name, kind = "companies", opportunityIds, contactIds } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const list = await createList(sb, profile.id, name, kind === "contacts" ? "contacts" : "companies");
    let added = 0;
    if (opportunityIds?.length || contactIds?.length) {
      added = await addToList(sb, list.id, { opportunityIds, contactIds });
    }
    return NextResponse.json({ list, added });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
}
