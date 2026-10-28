// Pre-signup head start. Called from the marketing site the moment someone enters
// their domain and clicks the CTA - BEFORE they finish creating an account. It
// starts the Clay seller-intelligence routine (seller + buying situations) so the
// summary is ready by the time they land in onboarding. Company discovery
// (Parallel FindAll) is never triggered here - that stays behind auth.
//
// Public + unauthenticated by necessity, so it is deliberately cheap and guarded:
//   - dedupe by domain within a window (same domain twice = no new spend)
//   - a crude global rate cap to blunt scripted abuse
// Worst case it burns a few cents of research on a junk domain; it can never run
// discovery or touch another user's data.

import { NextResponse } from "next/server";
import { startResearch } from "@/lib/engine";
import { normalizeDomain, isAggregatorDomain } from "@/lib/util/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshPrewarm, upsertPrewarm, countRecentPrewarms } from "@/lib/db/repo";

export const maxDuration = 60;

const REUSE_WINDOW_MS = 30 * 60 * 1000; // reuse a prewarm within 30 min
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20; // max new prewarms started per minute, globally

function looksLikeDomain(d: string): boolean {
  // at least one dot, valid label chars, a 2+ char TLD
  return /^(?=.{3,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(d);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const domain = normalizeDomain(String(body?.domain ?? ""));

    if (!domain || !looksLikeDomain(domain) || isAggregatorDomain(domain)) {
      // Don't warm junk / directory domains; the signup flow will handle it normally.
      return NextResponse.json({ status: "skipped" });
    }

    const admin = createAdminClient();

    // Already warming (or just warmed) this domain - reuse, no new spend.
    const existing = await getFreshPrewarm(admin, domain, REUSE_WINDOW_MS);
    if (existing) return NextResponse.json({ status: "warming", domain, reused: true });

    // Global abuse guard.
    if ((await countRecentPrewarms(admin, RATE_WINDOW_MS)) >= RATE_MAX) {
      return NextResponse.json({ status: "busy" }, { status: 429 });
    }

    const { taskId, normalizedDomain } = await startResearch(domain);
    await upsertPrewarm(admin, normalizedDomain, taskId);
    return NextResponse.json({ status: "warming", domain: normalizedDomain });
  } catch (e) {
    // Never block the signup redirect on a prewarm failure.
    return NextResponse.json({ status: "error", error: e instanceof Error ? e.message : "error" }, { status: 200 });
  }
}
