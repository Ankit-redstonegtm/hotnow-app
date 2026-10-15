import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { startSellerIntelligence } from "@/lib/providers/clay";
import { normalizeDomain } from "@/lib/util/domain";
import { beginResearch, updateSellerProfile, getSellerProfileByUser } from "@/lib/db/repo";
import { log } from "@/lib/log";

// Start the Clay Seller-Intelligence workflow (research + ICP + 5 situations in one run,
// ~80-120s async). Returns immediately; the run id is stored on the profile (reusing the
// existing research_task_id/research_status infra) and the client polls the /status route.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!process.env.CLAY_API_KEY) {
      // Not configured - caller should fall back to the Parallel+Gemini path.
      return NextResponse.json({ error: "clay_not_configured" }, { status: 400 });
    }

    const { domain } = await req.json().catch(() => ({}));
    const normalized = normalizeDomain(String(domain ?? ""));
    if (!normalized) return NextResponse.json({ error: "domain is required" }, { status: 400 });

    const { runId } = await startSellerIntelligence(normalized);
    // Reuse research_task_id to persist the Clay run id; one profile row per user (idempotent).
    const profileId = await beginResearch(sb, user.id, normalized, runId);
    await updateSellerProfile(sb, profileId, { situations_status: "running" });

    log.info("intelligence.start", { provider: "clay", domain: normalized });
    return NextResponse.json({ status: "running", provider: "clay" });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    log.error("api.intelligence_start", { err: e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// Convenience: let the client discover whether the Clay path is available without a POST.
export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const available = Boolean(process.env.CLAY_API_KEY);
    const profile = await getSellerProfileByUser(sb, user.id);
    return NextResponse.json({ available, hasProfile: Boolean(profile) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
