import { NextResponse } from "next/server";
import { slackChannelInput } from "@/lib/validation";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { chooseSlackChannel, usableSlackToken } from "@/lib/delivery/slack";
import { getConnection, patchConnection, readSecret, saveSecret } from "@/lib/delivery/store";
import type { SlackSecret } from "@/lib/delivery/types";

export async function POST(req: Request) {
  try {
    const { admin, profile } = await requireWorkspace();
    const body = slackChannelInput.parse(await req.json());
    const row = await getConnection(admin, profile.id, "slack");
    const secret = await readSecret<SlackSecret>(admin, profile.id, "slack");
    if (!row || !secret) throw new DeliveryError("Connect Slack first.", 400);
    const usable = await usableSlackToken(secret);
    if (usable.refreshed) await saveSecret(admin, profile.id, "slack", usable.secret);
    const channel = await chooseSlackChannel(usable.token, body.channelId);
    await patchConnection(admin, profile.id, "slack", {
      status: "connected",
      external_id: channel.id,
      destination_label: `#${channel.name}`,
      connected_at: row.connected_at ?? new Date().toISOString(),
      last_error: null,
    });
    return NextResponse.json({ ok: true, channel: channel.name });
  } catch (error) {
    return jsonError(error);
  }
}
