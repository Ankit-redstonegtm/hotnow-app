import { createAdminClient } from "@/lib/supabase/admin";
import { companiesNeedingContacts, contactsNeedingEmail, countCompaniesNeedingContacts, countContactsNeedingEmail,
  saveContacts, setContactEmail, getSellerProfileById } from "@/lib/db/repo";
import { sourceContactsForCompany } from "@/lib/engine/contacts";
import { enrichEmail } from "@/lib/providers/blitz";

export const missingJobsSchema = (error: any) => ["PGRST205", "PGRST202", "42P01", "42883"].includes(error?.code);
export class JobsSetupError extends Error { constructor() { super("Background enrichment is not ready. Finish the database upgrade in workspace setup."); } }
export async function enqueueJob(workspaceId: string, kind: "contacts" | "emails", options: Record<string, unknown> = {}) {
  const db = createAdminClient();
  const existing = await db.from("background_jobs").select("*").eq("seller_profile_id", workspaceId)
    .eq("kind", kind).in("status", ["queued", "running", "retrying"]).maybeSingle();
  if (existing.error) { if (missingJobsSchema(existing.error)) throw new JobsSetupError(); throw new Error(existing.error.message); }
  if (existing.data) return existing.data;
  const result = await db.from("background_jobs").insert({ seller_profile_id: workspaceId, kind, options }).select("*").single();
  if (result.error?.code === "23505") {
    const winner = await db.from("background_jobs").select("*").eq("seller_profile_id", workspaceId)
      .eq("kind", kind).in("status", ["queued", "running", "retrying"]).single();
    if (winner.error) throw new Error(winner.error.message);
    return winner.data;
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function retryDelay(attempt: number) { return Math.round(Math.min(120_000, 5000 * 2 ** Math.max(0, attempt - 1)) * (0.8 + Math.random() * 0.4)); }
export async function processEnrichmentJob(job: any, workerId: string) {
  const db = createAdminClient();
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("background_jobs").update({ ...patch, updated_at: new Date().toISOString(), locked_by: null, locked_until: null })
      .eq("id", job.id).eq("locked_by", workerId).eq("status", "running");
    if (error) throw new Error(error.message);
  };
  try {
    const { data: latest, error } = await db.from("background_jobs").select("cancel_requested,locked_by,status").eq("id", job.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!latest || latest.locked_by !== workerId || latest.status !== "running") return;
    if (latest.cancel_requested) { await update({ status: "cancelled", step: "Stopped before the next batch", finished_at: new Date().toISOString() }); return; }
    const profile = await getSellerProfileById(db, job.seller_profile_id);
    if (!profile) {
      await update({ status: "cancelled", cancel_requested: true, step: "Stopped because the company was removed", finished_at: new Date().toISOString() });
      return;
    }
    const tiers = job.options?.all ? undefined : ["P1", "P2"];
    const remaining = job.kind === "contacts" ? await countCompaniesNeedingContacts(db, profile.id) : await countContactsNeedingEmail(db, profile.id, tiers);
    if (!remaining) {
      if (job.kind === "contacts" && job.options?.enrichEmails) await enqueueJob(profile.id, "emails", { all: !!job.options.all });
      await update({ status: "completed", step: "Results saved", finished_at: new Date().toISOString(), last_error: null });
      return;
    }
    let found = 0;
    if (job.kind === "contacts") {
      const [company] = await companiesNeedingContacts(db, profile.id, 1);
      if (!company) throw new Error("Could not resolve the next company");
      const { contacts } = await sourceContactsForCompany(company.domain, profile.contact_criteria || {});
      found = await saveContacts(db, { sellerProfileId: profile.id, companyId: company.companyId, opportunityId: company.opportunityId, contacts });
    } else {
      const [contact] = await contactsNeedingEmail(db, profile.id, 1, tiers);
      if (!contact) throw new Error("Could not resolve the next contact");
      const email = await enrichEmail(contact.linkedin_url);
      await setContactEmail(db, contact.id, email || "");
      found = email ? 1 : 0;
    }
    await update({ step: job.kind === "contacts" ? "Finding decision-makers" : "Looking up work emails",
      completed_items: job.completed_items + 1, total_items: Math.max(job.total_items, job.completed_items + remaining),
      result_count: job.result_count + found, last_error: null, attempts: 0,
      next_attempt_at: new Date(Date.now() + 500).toISOString() });
  } catch (error) {
    let removed = false;
    try { removed = !(await getSellerProfileById(db, job.seller_profile_id)); } catch { removed = false; }
    if (removed) {
      await update({ status: "cancelled", cancel_requested: true, step: "Stopped because the company was removed", finished_at: new Date().toISOString() });
      return;
    }
    const attempts = job.attempts + 1;
    const message = error instanceof Error ? error.message : "Enrichment failed";
    const permanent = /-> (400|401|403|404|422)|not set|no longer exists/.test(message);
    const failed = permanent || attempts >= job.max_attempts;
    await update({ status: failed ? "failed" : "retrying", attempts,
      last_error: message, step: failed ? "Needs attention" : "Connection interrupted — retry scheduled",
      next_attempt_at: new Date(Date.now() + retryDelay(attempts)).toISOString(),
      ...(failed ? { finished_at: new Date().toISOString() } : {}) });
  }
}

export async function claimEnrichmentJobs(workerId: string, slots: number) {
  if (slots < 1) return [];
  const { data, error } = await createAdminClient().rpc("claim_background_jobs", { worker_id: workerId, batch_size: slots });
  if (error) { if (missingJobsSchema(error)) return []; throw new Error(error.message); }
  return data || [];
}
