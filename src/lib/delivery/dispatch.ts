import type { SupabaseClient } from "@supabase/supabase-js";
import { validSlackUrl } from "@/lib/validation";
import { appBaseUrl } from "@/lib/parallel-webhook";
import { DeliveryError } from "./errors";
import { testLead } from "./leads";
import { slackText, teamsText, telegramHtml } from "./messages";
import { appendLeadRows, usableGoogleToken } from "./sheets";
import { postSlackMessage, usableSlackToken } from "./slack";
import { listConnections, patchConnection, readSecret, saveSecret, selectTargets, type DeliveryKind } from "./store";
import { postTeams } from "./teams";
import { sendTelegramMessage } from "./telegram";
import type { ConnectionRow, GoogleSecret, LeadCard, Provider, SlackSecret, TeamsSecret } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, any, any, any, any>;
type FetchLike = typeof fetch;

async function note(admin: SB, profileId: string, provider: Provider, error: unknown) {
  try {
    if (!error) {
      await patchConnection(admin, profileId, provider, { last_error: null });
      return;
    }
    const message = (error instanceof Error ? error.message : "Delivery failed").slice(0, 300);
    const fatal = error instanceof DeliveryError && (error.status === 401 || /connect again/i.test(error.message));
    await patchConnection(admin, profileId, provider, fatal ? { last_error: message, status: "error" } : { last_error: message });
  } catch { /* a failed status write should not block the other destinations */ }
}

async function postLegacy(webhookUrl: string, text: string, fetchImpl: FetchLike) {
  if (!validSlackUrl(webhookUrl)) throw new DeliveryError("Slack webhook is missing.", 400);
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new DeliveryError(`Slack returned ${res.status}.`, 400);
}

export type SendResult = { kind: DeliveryKind; ok: boolean; error?: string };

export async function deliverSelected(args: {
  admin: SB;
  profileId: string;
  connections: ConnectionRow[];
  kinds: DeliveryKind[];
  summary: string;
  leads: LeadCard[];
  legacyWebhook: string | null;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = args.fetchImpl ?? fetch;
  const results: SendResult[] = [];
  const slackBody = slackText(args.summary.replace(/^HotNow/, "*HotNow*"), args.leads);
  for (const kind of args.kinds) {
    if (kind === "legacy_slack") {
      try {
        if (!args.legacyWebhook) throw new DeliveryError("Slack webhook is missing.", 400);
        await postLegacy(args.legacyWebhook, slackBody, fetchImpl);
        results.push({ kind, ok: true });
      } catch (error) {
        results.push({ kind, ok: false, error: error instanceof Error ? error.message : "Delivery failed" });
      }
      continue;
    }
    const row = args.connections.find((item) => item.provider === kind);
    if (!row) continue;
    try {
      if (kind === "slack") {
        const stored = await readSecret<SlackSecret>(args.admin, args.profileId, "slack");
        if (!stored || !row.external_id) throw new DeliveryError("Slack is missing a channel.", 400);
        const usable = await usableSlackToken(stored, fetchImpl);
        if (usable.refreshed) await saveSecret(args.admin, args.profileId, "slack", usable.secret);
        await postSlackMessage(usable.token, row.external_id, slackBody, fetchImpl);
      } else if (kind === "google_sheets") {
        if (!args.leads.length) {
          await note(args.admin, args.profileId, kind, null);
          results.push({ kind, ok: true });
          continue;
        }
        const stored = await readSecret<GoogleSecret>(args.admin, args.profileId, "google_sheets");
        if (!stored || !row.external_id) throw new DeliveryError("Google Sheets is missing a spreadsheet.", 400);
        const usable = await usableGoogleToken(stored, fetchImpl);
        if (usable.refreshed) await saveSecret(args.admin, args.profileId, "google_sheets", usable.secret);
        await appendLeadRows(usable.token, row.external_id, row.config.sheetName || "Leads", args.leads, fetchImpl);
      } else if (kind === "teams") {
        const stored = await readSecret<TeamsSecret>(args.admin, args.profileId, "teams");
        if (!stored?.webhookUrl) throw new DeliveryError("Teams is missing a webhook.", 400);
        await postTeams(stored.webhookUrl, "HotNow", teamsText(args.summary, args.leads), fetchImpl);
      } else if (kind === "telegram") {
        if (!row.external_id) throw new DeliveryError("Telegram is missing a chat.", 400);
        await sendTelegramMessage(row.external_id, telegramHtml(args.summary, args.leads), fetchImpl);
      }
      await note(args.admin, args.profileId, kind, null);
      results.push({ kind, ok: true });
    } catch (error) {
      await note(args.admin, args.profileId, kind, error);
      results.push({ kind, ok: false, error: error instanceof Error ? error.message : "Delivery failed" });
    }
  }
  return results;
}

export async function deliverProfile(args: {
  admin: SB;
  profileId: string;
  legacyWebhook: string | null;
  summary: string;
  leads: LeadCard[];
  fetchImpl?: FetchLike;
}) {
  const connections = await listConnections(args.admin, args.profileId).catch(() => [] as ConnectionRow[]);
  const kinds = selectTargets(connections, args.legacyWebhook);
  if (!kinds.length) return [];
  return deliverSelected({ ...args, connections, kinds });
}

export async function sendProviderTest(
  admin: SB,
  profile: { id: string; domain: string; company_name?: string | null; slack_webhook_url?: string | null },
  provider: Provider,
  fetchImpl?: FetchLike,
) {
  const legacy = profile.slack_webhook_url ?? null;
  const connections = await listConnections(admin, profile.id);
  const available = selectTargets(connections, legacy);
  const summary = `HotNow is connected for ${profile.company_name || profile.domain}. New opportunities will show up here.`;
  const base = appBaseUrl() ?? "https://app.hotnow.co";
  if (provider === "slack") {
    const kinds = available.filter((kind) => kind === "slack" || kind === "legacy_slack");
    if (!kinds.length) throw new DeliveryError("Connect Slack and choose a channel first.", 400);
    const results = await deliverSelected({ admin, profileId: profile.id, connections, kinds, summary, leads: [], legacyWebhook: legacy, fetchImpl });
    const failed = results.find((result) => !result.ok);
    if (failed) throw new DeliveryError(failed.error || "Test delivery failed.", 400);
    return;
  }
  if (!available.includes(provider)) {
    throw new DeliveryError(provider === "google_sheets"
      ? "Connect Google Sheets and choose a spreadsheet first."
      : provider === "teams"
        ? "Paste a Teams webhook URL first."
        : "Open Telegram and press Start first.", 400);
  }
  const leads = provider === "google_sheets" ? [testLead(profile.domain, base)] : [];
  const results = await deliverSelected({ admin, profileId: profile.id, connections, kinds: [provider], summary, leads, legacyWebhook: legacy, fetchImpl });
  const failed = results.find((result) => !result.ok);
  if (failed) throw new DeliveryError(failed.error || "Test delivery failed.", 400);
}
