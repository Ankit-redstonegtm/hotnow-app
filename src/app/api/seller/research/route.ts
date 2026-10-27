import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { normalizeDomain } from "@/lib/util/domain";
import { DB_SCHEMA } from "@/lib/supabase/schema";

// Persist intent and return. Only the background worker calls the provider.
export const maxDuration = 60;


export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const { domain, description } = await req.json();
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const normalized = normalizeDomain(domain);
    if (!/^(?=.{3,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(normalized)) {
      return NextResponse.json({ error: "Enter a valid company website domain" }, { status: 400 });
    }
    const { data: existing, error: lookupError } = await sb.from("seller_profiles")
      .select("id, research_status").eq("user_id", user.id).eq("domain", normalized).maybeSingle();
    if (lookupError?.code === "PGRST106") {
      return NextResponse.json({
        code: "SUPABASE_SCHEMA_UNAVAILABLE",
        error: `Supabase cannot access the '${DB_SCHEMA}' schema. Run the database setup SQL if needed, then add '${DB_SCHEMA}' to Data API Settings → Exposed schemas in your Supabase project.`,
      }, { status: 503 });
    }
    if (lookupError?.code === "PGRST205" || lookupError?.code === "42P01") {
      return NextResponse.json({
        code: "SUPABASE_TABLES_MISSING",
        error: "The HotNow database tables are missing. Run supabase/migrations/001_hotnow.sql in your new Supabase project's SQL Editor before starting research.",
      }, { status: 503 });
    }
    if (lookupError) throw new Error(lookupError.message);
    if (existing && ["queued", "starting", "running", "ready", "done"].includes(existing.research_status)) {
      (await cookies()).set("hotnow_workspace", existing.id, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      });
      return NextResponse.json({ status: existing.research_status === "done" ? "done" : "running", profileId: existing.id, existing: true });
    }

    if (!process.env.PARALLEL_API_KEY?.trim()) {
      return NextResponse.json({
        code: "PARALLEL_API_KEY_MISSING",
        error: "Company research requires Parallel AI. Add PARALLEL_API_KEY to .env.local, then recreate the Docker container to load it. Supabase credentials only provide login and database access.",
      }, { status: 503 });
    }

    const payload = { user_id: user.id, domain: normalized, research_task_id: null, research_status: "queued",
      raw_research: { _background: { description: typeof description === "string" ? description : "" } }, updated_at: new Date().toISOString() };
    let profileId = existing?.id;
    if (existing) {
      const { error } = await sb.from("seller_profiles").update(payload).eq("id", existing.id)
        .not("research_status", "in", "(queued,starting,running,ready,done)");
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await sb.from("seller_profiles").upsert(payload, { onConflict: "user_id,domain", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      profileId = data?.id;
      if (!profileId) {
        const { data: concurrent, error: concurrentError } = await sb.from("seller_profiles").select("id").eq("user_id", user.id).eq("domain", normalized).single();
        if (concurrentError) throw new Error(concurrentError.message);
        profileId = concurrent.id;
      }
    }
    (await cookies()).set("hotnow_workspace", profileId, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
    return NextResponse.json({ status: "running", profileId, queued: true }, { status: 202 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
