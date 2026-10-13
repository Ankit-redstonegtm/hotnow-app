import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { startResearch } from "@/lib/engine";
import { beginResearch } from "@/lib/db/repo";

// Non-blocking: creates the research task and returns immediately. Client polls GET.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const { domain, description } = await req.json();
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }
    const { taskId, normalizedDomain } = await startResearch(domain, description);
    await beginResearch(sb, user.id, normalizedDomain, taskId);
    return NextResponse.json({ status: "running" });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
