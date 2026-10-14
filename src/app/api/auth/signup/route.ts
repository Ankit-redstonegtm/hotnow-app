import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";

/**
 * Create a pre-confirmed user with the service role so the person can sign in
 * immediately (no email round-trip) - right for the MVP self-serve flow.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password || String(password).length < 8) {
      return NextResponse.json({ error: "Email and an 8+ character password are required." }, { status: 400 });
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return NextResponse.json({ error: "server not configured (service role key missing)" }, { status: 500 });

    const admin = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      const msg = /already/i.test(error.message) ? "An account with that email already exists. Try logging in." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
