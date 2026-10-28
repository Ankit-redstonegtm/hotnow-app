import { NextResponse } from "next/server";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { upsertConnection } from "@/lib/delivery/store";
import { ensureTelegramWebhook, newConnectCode, telegramIdentity } from "@/lib/delivery/telegram";
import { providerReady } from "@/lib/delivery/types";

export async function POST() {
  try {
    const { admin, profile } = await requireWorkspace();
    if (!providerReady("telegram")) throw new DeliveryError("Telegram is not configured on this server yet.", 503);
    const { username } = await telegramIdentity();
    const mode = await ensureTelegramWebhook();
    const code = newConnectCode();
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    await upsertConnection(admin, profile.id, "telegram", {
      status: "pending",
      enabled: true,
      display_name: `@${username}`,
      destination_label: null,
      external_id: null,
      config: { connectCode: code, expiresAt, botUsername: username },
      last_error: null,
      connected_at: null,
    });
    return NextResponse.json({ deepLink: `https://t.me/${username}?start=${code}`, mode, expiresAt });
  } catch (error) {
    return jsonError(error);
  }
}
