import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { enrichEmail } from "@/lib/providers/blitz";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSellerProfileByUser,
  contactsNeedingEmail,
  countContactsNeedingEmail,
  setContactEmail,
} from "@/lib/db/repo";

export const maxDuration = 60;

const BATCH = 10; // contacts enriched per call, keeps us under the function limit

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    // By default we only find emails for the people you'd actually reach (P1 and P2).
    // The Contacts tab can request every tier by sending { all: true }.
    let tiers: string[] | undefined = ["P1", "P2"];
    try {
      const body = await req.json();
      if (body?.all) tiers = undefined;
      else if (Array.isArray(body?.tiers) && body.tiers.length) tiers = body.tiers;
    } catch { /* no body, use default */ }

    const pending = await contactsNeedingEmail(sb, profile.id, BATCH, tiers);
    if (pending.length === 0) {
      return NextResponse.json({ found: 0, remaining: 0, done: true });
    }

    const admin = createAdminClient();
    let found = 0;
    for (const c of pending) {
      const email = await enrichEmail(c.linkedin_url);
      await setContactEmail(admin, c.id, email ?? ""); // "" marks "checked, none found"
      if (email) found++;
    }

    const remaining = await countContactsNeedingEmail(sb, profile.id, tiers);
    return NextResponse.json({ found, remaining, done: remaining === 0 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
