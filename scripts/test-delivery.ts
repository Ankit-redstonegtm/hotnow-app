// Offline delivery checks. No network, no cloud writes, no provider credentials.
import assert from "node:assert/strict";
import { decryptJson, encryptJson } from "../src/lib/delivery/crypto";
import { deliverSelected } from "../src/lib/delivery/dispatch";
import { sheetCell, sheetRows, telegramHtml } from "../src/lib/delivery/messages";
import { parseSpreadsheetId } from "../src/lib/delivery/sheets";
import { signState, verifyState, safeReturnPath } from "../src/lib/delivery/state";
import { presentConnections, selectTargets } from "../src/lib/delivery/store";
import { teamsPayload, validTeamsWebhook } from "../src/lib/delivery/teams";
import { parseStartCode, telegramAuthorized } from "../src/lib/delivery/telegram";
import type { ConnectionRow, LeadCard } from "../src/lib/delivery/types";

process.env.DELIVERY_TOKEN_KEY = "offline-delivery-key-0123456789";
process.env.SLACK_CLIENT_ID = "slack-client";
process.env.SLACK_CLIENT_SECRET = "slack-secret";
process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram-secret";

let checks = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  checks++;
  console.log("PASS " + name);
}

const lead: LeadCard = {
  company: "=Acme", domain: "acme.example", signal: "Hiring", whatHappened: "Posted four roles",
  whyItMatters: "They are staffing", confidence: "high", evidenceDate: "2026-10-01",
  sourceUrl: "https://acme.example/jobs", discoveredAt: "2026-10-28", link: "https://app.hotnow.co/dashboard/companies",
};

function row(partial: Partial<ConnectionRow> & Pick<ConnectionRow, "provider">): ConnectionRow {
  return {
    seller_profile_id: "profile", status: "connected", enabled: true, display_name: null,
    destination_label: null, external_id: "dest", config: {}, last_error: null,
    connected_at: null, updated_at: new Date().toISOString(), ...partial,
  };
}

async function main() {
await check("credentials round-trip and reject tampering", () => {
  const ciphertext = encryptJson({ botToken: "xoxb-test", teamId: "T1" });
  assert.equal(decryptJson<{ botToken: string }>(ciphertext).botToken, "xoxb-test");
  const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith("a") ? "b" : "a");
  assert.throws(() => decryptJson(tampered));
});

await check("OAuth state is signed, expiring, and return paths stay inside the app", () => {
  assert.equal(safeReturnPath("https://evil.example"), "/dashboard/settings");
  assert.equal(safeReturnPath("//evil.example"), "/dashboard/settings");
  assert.equal(safeReturnPath("/onboarding"), "/onboarding");
  const token = signState({
    v: 1, uid: "user", profileId: "profile", provider: "slack", nonce: "nonce",
    exp: Date.now() + 60_000, returnTo: "/onboarding",
  });
  assert.equal(verifyState(token, "slack")?.returnTo, "/onboarding");
  assert.equal(verifyState(token, "google_sheets"), null);
  assert.equal(verifyState(token.slice(0, -3) + "xxx", "slack"), null);
  const expired = signState({
    v: 1, uid: "user", profileId: "profile", provider: "slack", nonce: "nonce",
    exp: Date.now() - 1, returnTo: "/onboarding",
  });
  assert.equal(verifyState(expired, "slack"), null);
});

await check("Teams webhooks stay on Microsoft hosts", () => {
  const accepted = [
    "https://outlook.office.com/webhook/abc/IncomingWebhook/def/ghi",
    "https://example.webhook.office.com/webhookb2/abc/IncomingWebhook/def",
    "https://prod-00.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?api-version=1",
    "https://org.environment.api.powerplatform.com/powerautomate/automations/direct/invoke?api-version=1",
  ];
  for (const url of accepted) assert.equal(validTeamsWebhook(url), true, url);
  for (const url of [
    "http://example.webhook.office.com/webhookb2/abc",
    "https://webhook.office.com.evil.example/webhookb2/abc",
    "https://evil.example/webhook.office.com",
    "https://user:pass@example.webhook.office.com/webhookb2/abc",
    "https://169.254.169.254/latest/meta-data",
    "https://logic.azure.com.evil.example/workflows/abc",
  ]) assert.equal(validTeamsWebhook(url), false, url);
  const office = teamsPayload(accepted[0], "HotNow", "One lead");
  assert.equal((office as { "@type": string })["@type"], "MessageCard");
  const flow = teamsPayload(accepted[2], "HotNow", "One lead") as { attachments: { contentType: string }[] };
  assert.equal(flow.attachments[0].contentType, "application/vnd.microsoft.card.adaptive");
});

