import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getSellerProfileByUser, updateSettings } from "@/lib/db/repo";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    const p = await getSellerProfileByUser(sb, user.id);
    if (!p) return NextResponse.json({ settings: null });
    return NextResponse.json({
      settings: {
        companyName: p.company_name,
        domain: p.domain,
        slackWebhookUrl: p.slack_webhook_url ?? "",
        contactCriteria: p.contact_criteria ?? {},
      },
    });
  } catch (e) {
    return handle(e);
  }
}

export async function PUT(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const p = await getSellerProfileByUser(sb, user.id);
    if (!p) return NextResponse.json({ error: "no profile" }, { status: 400 });
    const b = await req.json();
    const fields: Record<string, unknown> = {};
    if ("slackWebhookUrl" in b) {
      const url = (b.slackWebhookUrl || "").trim();
      // Only accept real Slack incoming-webhook URLs - prevents SSRF to arbitrary/internal hosts.
      if (url && !/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url)) {
        return NextResponse.json({ error: "Enter a valid Slack incoming webhook URL (https://hooks.slack.com/services/...)." }, { status: 400 });
      }
      fields.slack_webhook_url = url || null;
    }
    if ("contactCriteria" in b) fields.contact_criteria = b.contactCriteria ?? {};
    await updateSettings(sb, p.id, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
}
