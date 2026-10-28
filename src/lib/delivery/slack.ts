import { DeliveryError, safeProviderMessage } from "./errors";
import type { SlackSecret } from "./types";

export const SLACK_SCOPES = "chat:write,chat:write.public,channels:read,groups:read,channels:join";

type FetchLike = typeof fetch;

async function slackForm(body: URLSearchParams, fetchImpl: FetchLike) {
  const res = await fetchImpl("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new DeliveryError(safeProviderMessage(json?.error || `Slack returned ${res.status}`, "Slack could not finish connecting."), 400);
  }
  return json;
}

async function slackApi(token: string, method: string, body: Record<string, unknown>, fetchImpl: FetchLike) {
  const res = await fetchImpl(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const code = String(json?.error || `http_${res.status}`);
    const auth = ["invalid_auth", "token_revoked", "account_inactive", "not_authed", "token_expired"].includes(code);
    throw new DeliveryError(safeProviderMessage(code, "Slack rejected the message."), auth ? 401 : 400);
  }
  return json;
}

export function slackAuthorizeUrl(reqUrl: string, state: string) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new DeliveryError("Slack is not configured on this server yet.", 503);
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SLACK_SCOPES);
  url.searchParams.set("redirect_uri", reqUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSlackCode(code: string, redirectUri: string, fetchImpl: FetchLike = fetch): Promise<SlackSecret & { teamName: string }> {
  const json = await slackForm(new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    client_secret: process.env.SLACK_CLIENT_SECRET || "",
    code,
    redirect_uri: redirectUri,
  }), fetchImpl);
  const teamId = json.team?.id;
  if (!json.access_token || !teamId) throw new DeliveryError("Slack did not return a bot token.", 400);
  return {
    botToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresAt: Number.isFinite(json.expires_in) ? Date.now() + Number(json.expires_in) * 1000 : undefined,
    teamId,
    teamName: json.team?.name || "Slack",
  };
}

export async function usableSlackToken(secret: SlackSecret, fetchImpl: FetchLike = fetch): Promise<{ token: string; secret: SlackSecret; refreshed: boolean }> {
  const expiring = secret.expiresAt && secret.refreshToken && secret.expiresAt < Date.now() + 60_000;
  if (!expiring) return { token: secret.botToken, secret, refreshed: false };
  const json = await slackForm(new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    client_secret: process.env.SLACK_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token: secret.refreshToken || "",
  }), fetchImpl);
  const next: SlackSecret = {
    ...secret,
    botToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : secret.refreshToken,
    expiresAt: Number.isFinite(json.expires_in) ? Date.now() + Number(json.expires_in) * 1000 : undefined,
  };
  return { token: next.botToken, secret: next, refreshed: true };
}

export type SlackChannel = { id: string; name: string; isPrivate: boolean };

export async function listSlackChannels(token: string, fetchImpl: FetchLike = fetch): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = "";
  for (let page = 0; page < 3; page++) {
    const json = await slackApi(token, "conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    }, fetchImpl);
    for (const channel of json.channels ?? []) {
      if (channel?.id && channel?.name) channels.push({ id: channel.id, name: channel.name, isPrivate: Boolean(channel.is_private) });
    }
    cursor = json.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return channels.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400);
}

export async function chooseSlackChannel(token: string, channelId: string, fetchImpl: FetchLike = fetch): Promise<{ id: string; name: string }> {
  const info = await slackApi(token, "conversations.info", { channel: channelId }, fetchImpl);
  const channel = info.channel;
  if (!channel?.id || !channel?.name) throw new DeliveryError("That Slack channel is not available.", 400);
  if (channel.is_private && !channel.is_member) {
    throw new DeliveryError("Invite the HotNow app to that private channel, then choose it again.", 400);
  }
  if (!channel.is_private) {
    try {
      await slackApi(token, "conversations.join", { channel: channelId }, fetchImpl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/already_in_channel|method_not_supported_for_channel_type|is_archived/.test(message)) throw error;
    }
  }
  return { id: channel.id, name: channel.name };
}

export async function postSlackMessage(token: string, channel: string, text: string, fetchImpl: FetchLike = fetch) {
  await slackApi(token, "chat.postMessage", { channel, text, unfurl_links: false, unfurl_media: false }, fetchImpl);
}
