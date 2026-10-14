import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getContacts, countCompaniesNeedingContacts } from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ contacts: [], pending: 0 });
    const [contacts, pending] = await Promise.all([
      getContacts(sb, profile.id),
      countCompaniesNeedingContacts(sb, profile.id),
    ]);
    return NextResponse.json({ contacts, pending });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
