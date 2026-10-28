import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { clearNonce } from "@/lib/delivery/http";
import { exchangeGoogleCode } from "@/lib/delivery/sheets";
import { appRedirect, cookieOptions, redirectUri, verifyState } from "@/lib/delivery/state";
import { getConnection, saveSecret, upsertConnection } from "@/lib/delivery/store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verifyState(url.searchParams.get("state"), "google_sheets");
  const back = (code: string) => clearNonce(NextResponse.redirect(appRedirect(req, state?.returnTo || "/dashboard/settings", { deliveryError: code })));
  if (url.searchParams.get("error")) return back("cancelled");
  if (!state) return back("state");
  const nonce = (await cookies()).get("hotnow_oauth_nonce")?.value;
  if (!nonce || nonce !== state.nonce) return back("state");
  try {
    const { sb, user } = await requireUser();
    if (user.id !== state.uid) return back("state");
    const owned = await sb.from("seller_profiles").select("id").eq("id", state.profileId).eq("user_id", user.id).maybeSingle();
    if (owned.error || !owned.data) return back("state");
    const secret = await exchangeGoogleCode(url.searchParams.get("code") || "", redirectUri(req, "google_sheets"));
    const admin = createAdminClient();
    const existing = await getConnection(admin, state.profileId, "google_sheets");
    const keep = Boolean(existing?.external_id);
    await upsertConnection(admin, state.profileId, "google_sheets", {
      status: keep ? "connected" : "pending",
      enabled: true,
      display_name: "Google Sheets",
      destination_label: keep ? existing?.destination_label ?? null : null,
      external_id: keep ? existing?.external_id ?? null : null,
      config: keep ? existing?.config ?? {} : {},
      last_error: null,
      connected_at: keep ? existing?.connected_at ?? new Date().toISOString() : null,
    });
    await saveSecret(admin, state.profileId, "google_sheets", secret);
    const response = clearNonce(NextResponse.redirect(appRedirect(req, state.returnTo, keep ? { connected: "google" } : { google: "pick" })));
    response.cookies.set("hotnow_workspace", state.profileId, cookieOptions());
    return response;
  } catch {
    return back("google");
  }
}
