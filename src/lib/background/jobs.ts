// Durable enrichment queue (contacts + emails). Adapted from PR #1 (metaabid).
// Queue state lives in hotnow.background_jobs; the worker process drives it.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  companiesNeedingContacts, contactsNeedingEmail, countCompaniesNeedingContacts, countContactsNeedingEmail,
  saveContacts, setContactEmail, getSellerProfileById,
} from "@/lib/db/repo";
import { sourceContactsForCompany, type ContactCriteria } from "@/lib/engine/contacts";
import { enrichEmail } from "@/lib/providers/blitz";
import { log } from "@/lib/log";

export type JobKind = "contacts" | "emails";
const ACTIVE = ["queued", "running", "retrying"];

// PostgREST / Postgres codes for "table or function does not exist" (migration not applied).
export const missingJobsSchema = (error: any) => ["PGRST205", "PGRST202", "42P01", "42883"].includes(error?.code);
export class JobsSetupError extends Error {
  constructor() { super("Background enrichment is not ready. Apply migration 0004_background_jobs."); }
}

/** Idempotent: returns the already-active job of this kind for the workspace, else creates one. */
export async function enqueueJob(workspaceId: string, kind: JobKind, options: Record<string, unknown> = {}) {
  const db = createAdminClient();
  const existing = await db.from("background_jobs").select("*").eq("seller_profile_id", workspaceId)
    .eq("kind", kind).in("status", ACTIVE).maybeSingle();
  if (existing.error) { if (missingJobsSchema(existing.error)) throw new JobsSetupError(); throw new Error(existing.error.message); }
  if (existing.data) return existing.data;
  const result = await db.from("background_jobs").insert({ seller_profile_id: workspaceId, kind, options }).select("*").single();
  if (result.error?.code === "23505") { // lost a race with a concurrent enqueue; return the winner
    const winner = await db.from("background_jobs").select("*").eq("seller_profile_id", workspaceId)
      .eq("kind", kind).in("status", ACTIVE).single();
    if (winner.error) throw new Error(winner.error.message);
    return winner.data;
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function retryDelay(attempt: number) {
  return Math.round(Math.min(120_000, 5000 * 2 ** Math.max(0, attempt - 1)) * (0.8 + Math.random() * 0.4));
}

/** Errors a retry cannot fix. The Blitz client formats HTTP failures as "... -> <status>: ...". */
export const isPermanentError = (message: string) => /-> (400|401|403|404|422)|not set|no longer exists/.test(message);

export async function processEnrichmentJob(job: any, workerId: string) {
  const db = createAdminClient();
  // Every write is fenced on this worker's lease, so an expired lease cannot clobber a newer owner.
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("background_jobs")
      .update({ ...patch, updated_at: new Date().toISOString(), locked_by: null, locked_until: null })
      .eq("id", job.id).eq("locked_by", workerId).eq("status", "running");
    if (error) throw new Error(error.message);
  };
  try {
    const { data: latest, error } = await db.from("background_jobs").select("cancel_requested,locked_by,status").eq("id", job.id).single();
    if (error) throw new Error(error.message);
    if (latest.locked_by !== workerId || latest.status !== "running") return;
    if (latest.cancel_requested) {
      await update({ status: "cancelled", step: "Stopped before the next batch", finished_at: new Date().toISOString() });
      return;
    }
    const profile = await getSellerProfileById(db, job.seller_profile_id);
    if (!profile) throw new Error("Company workspace no longer exists");
    // Default to the people you would actually reach (P1, P2); { all: true } covers every tier.
    const tiers = job.options?.all ? undefined : ["P1", "P2"];
    const remaining = job.kind === "contacts"
      ? await countCompaniesNeedingContacts(db, profile.id)
      : await countContactsNeedingEmail(db, profile.id, tiers);
    if (!remaining) {
      if (job.kind === "contacts" && job.options?.enrichEmails) await enqueueJob(profile.id, "emails", { all: !!job.options.all });
      await update({ status: "completed", step: "Results saved", finished_at: new Date().toISOString(), last_error: null });
      return;
    }

    let found = 0;
    if (job.kind === "contacts") {
      const [company] = await companiesNeedingContacts(db, profile.id, 1);
      if (!company) throw new Error("Could not resolve the next company");
      const criteria = (profile.contact_criteria as ContactCriteria) ?? {};
      const personas: string[] = Array.isArray(profile.buyer_personas) ? (profile.buyer_personas as string[]) : [];
      try {
        const { contacts } = await sourceContactsForCompany(company.domain, criteria, { personas });
        found = await saveContacts(db, { sellerProfileId: profile.id, companyId: company.companyId, opportunityId: company.opportunityId, contacts });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!isPermanentError(message) || /not set/.test(message)) throw err;
        // A company the provider rejects must not stall the whole queue: mark it attempted, move on.
        log.warn("contacts.source", { companyId: company.companyId, domain: company.domain, err });
        await saveContacts(db, { sellerProfileId: profile.id, companyId: company.companyId, opportunityId: company.opportunityId, contacts: [] });
      }
    } else {
      const [contact] = await contactsNeedingEmail(db, profile.id, 1, tiers);
      if (!contact) throw new Error("Could not resolve the next contact");
      try {
        const email = await enrichEmail(contact.linkedin_url);
        await setContactEmail(db, contact.id, email || ""); // "" = checked, none found
        found = email ? 1 : 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!isPermanentError(message) || /not set/.test(message)) throw err;
        log.warn("contacts.email", { contactId: contact.id, err });
        await setContactEmail(db, contact.id, "");
      }
    }
    await update({
      step: job.kind === "contacts" ? "Finding decision-makers" : "Looking up work emails",
      completed_items: job.completed_items + 1,
      total_items: Math.max(job.total_items, job.completed_items + remaining),
      result_count: job.result_count + found, last_error: null, attempts: 0,
      next_attempt_at: new Date(Date.now() + 500).toISOString(),
    });
  } catch (error) {
    const attempts = job.attempts + 1;
    const message = error instanceof Error ? error.message : "Enrichment failed";
    const failed = isPermanentError(message) || attempts >= job.max_attempts;
    log.error("background.job", { jobId: job.id, kind: job.kind, attempts, failed, err: error });
    await update({
      status: failed ? "failed" : "retrying", attempts, last_error: message,
      step: failed ? "Needs attention" : "Connection interrupted, retry scheduled",
      next_attempt_at: new Date(Date.now() + retryDelay(attempts)).toISOString(),
      ...(failed ? { finished_at: new Date().toISOString() } : {}),
    }).catch(() => { /* lease lost; the new owner decides */ });
  }
}

export async function claimEnrichmentJobs(workerId: string, slots: number) {
  if (slots < 1) return [];
  const { data, error } = await createAdminClient().rpc("claim_background_jobs", { worker_id: workerId, batch_size: slots });
  if (error) { if (missingJobsSchema(error)) return []; throw new Error(error.message); }
  return data || [];
}
