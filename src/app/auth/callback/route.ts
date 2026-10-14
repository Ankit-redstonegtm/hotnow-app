import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSellerProfileByUser } from "@/lib/db/repo";

// OAuth (e.g. Google) redirect lands here; exchange the code for a session.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const profile = await getSellerProfileByUser(sb, user.id);
        return NextResponse.redirect(`${origin}${profile ? "/dashboard" : "/onboarding"}`);
      }
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
