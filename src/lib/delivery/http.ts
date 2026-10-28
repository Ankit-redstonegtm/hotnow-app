import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser } from "@/lib/db/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { inputError } from "@/lib/validation";
import { DeliveryError } from "./errors";
import { cookieOptions } from "./state";

export async function requireWorkspace() {
  const { sb, user } = await requireUser();
  const profile = await getSellerProfileByUser(sb, user.id);
  if (!profile) throw new DeliveryError("Add your domain before connecting a destination.", 400);
  return { sb, user, profile, admin: createAdminClient() };
}

export function jsonError(error: unknown) {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const invalid = inputError(error);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (error instanceof DeliveryError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "error";
  const missing = /delivery_connections|delivery_secrets/i.test(message);
  return NextResponse.json({
    error: missing ? "Delivery storage is not ready. Apply supabase/migrations/004_delivery_connections.sql." : message,
  }, { status: missing ? 503 : 500 });
}

export function clearNonce(response: NextResponse) {
  response.cookies.set("hotnow_oauth_nonce", "", cookieOptions(0));
  return response;
}
