import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sb } = await requireUser(), { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
    const { action } = await req.json();
    if (!["cancel", "retry"].includes(action)) return NextResponse.json({ error: "Unknown task action" }, { status: 400 });
    // The session/RLS read proves ownership before the privileged write.
    const { data: job, error } = await sb.from("background_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const db = createAdminClient();
    const patch = action === "cancel" ? { cancel_requested: true, ...(job.status !== "running" ? { status: "cancelled", finished_at: new Date().toISOString() } : {}) }
      : { status: "queued", cancel_requested: false, attempts: 0, last_error: null, finished_at: null, locked_by: null, locked_until: null,
        step: "Waiting for a worker", next_attempt_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await db.from("background_jobs").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id).in("status", action === "cancel" ? ["queued", "running", "retrying"] : ["failed", "cancelled"]).select("id");
    if (updateError?.code === "23505") return NextResponse.json({ error: "Another task of this kind is already active" }, { status: 409 });
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) return NextResponse.json({ error: "Task state changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ ok: true, message: action === "cancel" ? "Cancellation requested; an in-flight lookup may finish first." : "Task queued again" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Task action failed" }, { status: error instanceof UnauthorizedError ? 401 : 500 });
  }
}
