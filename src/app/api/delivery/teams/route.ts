import { NextResponse } from "next/server";
import { teamsConnectInput } from "@/lib/validation";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { saveSecret, upsertConnection } from "@/lib/delivery/store";
import { teamsLabel, validTeamsWebhook } from "@/lib/delivery/teams";
import { providerReady } from "@/lib/delivery/types";

export async function POST(req: Request) {
  try {
    const { admin, profile } = await requireWorkspace();
    if (!providerReady("teams")) throw new DeliveryError("Teams delivery is not configured on this server yet.", 503);
    const body = teamsConnectInput.parse(await req.json());
    if (!validTeamsWebhook(body.webhookUrl)) {
      throw new DeliveryError("Paste an HTTPS Teams or Power Automate webhook URL.", 400);
    }
    await upsertConnection(admin, profile.id, "teams", {
      status: "connected",
      enabled: true,
      display_name: "Microsoft Teams",
      destination_label: teamsLabel(body.webhookUrl),
      external_id: null,
      config: {},
      last_error: null,
      connected_at: new Date().toISOString(),
    });
    await saveSecret(admin, profile.id, "teams", { webhookUrl: body.webhookUrl });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
