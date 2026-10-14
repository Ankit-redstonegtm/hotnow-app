import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import {
  getSellerProfileByUser,
  getOpportunityDetail,
  getContactsForCompany,
  getOutreachDrafts,
} from "@/lib/db/repo";
import { log } from "@/lib/log";

// One call that powers the opportunity detail view: the opportunity + its evidence,
// the company's prioritized contacts, the recommended contact, and any saved drafts.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { sb, user } = await requireUser();
    const { id } = await ctx.params;
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const row = await getOpportunityDetail(sb, id, profile.id);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    const company = (row as any).companies;
    const companyId = company?.id as string | undefined;
    const contacts = companyId ? await getContactsForCompany(sb, profile.id, companyId) : [];
    const draftRows = await getOutreachDrafts(sb, id, null, profile.id);

    const evidence = ((row as any).evidence ?? []).map((e: any) => {
      const cite = e.citation ?? {};
      return { url: e.source_url ?? cite.url, title: cite.title ?? null, date: e.source_date ?? cite.date ?? null };
    });

    const contactsOut = contacts.map((c: any) => ({
      id: c.id,
      fullName: c.full_name,
      title: c.title,
      priority: c.priority,
      linkedinUrl: c.linkedin_url,
      email: c.email || null,
      emailStatus: c.email_status ?? (c.email ? "found" : c.email === "" ? "none" : "unknown"),
    }));

    // Group drafts by contact into OutreachContent.
    const draftsByContactId: Record<string, any> = {};
    for (const d of draftRows) {
      const key = d.contact_id ?? "none";
      const bucket = (draftsByContactId[key] ??= {});
      if (d.channel === "email") bucket.email = { subject: d.subject ?? "", body: d.body };
      else if (d.channel === "linkedin") bucket.linkedin = { body: d.body };
      if (d.followups) bucket.followups = d.followups;
    }

    return NextResponse.json({
      opportunity: {
        id: row.id,
        companyName: company?.name ?? "Unknown company",
        companyDomain: company?.normalized_domain ?? null,
        situationName: (row as any).buying_situations?.name ?? "Buying signal",
        whatHappened: row.what_happened,
        whyItMatters: row.why_it_matters,
        confidence: row.confidence,
        evidenceDate: row.evidence_date,
        status: row.status,
        firstDiscoveredAt: row.first_discovered_at,
      },
      evidence,
      contacts: contactsOut,
      recommendedContactId: recommend(contactsOut),
      draftsByContactId,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.opportunity_detail", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

const TIER_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
const EMAIL_RANK: Record<string, number> = { verified: 0, found: 1, unknown: 2, none: 3 };

/** Best contact to lead with: highest tier, then best email status, then first. */
function recommend(contacts: Array<{ id: string; priority: string; emailStatus: string }>): string | null {
  if (!contacts.length) return null;
  const sorted = [...contacts].sort((a, b) => {
    const t = (TIER_RANK[a.priority] ?? 9) - (TIER_RANK[b.priority] ?? 9);
    if (t !== 0) return t;
    return (EMAIL_RANK[a.emailStatus] ?? 9) - (EMAIL_RANK[b.emailStatus] ?? 9);
  });
  return sorted[0].id;
}
