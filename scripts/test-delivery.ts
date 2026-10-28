// Offline delivery checks. No network, no cloud writes, no provider credentials.
import assert from "node:assert/strict";
import { csvText, opportunityCsvRows } from "../src/lib/csv";
import { decryptJson, encryptJson } from "../src/lib/delivery/crypto";
import { deliverSelected } from "../src/lib/delivery/dispatch";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DeliveryConnections, { slackDetail } from "../src/components/DeliveryConnections";
import { appRedirect, oauthReturnTarget, signState, verifyState, safeReturnPath } from "../src/lib/delivery/state";
import { presentConnections, selectTargets } from "../src/lib/delivery/store";
import type { ConnectionRow, LeadCard } from "../src/lib/delivery/types";

process.env.DELIVERY_TOKEN_KEY = "offline-delivery-key-0123456789";
process.env.SLACK_CLIENT_ID = "slack-client";
process.env.SLACK_CLIENT_SECRET = "slack-secret";

let checks = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  checks++;
  console.log("PASS " + name);
}

const lead: LeadCard = {
  company: "Acme", domain: "acme.example", signal: "Hiring", whatHappened: "Posted four roles",
  whyItMatters: "They are staffing", confidence: "high", evidenceDate: "2026-10-01",
  sourceUrl: "https://acme.example/jobs", discoveredAt: "2026-10-28", link: "https://app.hotnow.co/dashboard/companies",
};

function row(partial: Partial<ConnectionRow> & Pick<ConnectionRow, "provider">): ConnectionRow {
  return {
    seller_profile_id: "profile", status: "connected", enabled: true, display_name: null,
    destination_label: null, external_id: "C12345678", config: {}, last_error: null,
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
  assert.equal(safeReturnPath("/onboarding"), "/onboarding");
  assert.equal(safeReturnPath("/onboarding?resume=1"), "/onboarding?resume=1");
  assert.equal(safeReturnPath("/onboarding?resume=1&next=https://evil.example"), "/dashboard/settings");
  assert.equal(safeReturnPath("//evil.example"), "/dashboard/settings");
  const req = new Request("http://localhost:3000/api/delivery/slack/callback");
  const resume = appRedirect(req, "/onboarding?resume=1", { slack: "pick" });
  assert.equal(resume.pathname, "/onboarding");
  assert.equal(resume.searchParams.get("deliver"), null);
  assert.equal(resume.searchParams.get("slack"), "pick");
  assert.equal(oauthReturnTarget("/onboarding").deliver, true);
  const deliver = appRedirect(req, "/onboarding", { connected: "slack" });
  assert.equal(deliver.pathname, "/onboarding");
  assert.equal(deliver.searchParams.get("deliver"), "1");
  assert.equal(deliver.searchParams.get("connected"), "slack");
  const resumeState = signState({
    v: 1, uid: "user", profileId: "profile", provider: "slack", nonce: "nonce",
    exp: Date.now() + 60_000, returnTo: "/onboarding?resume=1",
  });
  assert.equal(verifyState(resumeState, "slack")?.returnTo, "/onboarding?resume=1");
  const token = signState({
    v: 1, uid: "user", profileId: "profile", provider: "slack", nonce: "nonce",
    exp: Date.now() + 60_000, returnTo: "/onboarding",
  });
  assert.equal(verifyState(token, "slack")?.returnTo, "/onboarding");
  assert.equal(verifyState(token.slice(0, -3) + "xxx", "slack"), null);
  const expired = signState({
    v: 1, uid: "user", profileId: "profile", provider: "slack", nonce: "nonce",
    exp: Date.now() - 1, returnTo: "/onboarding",
  });
  assert.equal(verifyState(expired, "slack"), null);
});

await check("research wait offers Slack without a connect button until the workspace exists", () => {
  const encourage = "While we study your company, connect Slack so new opportunities arrive in a channel.";
  assert.equal(slackDetail(encourage, "connected", true, false), "Slack is ready. New opportunities will arrive in your channel.");
  assert.equal(slackDetail(encourage, "pending", false, false), "Pick the channel that should receive new opportunities.");
  assert.equal(slackDetail(encourage, "disconnected", false, true), "Slack is not available on this server yet.");
  assert.equal(slackDetail(undefined, "disconnected", false, true).includes("Install HotNow"), true);
  const html = renderToStaticMarkup(createElement(DeliveryConnections, {
    variant: "onboarding",
    returnTo: "/onboarding?resume=1",
    description: encourage,
    footnote: "You can skip this and connect later.",
    defer: true,
  }));
  assert.equal(html.includes(encourage), true);
  assert.equal(html.includes("You can skip this and connect later."), true);
  assert.equal(html.includes("Connect Slack"), false);
  assert.equal(html.includes("not available"), false);
});

await check("only an enabled Slack channel is selected, and a paused connection does not fall back to a webhook", () => {
  const legacy = "https://hooks.slack.com/services/T/B/X";
  const slack = row({ provider: "slack" });
  assert.deepEqual(selectTargets([slack], legacy), ["slack"]);
  assert.deepEqual(selectTargets([{ ...slack, enabled: false }], legacy), []);
  assert.deepEqual(selectTargets([row({ provider: "slack", status: "pending", external_id: null })], legacy), ["legacy_slack"]);
  assert.deepEqual(selectTargets([], "http://evil.example"), []);
  assert.deepEqual(selectTargets([], legacy), ["legacy_slack"]);
  const view = presentConnections([slack], false)[0];
  assert.equal(view?.status, "connected");
  assert.equal(JSON.stringify(view).includes("xoxb"), false);
});

await check("a finished wave posts to Slack and skips a replaced webhook", async () => {
  const calls: { url: string; authorization?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get("authorization") ?? undefined });
    if (String(input).includes("slack.com/api/")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("ok", { status: 200 });
  };
  const connections = [row({ provider: "slack", config: { teamId: "T1" } })];
  const secrets: Record<string, string> = { slack: encryptJson({ botToken: "xoxb-test", teamId: "T1" }) };
  const admin = {
    from() {
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

await check("opportunity CSV keeps lead columns and spreadsheet-safe values", () => {
  const rows = opportunityCsvRows([{
    companies: { name: "=Acme", normalized_domain: "acme.example" },
    buying_situations: { name: "Hiring" },
    what_happened: "Posted roles", why_it_matters: "Staffing", confidence: "high",
    evidence_date: "2026-10-01", evidence: [{ source_url: "https://acme.example/jobs" }],
  }]);
  assert.equal(rows[0]?.company, "=Acme");
  assert.equal(rows[0]?.domain, "acme.example");
  assert.equal(rows[0]?.signal, "Hiring");
  assert.ok(csvText(rows).includes("'=Acme"));
});

console.log(`${checks} delivery checks passed. No network calls or paid provider requests were made.`);
}

main();
