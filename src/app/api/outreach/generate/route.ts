import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { generateOutreach } from "@/lib/engine/outreach";
import { activeProvider } from "@/lib/llm";
import {
  getSellerProfileByUser,
  getOpportunityDetail,
  getContactsForCompany,
  saveOutreachDrafts,
} from "@/lib/db/repo";
import { log } from "@/lib/log";

export const maxDuration = 60;

// Generate (or regenerate) personalized email + LinkedIn drafts for one opportunity+contact,
// grounded only in that opportunity's stored evidence. User-initiated; one paid LLM call.
export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const opportunityId = String(body?.opportunityId ?? "");
    const contactId = body?.contactId ? String(body.contactId) : null;
    const withSequence = Boolean(body?.withSequence);
    if (!opportunityId) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });

    const row = await getOpportunityDetail(sb, opportunityId, profile.id);
    if (!row) return NextResponse.json({ error: "opportunity not found" }, { status: 404 });

    const company = (row as any).companies;
    const contacts = company?.id ? await getContactsForCompany(sb, profile.id, company.id) : [];
    const contact = contactId ? contacts.find((c: any) => c.id === contactId) : contacts[0];
    if (!contact) return NextResponse.json({ error: "no contact to write to" }, { status: 400 });

    const evidence = ((row as any).evidence ?? []).map((e: any) => {
      const cite = e.citation ?? {};
      return { url: e.source_url ?? cite.url ?? "", title: cite.title ?? undefined, date: e.source_date ?? cite.date ?? undefined };
    });

    const content = await generateOutreach({
      seller: {
        companyName: profile.company_name ?? profile.domain ?? "our company",
        productDescription: profile.product_description ?? "",
      },
      opportunity: {
        companyName: company?.name ?? "the company",
        situationName: (row as any).buying_situations?.name ?? "a buying signal",
        whatHappened: row.what_happened ?? "",
        whyItMatters: row.why_it_matters ?? "",
        evidence,
      },
      contact: {
        fullName: contact.full_name ?? "there",
        title: contact.title ?? "",
        priority: contact.priority ?? "P2",
      },
      withSequence,
    });

    const model = activeProvider();
    await saveOutreachDrafts(sb, {
      sellerProfileId: profile.id,
      opportunityId,
      contactId: contact.id,
      model,
      email: content.email,
      linkedin: content.linkedin,
      followups: content.followups,
    });

    log.info("outreach.generate", { opportunityId, contactId: contact.id, model, hasEmail: !!content.email, hasLinkedin: !!content.linkedin });
    return NextResponse.json({ content, model, contactId: contact.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.outreach_generate", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
