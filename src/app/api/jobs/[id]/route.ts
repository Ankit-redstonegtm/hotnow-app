import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

// Stop a queued/running task. Ownership is proven by the session (RLS) read before the
// privileged write. A batch already in flight may still finish first.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sb } = await requireUser();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    if (body?.action !== "cancel") return NextResponse.json({ error: "Unknown task action" }, { status: 400 });

    const { data: job, error } = await sb.from("background_jobs").select("id,status").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const now = new Date().toISOString();
    const patch = { cancel_requested: true, updated_at: now,
      ...(job.status !== "running" ? { status: "cancelled", finished_at: now } : {}) };
    const { data: updated, error: updateError } = await createAdminClient().from("background_jobs").update(patch)
      .eq("id", id).in("status", ["queued", "running", "retrying"]).select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) return NextResponse.json({ error: "Task state changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.jobs_cancel", { err: e });
    return NextResponse.json({ error: "Task action failed" }, { status: 500 });
  }
}
