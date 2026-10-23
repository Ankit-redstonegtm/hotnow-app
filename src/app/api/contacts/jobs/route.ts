import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, countCompaniesNeedingContacts, countContactsNeedingEmail } from "@/lib/db/repo";
import { enqueueJob, JobsSetupError, missingJobsSchema } from "@/lib/background/jobs";
import { log } from "@/lib/log";

// Enrichment (decision-makers, then work emails) runs in the background worker, so it keeps
// going when the tab is closed. POST enqueues and returns at once; GET reports progress.

function fail(e: unknown, event: string) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (e instanceof JobsSetupError) return NextResponse.json({ error: e.message }, { status: 503 });
  log.error(event, { err: e });
  return NextResponse.json({ error: "Could not reach background tasks. Please retry." }, { status: 500 });
}

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ jobs: [] });
    const { data, error } = await sb.from("background_jobs").select("*")
      .eq("seller_profile_id", profile.id).order("created_at", { ascending: false }).limit(6);
    if (error) {
      if (missingJobsSchema(error)) throw new JobsSetupError();
      throw new Error(error.message);
    }
    return NextResponse.json({ jobs: data ?? [] });
  } catch (e) {
    return fail(e, "api.contacts_jobs_get");
  }
}

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    // Default: the people you would actually reach (P1, P2). { all: true } covers every tier.
    let all = false;
    try { all = !!(await req.json())?.all; } catch { /* no body */ }

    // Decision-makers first (which then queues emails itself); otherwise go straight to emails.
    const tiers = all ? undefined : ["P1", "P2"];
    const needContacts = (await countCompaniesNeedingContacts(sb, profile.id)) > 0;
    const needEmails = (await countContactsNeedingEmail(sb, profile.id, tiers)) > 0;
    if (!needContacts && !needEmails) return NextResponse.json({ job: null, done: true });

    const job = needContacts
      ? await enqueueJob(profile.id, "contacts", { enrichEmails: true, all })
      : await enqueueJob(profile.id, "emails", { all });
    return NextResponse.json({ job }, { status: 202 });
  } catch (e) {
    return fail(e, "api.contacts_jobs_post");
  }
}
