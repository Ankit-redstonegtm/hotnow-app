import { NextResponse } from "next/server";
import { sheetChoiceInput } from "@/lib/validation";
import { DeliveryError } from "@/lib/delivery/errors";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { createLeadSheet, inspectSheet, parseSpreadsheetId, usableGoogleToken } from "@/lib/delivery/sheets";
import { getConnection, patchConnection, readSecret, saveSecret } from "@/lib/delivery/store";
import type { GoogleSecret } from "@/lib/delivery/types";

export async function POST(req: Request) {
  try {
    const { admin, profile } = await requireWorkspace();
    const body = sheetChoiceInput.parse(await req.json());
    const row = await getConnection(admin, profile.id, "google_sheets");
    const secret = await readSecret<GoogleSecret>(admin, profile.id, "google_sheets");
    if (!row || !secret) throw new DeliveryError("Connect Google Sheets first.", 400);
    const usable = await usableGoogleToken(secret);
    if (usable.refreshed) await saveSecret(admin, profile.id, "google_sheets", usable.secret);
    const sheet = body.mode === "create"
      ? await createLeadSheet(usable.token, `HotNow leads — ${profile.company_name || profile.domain}`)
      : await inspectSheet(usable.token, spreadsheetId(body.spreadsheetUrl || ""));
    await patchConnection(admin, profile.id, "google_sheets", {
      status: "connected",
      display_name: "Google Sheets",
      destination_label: sheet.title,
      external_id: sheet.spreadsheetId,
      config: { ...row.config, sheetName: sheet.sheetName, spreadsheetUrl: sheet.spreadsheetUrl },
      connected_at: row.connected_at ?? new Date().toISOString(),
      last_error: null,
    });
    return NextResponse.json({ ok: true, title: sheet.title, href: sheet.spreadsheetUrl });
  } catch (error) {
    return jsonError(error);
  }
}

function spreadsheetId(value: string) {
  const id = parseSpreadsheetId(value);
  if (!id) throw new DeliveryError("Paste a Google Sheets link.", 400);
  return id;
}
