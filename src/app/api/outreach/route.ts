import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getOutreachDrafts } from "@/lib/db/repo";

// Fetch saved drafts for one opportunity (optionally one contact). No generation, no spend.
export async function GET(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ content: null });

    const url = new URL(req.url);
    const opportunityId = url.searchParams.get("opportunityId");
    const contactId = url.searchParams.get("contactId");
    if (!opportunityId) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });

    const rows = await getOutreachDrafts(sb, opportunityId, contactId);
    if (!rows.length) return NextResponse.json({ content: null });

    const content: any = {};
    let model: string | null = null;
    let updatedAt: string | null = null;
    for (const d of rows) {
      if (d.channel === "email") content.email = { subject: d.subject ?? "", body: d.body };
      else if (d.channel === "linkedin") content.linkedin = { body: d.body };
      if (d.followups) content.followups = d.followups;
      model = d.model ?? model;
      if (!updatedAt || (d.updated_at && d.updated_at > updatedAt)) updatedAt = d.updated_at;
    }
    return NextResponse.json({ content, model, updatedAt });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
