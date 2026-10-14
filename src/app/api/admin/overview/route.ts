// Owner-only operations overview: every signed-up user with their activity and
// spend. Admin-gated (see lib/admin). Spend: FindAll is ACTUAL (summed from
// discovery_runs.actual_cost); research is an ESTIMATE ($0.025/Parallel Task,
// counted as one per profile) since per-call cost isn't logged; Gemini is
// negligible. For exact billing use the Parallel / Google AI Studio dashboards.

import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TASK_PRICE_PER_RUN } from "@/lib/engine/config";

export const maxDuration = 20;

const RESEARCH_TASK_PRICE = TASK_PRICE_PER_RUN.core ?? 0.025;
const round = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  try {
    const { user } = await requireUser();
    if (!isAdmin(user.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const admin = createAdminClient();

    // Auth users (service role can list them), newest first.
    const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (authErr) throw authErr;
    const users = authData.users;

    // Pull the hotnow rows once, aggregate in memory (volumes are tiny).
    const [profilesRes, runsRes, oppsRes, sitsRes, prewarmsRes] = await Promise.all([
      admin.from("seller_profiles").select("id, user_id, domain, company_name, created_at"),
      admin.from("discovery_runs").select("seller_profile_id, actual_cost, status"),
      admin.from("opportunities").select("seller_profile_id"),
      admin.from("buying_situations").select("seller_profile_id"),
      admin.from("prewarm_research").select("domain", { count: "exact", head: true }),
    ]);

    type Prof = { id: string; user_id: string; domain: string | null; company_name: string | null; created_at: string };
    const profiles = (profilesRes.data ?? []) as Prof[];
    const runs = (runsRes.data ?? []) as { seller_profile_id: string; actual_cost: number | null; status: string }[];
    const opps = (oppsRes.data ?? []) as { seller_profile_id: string }[];
    const sits = (sitsRes.data ?? []) as { seller_profile_id: string }[];

    const profByUser = new Map<string, Prof>();
    for (const p of profiles) profByUser.set(p.user_id, p);
    const profIdToUser = new Map<string, string>();
    for (const p of profiles) profIdToUser.set(p.id, p.user_id);

    const countBy = <T extends { seller_profile_id: string }>(rows: T[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const uid = profIdToUser.get(r.seller_profile_id);
        if (uid) m.set(uid, (m.get(uid) ?? 0) + 1);
      }
      return m;
    };
    const runsByUser = countBy(runs);
    const oppsByUser = countBy(opps);
    const sitsByUser = countBy(sits);
    const findAllByUser = new Map<string, number>();
    for (const r of runs) {
      const uid = profIdToUser.get(r.seller_profile_id);
      if (uid) findAllByUser.set(uid, (findAllByUser.get(uid) ?? 0) + Number(r.actual_cost || 0));
    }

    const rows = users.map((u) => {
      const prof = profByUser.get(u.id);
      const findAll = findAllByUser.get(u.id) ?? 0;
      const researchEst = prof ? RESEARCH_TASK_PRICE : 0; // one research task per profile
      return {
        id: u.id,
        email: u.email ?? "",
        createdAt: u.created_at,
        domain: prof?.domain ?? null,
        company: prof?.company_name ?? null,
        onboarded: Boolean(prof),
        situations: sitsByUser.get(u.id) ?? 0,
        runs: runsByUser.get(u.id) ?? 0,
        opportunities: oppsByUser.get(u.id) ?? 0,
        findAllActualUsd: round(findAll),
        estSpendUsd: round(findAll + researchEst),
      };
    });
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first

    const totalFindAll = runs.reduce((s, r) => s + Number(r.actual_cost || 0), 0);
    const totalResearchEst = profiles.length * RESEARCH_TASK_PRICE + (prewarmsRes.count ?? 0) * RESEARCH_TASK_PRICE;

    return NextResponse.json({
      totals: {
        users: users.length,
        onboarded: profiles.length,
        opportunities: opps.length,
        findAllActualUsd: round(totalFindAll),
        researchEstUsd: round(totalResearchEst),
        totalEstUsd: round(totalFindAll + totalResearchEst),
      },
      users: rows,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
