import { NextResponse } from "next/server";
import { bindTelegramCode, parseStartCode, sendTelegramMessage, telegramAuthorized } from "@/lib/delivery/telegram";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!telegramAuthorized(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  try {
    const code = parseStartCode(update?.message?.text);
    if (code && update?.message?.chat?.id != null) {
      const admin = createAdminClient();
      const profileId = await bindTelegramCode(admin, code, update.message.chat);
      if (profileId) {
        await sendTelegramMessage(String(update.message.chat.id), "HotNow is connected to this chat. New opportunities will show up here.");
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
