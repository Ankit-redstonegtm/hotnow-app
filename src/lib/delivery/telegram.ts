import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/parallel-webhook";
import { DeliveryError, safeProviderMessage } from "./errors";
import { findPendingTelegram, patchConnection } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;
type FetchLike = typeof fetch;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newConnectCode() {
  const bytes = randomBytes(12);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function parseStartCode(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+|$)([A-Za-z0-9_-]{6,64})?$/);
  if (!match) return null;
  return match[1] ?? null;
}

export function telegramAuthorized(header: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function telegramApi(method: string, body: Record<string, unknown>, fetchImpl: FetchLike) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new DeliveryError("Telegram is not configured on this server yet.", 503);
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const auth = res.status === 401 || res.status === 403;
    throw new DeliveryError(safeProviderMessage(String(json?.description || `Telegram returned ${res.status}`), "Telegram rejected the request."), auth ? 401 : 400);
  }
  return json.result;
}

export async function telegramIdentity(fetchImpl: FetchLike = fetch) {
  const me = await telegramApi("getMe", {}, fetchImpl);
  const username = (process.env.TELEGRAM_BOT_USERNAME || me?.username || "").replace(/^@/, "");
  if (!username) throw new DeliveryError("Telegram did not return a bot username.", 400);
  return { username, id: me?.id };
}

export async function ensureTelegramWebhook(fetchImpl: FetchLike = fetch) {
  const base = appBaseUrl();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!base) return "poll" as const;
  if (!secret) throw new DeliveryError("Telegram webhook signing is not configured on this server.", 503);
  await telegramApi("setWebhook", {
    url: `${base}/api/delivery/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }, fetchImpl);
  return "webhook" as const;
}

export function chatLabel(chat: { title?: string; username?: string; first_name?: string; last_name?: string; type?: string }) {
  if (chat.title) return chat.title;
  if (chat.username) return `@${chat.username}`;
  return [chat.first_name, chat.last_name].filter(Boolean).join(" ") || "Telegram chat";
}

export async function bindTelegramCode(admin: SB, code: string, chat: { id: number | string; title?: string; username?: string; first_name?: string; last_name?: string }) {
  const row = await findPendingTelegram(admin, code);
  if (!row) return null;
  const { connectCode: _code, expiresAt: _exp, ...rest } = row.config;
  await patchConnection(admin, row.seller_profile_id, "telegram", {
    status: "connected",
    external_id: String(chat.id),
    display_name: chatLabel(chat),
    destination_label: chat.username ? `@${chat.username}` : chatLabel(chat),
    config: rest,
    connected_at: new Date().toISOString(),
    last_error: null,
    enabled: true,
  });
  return row.seller_profile_id;
}

export async function sendTelegramMessage(chatId: string, text: string, fetchImpl: FetchLike = fetch) {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, fetchImpl);
}

async function handleUpdate(admin: SB, update: { message?: { text?: string; chat?: { id: number | string; title?: string; username?: string; first_name?: string; last_name?: string } } }, fetchImpl: FetchLike) {
  const code = parseStartCode(update?.message?.text);
  const chat = update?.message?.chat;
  if (!code || !chat) return;
  const profileId = await bindTelegramCode(admin, code, chat);
  if (profileId) {
    await sendTelegramMessage(String(chat.id), "HotNow is connected to this chat. New opportunities will show up here.", fetchImpl).catch(() => undefined);
  }
}

export async function pollTelegramStarts(admin: SB, fetchImpl: FetchLike = fetch) {
  let updates = await telegramApi("getUpdates", { timeout: 0, limit: 50, allowed_updates: ["message"] }, fetchImpl);
  for (let batch = 0; batch < 3 && Array.isArray(updates) && updates.length; batch++) {
    for (const update of updates) await handleUpdate(admin, update, fetchImpl);
    const offset = Number(updates[updates.length - 1]?.update_id) + 1;
    if (!Number.isFinite(offset)) return;
    updates = await telegramApi("getUpdates", { timeout: 0, offset, limit: 50, allowed_updates: ["message"] }, fetchImpl);
  }
}
