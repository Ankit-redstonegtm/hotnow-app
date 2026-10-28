import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/parallel-webhook";
import { jsonError, requireWorkspace } from "@/lib/delivery/http";
import { getConnection } from "@/lib/delivery/store";
import { pollTelegramStarts } from "@/lib/delivery/telegram";

export async function POST() {
  try {
    const { admin, profile } = await requireWorkspace();
    const row = await getConnection(admin, profile.id, "telegram");
    if (!row || row.status !== "pending") return NextResponse.json({ status: row?.status ?? "disconnected" });
    if (!(appBaseUrl() && process.env.TELEGRAM_WEBHOOK_SECRET)) await pollTelegramStarts(admin);
    const next = await getConnection(admin, profile.id, "telegram");
    return NextResponse.json({ status: next?.status ?? "disconnected" });
  } catch (error) {
    return jsonError(error);
  }
}