await check("sheet links, formula cells, and Telegram start codes are parsed safely", () => {
  assert.equal(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/abc_123-XYZ/edit#gid=0"), "abc_123-XYZ");
  assert.equal(parseSpreadsheetId("https://evil.example/spreadsheets/d/abc"), null);
  assert.equal(sheetCell("=HYPERLINK(\"bad\")").startsWith("'"), true);
  assert.equal(sheetRows([lead])[0][0].startsWith("'"), true);
  assert.equal(parseStartCode("/start AB2CD3EF"), "AB2CD3EF");
  assert.equal(parseStartCode("/start@HotNowBot AB2CD3EF"), "AB2CD3EF");
  assert.equal(parseStartCode("/start"), null);
  assert.equal(parseStartCode("hello"), null);
  assert.equal(telegramHtml("HotNow", [lead]).includes("<b>'=Acme</b>") || telegramHtml("HotNow", [lead]).includes("<b>=Acme</b>"), true);
  assert.equal(telegramAuthorized("telegram-secret"), true);
  assert.equal(telegramAuthorized("telegram-secret-nope"), false);
  assert.equal(telegramAuthorized(null), false);
});

await check("only enabled, finished destinations are selected", () => {
  const legacy = "https://hooks.slack.com/services/T/B/X";
  const slack = row({ provider: "slack", external_id: "C12345678" });
  const sheets = row({ provider: "google_sheets", external_id: "sheet" });
  const teams = row({ provider: "teams", external_id: null });
  const telegram = row({ provider: "telegram", external_id: "42", enabled: false });
  assert.deepEqual(selectTargets([slack, sheets, teams, telegram], legacy), ["slack", "google_sheets", "teams"]);
  assert.deepEqual(selectTargets([{ ...slack, enabled: false }], legacy), []);
  assert.deepEqual(selectTargets([row({ provider: "slack", status: "pending", external_id: null })], legacy), ["legacy_slack"]);
  assert.deepEqual(selectTargets([], "http://evil.example"), []);
  assert.deepEqual(selectTargets([], legacy), ["legacy_slack"]);
  const view = presentConnections([sheets], false).find((item) => item.provider === "google_sheets");
  assert.equal(view?.status, "connected");
  assert.equal(JSON.stringify(view).includes("refresh"), false);
});

await check("a finished wave posts to every connected destination and skips a replaced Slack webhook", async () => {
  const calls: { url: string; body: string; authorization?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, body: String(init?.body ?? ""), authorization: headers.get("authorization") ?? undefined });
    if (url.includes("oauth2.googleapis.com") || url.includes("slack.com/api/oauth")) {
      return new Response(JSON.stringify({ ok: true, access_token: "fresh" }), { status: 200 });
    }
    if (url.includes("slack.com/api/")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url.includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    return new Response("1", { status: 200 });
  };
  const connections = [
    row({ provider: "slack", external_id: "C12345678", config: { teamId: "T1" } }),
    row({ provider: "google_sheets", external_id: "sheet-id", config: { sheetName: "Leads" } }),
    row({ provider: "teams" }),
    row({ provider: "telegram", external_id: "99" }),
  ];
  const secrets: Record<string, string> = {
    slack: encryptJson({ botToken: "xoxb-test", teamId: "T1" }),
    google_sheets: encryptJson({ refreshToken: "refresh", accessToken: "ya29.test", expiresAt: Date.now() + 60 * 60 * 1000 }),
    teams: encryptJson({ webhookUrl: "https://example.webhook.office.com/webhookb2/abc/IncomingWebhook/def" }),
  };
  const admin = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        update() { return query; },
        upsert() { return query; },
        maybeSingle: async () => {
          const provider = String(filters.find(([key]) => key === "provider")?.[1] ?? "");
          return { data: secrets[provider] ? { ciphertext: secrets[provider] } : null, error: null };
        },
        then(resolve: (value: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return query;
    },
  };
  const legacy = "https://hooks.slack.com/services/T/B/X";
  const results = await deliverSelected({
    admin: admin as never, profileId: "profile", connections, kinds: selectTargets(connections, legacy),
    summary: "HotNow found 1 new opportunity. https://app.hotnow.co/dashboard",
    leads: [lead], legacyWebhook: legacy, fetchImpl,
  });
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(calls.some((call) => call.url === "https://slack.com/api/chat.postMessage" && call.authorization === "Bearer xoxb-test"), true);
  assert.equal(calls.some((call) => call.url.startsWith("https://sheets.googleapis.com/") && call.body.includes("'=Acme")), true);
  assert.equal(calls.some((call) => call.url.includes("webhook.office.com") && call.body.includes("MessageCard")), true);
  assert.equal(calls.some((call) => call.url.includes("/sendMessage")), true);
  assert.equal(calls.some((call) => call.url.startsWith("https://hooks.slack.com/")), false);
});

await check("a legacy Slack webhook still receives the wave when OAuth is not connected", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response("ok", { status: 200 });
  };
  const legacy = "https://hooks.slack.com/services/T/B/X";
  const results = await deliverSelected({
    admin: { from() { return {}; } } as never,
    profileId: "profile", connections: [], kinds: ["legacy_slack"],
    summary: "HotNow finished scanning your signals. No new opportunities this run.",
    leads: [], legacyWebhook: legacy, fetchImpl,
  });
  assert.equal(results[0]?.ok, true);
  assert.deepEqual(calls, [legacy]);
});

console.log(`${checks} delivery checks passed. No network calls or paid provider requests were made.`);
}

main();
