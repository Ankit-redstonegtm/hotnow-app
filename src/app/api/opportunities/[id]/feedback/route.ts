import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import {
  getSellerProfileByUser,
  opportunityBelongsToSeller,
  setOpportunityFeedback,
  FEEDBACK_REASONS,
} from "@/lib/db/repo";
import { log } from "@/lib/log";

// Record whether an opportunity was useful. Powers the founder's quality signal.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { sb, user } = await requireUser();
    const { id } = await ctx.params;
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const verdict = body?.verdict;
    if (verdict !== "useful" && verdict !== "not_relevant") {
      return NextResponse.json({ error: "verdict must be 'useful' or 'not_relevant'" }, { status: 400 });
    }
    const reason =
      body?.reason && (FEEDBACK_REASONS as readonly string[]).includes(String(body.reason)) ? String(body.reason) : null;

    // Only accept feedback on the caller's own opportunity.
    if (!(await opportunityBelongsToSeller(sb, id, profile.id))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await setOpportunityFeedback(sb, { opportunityId: id, sellerProfileId: profile.id, verdict, reason });
    log.info("opportunity.feedback", { opportunityId: id, verdict, reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.feedback", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
