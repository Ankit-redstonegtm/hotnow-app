import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { clearNonce } from "@/lib/delivery/http";
import { exchangeSlackCode } from "@/lib/delivery/slack";
import { appRedirect, cookieOptions, redirectUri, verifyState } from "@/lib/delivery/state";
import { getConnection, saveSecret, upsertConnection } from "@/lib/delivery/store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verifyState(url.searchParams.get("state"), "slack");
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
    const exchanged = await exchangeSlackCode(url.searchParams.get("code") || "", redirectUri(req, "slack"));
    const admin = createAdminClient();
    const existing = await getConnection(admin, state.profileId, "slack");
    const sameTeam = Boolean(existing?.config?.teamId === exchanged.teamId && existing?.external_id);
    await upsertConnection(admin, state.profileId, "slack", {
      status: sameTeam ? "connected" : "pending",
      enabled: true,
      display_name: exchanged.teamName,
      destination_label: sameTeam ? existing?.destination_label ?? null : null,
      external_id: sameTeam ? existing?.external_id ?? null : null,
      config: { teamId: exchanged.teamId, teamName: exchanged.teamName },
      last_error: null,
      connected_at: sameTeam ? existing?.connected_at ?? new Date().toISOString() : null,
    });
    const { teamName: _teamName, ...secret } = exchanged;
    await saveSecret(admin, state.profileId, "slack", secret);
    const response = clearNonce(NextResponse.redirect(appRedirect(req, state.returnTo, sameTeam ? { connected: "slack" } : { slack: "pick" })));
    response.cookies.set("hotnow_workspace", state.profileId, cookieOptions());
    return response;
  } catch {
    return back("slack");
  }
}
