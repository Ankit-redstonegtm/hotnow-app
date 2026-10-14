import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getContacts, countCompaniesNeedingContacts, countContactsNeedingEmail } from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ contacts: [], pending: 0, pendingEmails: 0, pendingPriorityEmails: 0 });
    const [contacts, pending, pendingPriorityEmails, pendingEmails] = await Promise.all([
      getContacts(sb, profile.id),
      countCompaniesNeedingContacts(sb, profile.id),
      countContactsNeedingEmail(sb, profile.id, ["P1", "P2"]),
      countContactsNeedingEmail(sb, profile.id),
    ]);
    return NextResponse.json({ contacts, pending, pendingEmails, pendingPriorityEmails });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
