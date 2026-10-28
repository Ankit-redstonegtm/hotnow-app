import { DeliveryError } from "./errors";

type FetchLike = typeof fetch;

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "outlook.office.com" || host === "webhook.office.com" || host.endsWith(".webhook.office.com")) return "office";
  if (host.endsWith(".logic.azure.com") || host.endsWith(".powerplatform.com") || host.endsWith(".environment.api.powerplatform.com") || host.endsWith(".powerautomate.com")) return "flow";
  return null;
}

export function validTeamsWebhook(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    if (url.port && url.port !== "443") return false;
    if (!hostAllowed(url.hostname)) return false;
    if (url.pathname.length < 8) return false;
    return true;
  } catch {
    return false;
  }
}

export function teamsLabel(webhookUrl: string) {
  return `Incoming webhook (${new URL(webhookUrl).hostname})`;
}

export function teamsPayload(webhookUrl: string, title: string, text: string) {
  const kind = hostAllowed(new URL(webhookUrl).hostname);
  if (kind === "office") {
    return {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: title,
      themeColor: "F0333B",
      title,
      text,
    };
  }
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
          { type: "TextBlock", text, wrap: true },
        ],
      },
    }],
  };
}

export async function postTeams(webhookUrl: string, title: string, text: string, fetchImpl: FetchLike = fetch) {
  if (!validTeamsWebhook(webhookUrl)) throw new DeliveryError("That Teams webhook URL is not valid.", 400);
  const res = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(teamsPayload(webhookUrl, title, text)),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const gone = res.status === 404 || res.status === 410;
    throw new DeliveryError(gone ? "Teams could not find that webhook. Create a new one and connect again." : `Teams returned ${res.status}.`, 400);
  }
}
