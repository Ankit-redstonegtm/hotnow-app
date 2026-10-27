import { settingsInput, inputError } from "@/lib/validation";
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
    const b = settingsInput.parse(await req.json());
    const fields: Record<string, unknown> = {};
    if ("slackWebhookUrl" in b) fields.slack_webhook_url = b.slackWebhookUrl || null;
    if ("contactCriteria" in b) fields.contact_criteria = b.contactCriteria ?? {};
    await updateSettings(sb, p.id, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

function handle(e: unknown) {
  const invalid = inputError(e); if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
}
