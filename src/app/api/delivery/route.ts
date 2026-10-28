import { NextResponse } from "next/server";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { presentConnections, listConnections } from "@/lib/delivery/store";

export async function GET() {
  try {
    const { admin, profile } = await requireWorkspace();
    const rows = await listConnections(admin, profile.id);
    return NextResponse.json({
      connections: presentConnections(rows, Boolean(profile.slack_webhook_url)),
      companyName: profile.company_name,
      domain: profile.domain,
    });
  } catch (error) {
    return jsonError(error);
  }
}
