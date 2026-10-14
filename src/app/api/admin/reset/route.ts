// TEMPORARY testing helper. Wipes the CURRENT logged-in user's data so a fresh
// signup/run can be tested from scratch. Strictly user-scoped:
//   - deletes only seller_profiles WHERE user_id = you; every child table
//     (situations, runs, opportunities, lists, contacts, evidence...) cascades.
//   - the shared `companies` table is a PARENT of opportunities, never a child
//     of seller_profiles, so it is NOT touched (other projects rely on it).
// Remove this route (and the Settings card that calls it) before launch.

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function POST() {
  try {
    const { user } = await requireUser();
    const admin = createAdminClient();

    // Grab this user's profile domains first, so we can also drop any pre-warm
    // head start for them - otherwise an immediate re-test of the same domain
    // could adopt a stale pre-warm instead of starting clean.
    const { data: profiles } = await admin
      .from("seller_profiles")
      .select("id, domain")
      .eq("user_id", user.id);
    const domains = (profiles ?? []).map((p: { domain?: string }) => p.domain).filter(Boolean) as string[];
    if (domains.length) await admin.from("prewarm_research").delete().in("domain", domains);

    // One delete; the rest cascades. (companies is untouched.)
    const { error } = await admin.from("seller_profiles").delete().eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, clearedProfiles: profiles?.length ?? 0 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
