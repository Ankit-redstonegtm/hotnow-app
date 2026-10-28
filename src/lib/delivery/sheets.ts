import { DeliveryError, safeProviderMessage } from "./errors";
import { SHEET_HEADERS } from "./types";
import type { GoogleSecret, LeadCard } from "./types";
import { sheetRows } from "./messages";

type FetchLike = typeof fetch;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

async function googleTokenRequest(body: URLSearchParams, fetchImpl: FetchLike) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    const message = json?.error_description || json?.error || `Google returned ${res.status}`;
    const auth = json?.error === "invalid_grant" || res.status === 401;
    throw new DeliveryError(safeProviderMessage(String(message), "Google could not refresh access."), auth ? 401 : 400);
  }
  return json;
}

export function googleAuthorizeUrl(redirectUri: string, state: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new DeliveryError("Google Sheets is not configured on this server yet.", 503);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SHEETS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, redirectUri: string, fetchImpl: FetchLike = fetch): Promise<GoogleSecret> {
  const json = await googleTokenRequest(new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }), fetchImpl);
  if (typeof json.refresh_token !== "string" || !json.refresh_token) {
    throw new DeliveryError("Google did not return a refresh token. Remove HotNow from the Google account's third-party access and connect again.", 400);
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresAt: Number.isFinite(json.expires_in) ? Date.now() + Number(json.expires_in) * 1000 : undefined,
  };
}

export async function usableGoogleToken(secret: GoogleSecret, fetchImpl: FetchLike = fetch): Promise<{ token: string; secret: GoogleSecret; refreshed: boolean }> {
  if (secret.accessToken && secret.expiresAt && secret.expiresAt > Date.now() + 60_000) {
    return { token: secret.accessToken, secret, refreshed: false };
  }
  const json = await googleTokenRequest(new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  }), fetchImpl);
  const next: GoogleSecret = {
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : secret.refreshToken,
    accessToken: json.access_token,
    expiresAt: Number.isFinite(json.expires_in) ? Date.now() + Number(json.expires_in) * 1000 : undefined,
  };
  return { token: next.accessToken || "", secret: next, refreshed: true };
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.includes("://") && !trimmed.includes("/") && /^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
    return url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function a1(sheetName: string, range: string) {
  const safe = /^[A-Za-z0-9_]+$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
  return `${safe}!${range}`;
}

async function sheetsFetch(token: string, url: string, init: RequestInit, fetchImpl: FetchLike) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `Google Sheets returned ${res.status}`;
    throw new DeliveryError(safeProviderMessage(String(message), "Google Sheets rejected the update."), res.status === 401 ? 401 : 400);
  }
  return json;
}

export async function createLeadSheet(token: string, title: string, fetchImpl: FetchLike = fetch) {
  const safeTitle = title.replace(/\s+/g, " ").trim().slice(0, 80) || "HotNow leads";
  const json = await sheetsFetch(token, "https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: safeTitle },
      sheets: [{
        properties: { title: "Leads" },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: [{ values: SHEET_HEADERS.map((header) => ({ userEnteredValue: { stringValue: header } })) }],
        }],
      }],
    }),
  }, fetchImpl);
  if (!json?.spreadsheetId) throw new DeliveryError("Google did not create a spreadsheet.", 400);
  return {
    spreadsheetId: String(json.spreadsheetId),
    sheetName: "Leads",
    title: json.properties?.title || safeTitle,
    spreadsheetUrl: json.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${json.spreadsheetId}/edit`,
  };
}

export async function inspectSheet(token: string, spreadsheetId: string, fetchImpl: FetchLike = fetch) {
  const meta = await sheetsFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`, { method: "GET" }, fetchImpl);
  const sheetName = meta?.sheets?.[0]?.properties?.title || "Sheet1";
  const range = encodeURIComponent(a1(sheetName, "A1:J1"));
  const values = await sheetsFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`, { method: "GET" }, fetchImpl).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (/Unable to parse range/i.test(message)) return { values: [] };
    throw error;
  });
  const header = (values?.values?.[0] ?? []).map((cell: unknown) => String(cell));
  const blank = header.every((cell: string) => !cell.trim());
  if (!blank && header[0] !== "Company") {
    throw new DeliveryError("That sheet already has different column headers. Create a new sheet or use an empty one.", 400);
  }
  if (blank) await writeHeaders(token, spreadsheetId, sheetName, fetchImpl);
  return {
    spreadsheetId,
    sheetName,
    title: meta?.properties?.title || "Google Sheet",
    spreadsheetUrl: meta?.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

async function writeHeaders(token: string, spreadsheetId: string, sheetName: string, fetchImpl: FetchLike) {
  const range = encodeURIComponent(a1(sheetName, "A1"));
  await sheetsFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range: a1(sheetName, "A1"), majorDimension: "ROWS", values: [Array.from(SHEET_HEADERS)] }),
  }, fetchImpl);
}

export async function appendLeadRows(token: string, spreadsheetId: string, sheetName: string, leads: LeadCard[], fetchImpl: FetchLike = fetch) {
  const values = sheetRows(leads);
  if (!values.length) return;
  const range = encodeURIComponent(a1(sheetName, "A1"));
  await sheetsFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values }),
  }, fetchImpl);
}
