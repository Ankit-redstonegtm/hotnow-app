import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { sourceContactsForCompany, type ContactCriteria } from "@/lib/engine/contacts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSellerProfileByUser, companiesNeedingContacts, countCompaniesNeedingContacts, saveContacts } from "@/lib/db/repo";
import { log } from "@/lib/log";

export const maxDuration = 60;

const BATCH = 5; // companies per call - keeps us well under the function limit

export async function POST() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const criteria: ContactCriteria = (profile.contact_criteria as ContactCriteria) ?? {};
    const pending = await companiesNeedingContacts(sb, profile.id, BATCH);
    if (pending.length === 0) {
      return NextResponse.json({ sourced: 0, contacts: 0, remaining: 0, done: true });
    }

    const admin = createAdminClient();
    let totalContacts = 0;
    for (const c of pending) {
      try {
        const { contacts } = await sourceContactsForCompany(c.domain, criteria);
        const n = await saveContacts(admin, {
          sellerProfileId: profile.id,
          companyId: c.companyId,
          opportunityId: c.opportunityId,
          contacts,
        });
        totalContacts += n;
      } catch (err) {
        // mark as attempted so we don't loop forever on a failing company
        log.warn("contacts.source", { companyId: c.companyId, domain: c.domain, err });
        await saveContacts(admin, { sellerProfileId: profile.id, companyId: c.companyId, opportunityId: c.opportunityId, contacts: [] });
      }
    }

    const remaining = await countCompaniesNeedingContacts(sb, profile.id);
    return NextResponse.json({ sourced: pending.length, contacts: totalContacts, remaining, done: remaining === 0 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.contacts_source", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
