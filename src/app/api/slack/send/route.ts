import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, getListWithItems } from "@/lib/db/repo";
import { deliverSelected } from "@/lib/delivery/dispatch";
import { listConnections, selectTargets } from "@/lib/delivery/store";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const p = await getSellerProfileByUser(sb, user.id);
    if (!p) return NextResponse.json({ error: "no profile" }, { status: 400 });
    const { listId, test } = await req.json();
    let text: string;

    if (test) {
      text = "HotNow is connected to this channel. New opportunities will land here.";
    } else if (listId) {
      const { list, items } = await getListWithItems(sb, listId);
      if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });
      const lines = items.slice(0, 25).map((it: any) => {
        if (it.opportunities) {
          const c = it.opportunities.companies;
          return `• *${c?.name || c?.normalized_domain}* · ${it.opportunities.buying_situations?.name ?? "signal"}`;
        }
        if (it.contacts) {
          const c = it.contacts.companies;
          return `• *${it.contacts.full_name}* (${it.contacts.title}) · ${c?.name || c?.normalized_domain} [${it.contacts.priority}]`;
        }
        return null;
      }).filter(Boolean);
      text = `*${list?.name ?? "List"}* · ${lines.length} from HotNow\n${lines.join("\n")}`;
    } else {
      return NextResponse.json({ error: "listId or test required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const legacy = typeof p.slack_webhook_url === "string" ? p.slack_webhook_url : null;
    const connections = await listConnections(admin, p.id).catch(() => []);
    const kinds = selectTargets(connections, legacy).filter((kind) => kind === "slack" || kind === "legacy_slack");
    if (!kinds.length) return NextResponse.json({ error: "Connect Slack in Settings first." }, { status: 400 });
    const results = await deliverSelected({
      admin, profileId: p.id, connections, kinds, summary: text, leads: [], legacyWebhook: legacy,
    });
    const failed = results.find((result) => !result.ok);
    if (failed) return NextResponse.json({ error: failed.error || "Slack delivery failed." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
