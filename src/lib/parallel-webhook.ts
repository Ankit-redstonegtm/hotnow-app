import { createHmac, timingSafeEqual } from "node:crypto";

export function appBaseUrl(): string | undefined {
  const value = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) return;
    return url.origin;
  } catch { return; }
}

export function discoveryWebhookUrl(): string | undefined {
  const base = appBaseUrl();
  return base && process.env.PARALLEL_WEBHOOK_SECRET ? `${base}/api/discovery/webhook` : undefined;
}

export function verifyParallelWebhook(headers: Headers, body: string, secret: string, now = Date.now()): boolean {
  const id = headers.get("webhook-id"), ts = headers.get("webhook-timestamp");
  if (!id || !ts || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return (headers.get("webhook-signature") || "").split(/\s+/).some(entry => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const actual = Buffer.from(value, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
