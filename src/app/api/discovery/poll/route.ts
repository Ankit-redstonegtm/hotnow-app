// Read-only compatibility endpoint. Provider checks run in the worker process.
import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getRuns } from "@/lib/db/repo";

export const maxDuration = 300;

export async function POST() {
  try {
    const { sb, user } = await requireUser();
    const profile = await getSellerProfileByUser(sb, user.id);
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

    const running = await getRuns(sb, profile.id, ["queued", "running"]);
    return NextResponse.json({ runs: running.map(r => ({ runId: r.id, status: r.status, matched: r.matched_count })), done: running.length === 0, remaining: running.length });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
