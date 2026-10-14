// Wipes a user's data so a fresh signup/run can be tested from scratch. Scoped:
//   - deletes only seller_profiles WHERE user_id = target; every child table
//     (situations, runs, opportunities, lists, contacts, evidence...) cascades.
//   - the shared `companies` table is a PARENT of opportunities, never a child
//     of seller_profiles, so it is NOT touched (other projects rely on it).
// A normal user may only clear themselves; an admin may pass { userId } to clear
// any user (used by the owner-only /admin console).

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.userId === "string" ? body.userId : undefined;
    // Only an admin may clear someone other than themselves.
    if (requested && requested !== user.id && !isAdmin(user.email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const targetUserId = requested ?? user.id;

    const admin = createAdminClient();

    // Grab the target's profile domains first, so we can also drop any pre-warm
    // head start for them - otherwise an immediate re-test of the same domain
    // could adopt a stale pre-warm instead of starting clean.
    const { data: profiles } = await admin
      .from("seller_profiles")
      .select("id, domain")
      .eq("user_id", targetUserId);
    const domains = (profiles ?? []).map((p: { domain?: string }) => p.domain).filter(Boolean) as string[];
    if (domains.length) await admin.from("prewarm_research").delete().in("domain", domains);

    // One delete; the rest cascades. (companies is untouched.)
    const { error } = await admin.from("seller_profiles").delete().eq("user_id", targetUserId);
    if (error) throw error;

    return NextResponse.json({ ok: true, clearedProfiles: profiles?.length ?? 0 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
