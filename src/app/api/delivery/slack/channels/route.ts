import { NextResponse } from "next/server";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { DeliveryError } from "@/lib/delivery/errors";
import { listSlackChannels, usableSlackToken } from "@/lib/delivery/slack";
import { getConnection, readSecret, saveSecret } from "@/lib/delivery/store";
import type { SlackSecret } from "@/lib/delivery/types";

export async function GET() {
  try {
    const { admin, profile } = await requireWorkspace();
    const row = await getConnection(admin, profile.id, "slack");
    const secret = await readSecret<SlackSecret>(admin, profile.id, "slack");
    if (!row || !secret) throw new DeliveryError("Connect Slack first.", 400);
    const usable = await usableSlackToken(secret);
    if (usable.refreshed) await saveSecret(admin, profile.id, "slack", usable.secret);
    const channels = await listSlackChannels(usable.token);
    return NextResponse.json({ channels });
  } catch (error) {
    return jsonError(error);
  }
}
