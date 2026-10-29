import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthState = {
  v: 1;
  uid: string;
  profileId: string;
  provider: "slack";
  exp: number;
  nonce: string;
  returnTo: string;
};

const RETURNS = new Set(["/onboarding", "/onboarding?resume=1", "/dashboard/settings"]);

export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && RETURNS.has(value) ? value : "/dashboard/settings";
}

// /onboarding is the deliver step and comes back with ?deliver=1.
// /onboarding?resume=1 is the research wait. It returns to /onboarding with no
// deliver flag so polling can finish and the studio still comes next.
export function oauthReturnTarget(returnTo: string): { pathname: string; deliver: boolean } {
  const stored = safeReturnPath(returnTo);
  if (stored === "/onboarding?resume=1") return { pathname: "/onboarding", deliver: false };
  if (stored === "/onboarding") return { pathname: "/onboarding", deliver: true };
  return { pathname: stored, deliver: false };
}

export function oauthBaseUrl(req: Request): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch { /* fall through to the request host */ }
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(req.url).origin;
}

export function appRedirect(req: Request, returnTo: string, params: Record<string, string> = {}) {
  const { pathname, deliver } = oauthReturnTarget(returnTo);
  const target = new URL(pathname, oauthBaseUrl(req));
  if (deliver) target.searchParams.set("deliver", "1");
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target;
}

function stateKey(): string {
  const raw = process.env.DELIVERY_TOKEN_KEY;
  if (!raw) throw new Error("DELIVERY_TOKEN_KEY is not set");
  return raw;
}

export function signState(payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(token: string | null, provider: OAuthState["provider"]): OAuthState | null {
  if (!token || !process.env.DELIVERY_TOKEN_KEY) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", stateKey()).update(body).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (parsed.v !== 1 || parsed.provider !== provider || parsed.exp < Date.now()) return null;
    if (!parsed.uid || !parsed.profileId || !parsed.nonce) return null;
    parsed.returnTo = safeReturnPath(parsed.returnTo);
    return parsed;
  } catch {
    return null;
  }
}

export function newNonce() {
  return randomBytes(16).toString("base64url");
}

export function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

export function redirectUri(req: Request) {
  return `${oauthBaseUrl(req)}/api/delivery/slack/callback`;
}
