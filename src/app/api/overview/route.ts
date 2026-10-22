import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import {
  getSellerProfileByUser, getOpportunities, getContacts, getLists, getSituations, getRuns,
} from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "Select or set up a company first." }, { status: 404 });
    const [opportunities, contacts, lists, situations, runs] = await Promise.all([
      getOpportunities(sb, profile.id), getContacts(sb, profile.id), getLists(sb, profile.id),
      getSituations(sb, profile.id), getRuns(sb, profile.id),
    ]);
    const active = runs.filter(r => ["queued", "running"].includes(r.status));
    const latest = runs[0];
    const state = active.length ? "searching" : opportunities.length ? "ready"
      : latest?.status === "failed" ? "failed" : runs.length ? "no_matches" : "not_started";
    return NextResponse.json({
      workspaceId: profile.id,
      summary: {
        opportunities: opportunities.length,
        newOpportunities: opportunities.filter(o => o.status === "new").length,
        companies: new Set(opportunities.map(o => o.company_id)).size,
        contacts: contacts.length,
        lists: lists.length,
        enabledSignals: situations.filter(s => s.enabled).length,
        activeRuns: active.length,
      },
      discovery: { state, lastError: latest?.status === "failed" ? latest.error : null },
      recentOpportunities: opportunities.slice(0, 8),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load overview" },
      { status: e instanceof UnauthorizedError ? 401 : 500 });
  }
}
