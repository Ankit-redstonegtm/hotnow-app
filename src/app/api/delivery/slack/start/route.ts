import { NextResponse } from "next/server";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { slackAuthorizeUrl } from "@/lib/delivery/slack";
import { cookieOptions, newNonce, redirectUri, safeReturnPath, signState } from "@/lib/delivery/state";
import { providerReady } from "@/lib/delivery/types";

export async function POST(req: Request) {
  try {
    const { user, profile } = await requireWorkspace();
    if (!providerReady("slack")) throw new DeliveryError("Slack is not configured on this server yet.", 503);
    const body = await req.json().catch(() => ({}));
    const returnTo = safeReturnPath(body?.returnTo);
    const nonce = newNonce();
    const state = signState({
      v: 1, uid: user.id, profileId: profile.id, provider: "slack",
      exp: Date.now() + 10 * 60 * 1000, nonce, returnTo,
    });
    const response = NextResponse.json({ url: slackAuthorizeUrl(redirectUri(req), state) });
    response.cookies.set("hotnow_oauth_nonce", nonce, cookieOptions(600));
    response.cookies.set("hotnow_workspace", profile.id, cookieOptions());
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
