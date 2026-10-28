import type { SupabaseClient } from "@supabase/supabase-js";
import { validSlackUrl } from "@/lib/validation";
import { decryptJson, encryptJson } from "./crypto";
import type { ConnectionConfig, ConnectionRow, Provider, PublicConnection } from "./types";
import { providerReady } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;

function asRow(data: Record<string, unknown>): ConnectionRow {
  return {
    ...(data as ConnectionRow),
    config: (data.config && typeof data.config === "object" ? data.config : {}) as ConnectionConfig,
  };
}

export async function listConnections(admin: SB, profileId: string): Promise<ConnectionRow[]> {
  const { data, error } = await admin.from("delivery_connections").select("*").eq("seller_profile_id", profileId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => asRow(row));
}

export async function getConnection(admin: SB, profileId: string, provider: Provider): Promise<ConnectionRow | null> {
  const { data, error } = await admin.from("delivery_connections").select("*")
    .eq("seller_profile_id", profileId).eq("provider", provider).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asRow(data) : null;
}

export async function upsertConnection(
  admin: SB,
  profileId: string,
  provider: Provider,
  fields: Partial<Omit<ConnectionRow, "seller_profile_id" | "provider" | "config">> & { config?: ConnectionConfig },
) {
  const { error } = await admin.from("delivery_connections").upsert({
    seller_profile_id: profileId,
    provider,
    status: fields.status ?? "pending",
    enabled: fields.enabled ?? true,
    display_name: fields.display_name ?? null,
    destination_label: fields.destination_label ?? null,
    external_id: fields.external_id ?? null,
    config: fields.config ?? {},
    last_error: fields.last_error ?? null,
    connected_at: fields.connected_at ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "seller_profile_id,provider" });
  if (error) throw new Error(error.message);
}

export async function patchConnection(
  admin: SB,
  profileId: string,
  provider: Provider,
  fields: Partial<Pick<ConnectionRow, "status" | "enabled" | "display_name" | "destination_label" | "external_id" | "last_error" | "connected_at">> & { config?: ConnectionConfig },
) {
  const { error } = await admin.from("delivery_connections")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("seller_profile_id", profileId).eq("provider", provider);
  if (error) throw new Error(error.message);
}

export async function deleteConnection(admin: SB, profileId: string, provider: Provider) {
  const { error } = await admin.from("delivery_connections").delete()
    .eq("seller_profile_id", profileId).eq("provider", provider);
  if (error) throw new Error(error.message);
}

export async function saveSecret(admin: SB, profileId: string, provider: Provider, secret: unknown) {
  const { error } = await admin.from("delivery_secrets").upsert({
    seller_profile_id: profileId,
    provider,
    ciphertext: encryptJson(secret),
    updated_at: new Date().toISOString(),
  }, { onConflict: "seller_profile_id,provider" });
  if (error) throw new Error(error.message);
}

export async function readSecret<T>(admin: SB, profileId: string, provider: Provider): Promise<T | null> {
  const { data, error } = await admin.from("delivery_secrets").select("ciphertext")
    .eq("seller_profile_id", profileId).eq("provider", provider).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.ciphertext) return null;
  return decryptJson<T>(data.ciphertext);
}

export async function findPendingTelegram(admin: SB, code: string): Promise<ConnectionRow | null> {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) return null;
  const { data, error } = await admin.from("delivery_connections").select("*")
    .eq("provider", "telegram").eq("status", "pending").contains("config", { connectCode: code });
  if (error) throw new Error(error.message);
  const now = Date.now();
  const row = (data ?? []).map((item: Record<string, unknown>) => asRow(item)).find((item: ConnectionRow) => {
    const exp = item.config.expiresAt ? Date.parse(item.config.expiresAt) : 0;
    return exp > now;
  });
  return row ?? null;
}

function sheetHref(config: ConnectionConfig): string | null {
  if (!config.spreadsheetUrl) return null;
  try {
    const url = new URL(config.spreadsheetUrl);
    if (url.protocol === "https:" && url.hostname === "docs.google.com" && url.pathname.startsWith("/spreadsheets/")) {
      return url.toString();
    }
  } catch { /* ignore malformed saved urls */ }
  return null;
}

export function presentConnections(rows: ConnectionRow[], legacySlack: boolean): PublicConnection[] {
  return (["slack", "google_sheets", "teams", "telegram"] as const).map((provider) => {
    const row = rows.find((item) => item.provider === provider);
    const legacy = provider === "slack" && legacySlack;
    const pendingLink = provider === "telegram" && row?.status === "pending" && row.config.connectCode && row.config.botUsername
      && (!row.config.expiresAt || Date.parse(row.config.expiresAt) > Date.now())
      ? `https://t.me/${row.config.botUsername}?start=${row.config.connectCode}`
      : null;
    if (!row) {
      return {
        provider,
        status: legacy ? "connected" : "disconnected",
        enabled: true,
        displayName: legacy ? "Slack webhook" : null,
        destinationLabel: legacy ? "Incoming webhook" : null,
        href: null,
        connectUrl: null,
        connectedAt: null,
        lastError: null,
        ready: providerReady(provider),
        legacy,
      };
    }
    return {
      provider,
      status: row.status,
      enabled: row.enabled,
      displayName: row.display_name,
      destinationLabel: row.destination_label,
      href: provider === "google_sheets" ? sheetHref(row.config) : null,
      connectUrl: pendingLink,
      connectedAt: row.connected_at,
      lastError: row.last_error,
      ready: providerReady(provider),
      legacy,
    };
  });
}

export type DeliveryKind = "slack" | "google_sheets" | "teams" | "telegram" | "legacy_slack";

export function selectTargets(rows: ConnectionRow[], legacyWebhook: string | null): DeliveryKind[] {
  const targets: DeliveryKind[] = [];
  const slack = rows.find((row) => row.provider === "slack");
  const slackOAuth = Boolean(slack && slack.enabled && slack.status === "connected" && slack.external_id);
  if (slackOAuth) targets.push("slack");
  for (const provider of ["google_sheets", "telegram"] as const) {
    const row = rows.find((item) => item.provider === provider);
    if (row && row.enabled && row.status === "connected" && row.external_id) targets.push(provider);
  }
  const teams = rows.find((row) => row.provider === "teams");
  if (teams && teams.enabled && teams.status === "connected") targets.push("teams");
  const slackConnected = Boolean(slack && slack.status === "connected" && slack.external_id);
  if (!slackConnected && legacyWebhook && validSlackUrl(legacyWebhook)) targets.push("legacy_slack");
  return targets;
}
