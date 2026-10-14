import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { startResearch } from "@/lib/engine";
import { normalizeDomain } from "@/lib/util/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { beginResearch, getFreshPrewarm } from "@/lib/db/repo";

// Non-blocking: creates the research task and returns immediately. Client polls GET.
export const maxDuration = 60;

const PREWARM_REUSE_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const { domain, description } = await req.json();
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const normalized = normalizeDomain(domain);

    // Adopt a pre-signup head start if one exists: the research task was already
    // kicked off from the marketing CTA, so it's likely done by now. Only reuse
    // when the user added no extra description (prewarm runs domain-only).
    let taskId: string | undefined;
    let normalizedDomain = normalized;
    let reusedPrewarm = false;
    if (!description) {
      const prewarm = await getFreshPrewarm(createAdminClient(), normalized, PREWARM_REUSE_MS);
      if (prewarm) {
        taskId = prewarm.task_id;
        reusedPrewarm = true;
      }
    }

    if (!taskId) {
      const started = await startResearch(domain, description);
      taskId = started.taskId;
      normalizedDomain = started.normalizedDomain;
    }

    await beginResearch(sb, user.id, normalizedDomain, taskId);
    return NextResponse.json({ status: "running", prewarmed: reusedPrewarm });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
