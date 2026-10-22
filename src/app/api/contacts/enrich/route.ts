import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser } from "@/lib/db/repo";
import { enqueueJob, JobsSetupError } from "@/lib/background/jobs";
export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const body = await req.json().catch(() => ({}));
    const job = await enqueueJob(profile.id, "emails", { all: body.all === true });
    return NextResponse.json({ job, queued: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue emails" }, { status: error instanceof UnauthorizedError ? 401 : error instanceof JobsSetupError ? 503 : 500 });
  }
}
