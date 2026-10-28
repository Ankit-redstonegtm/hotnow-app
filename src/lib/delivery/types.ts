export const PROVIDERS = ["slack", "google_sheets", "teams", "telegram"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type ConnectionStatus = "pending" | "connected" | "error";

export type ConnectionConfig = {
  connectCode?: string;
  expiresAt?: string;
  botUsername?: string;
  sheetName?: string;
  spreadsheetUrl?: string;
  teamId?: string;
  teamName?: string;
};

export type ConnectionRow = {
  seller_profile_id: string;
  provider: Provider;
  status: ConnectionStatus;
  enabled: boolean;
  display_name: string | null;
  destination_label: string | null;
  external_id: string | null;
  config: ConnectionConfig;
  last_error: string | null;
  connected_at: string | null;
  updated_at: string;
};

export type PublicConnection = {
  provider: Provider;
  status: "disconnected" | ConnectionStatus;
  enabled: boolean;
  displayName: string | null;
  destinationLabel: string | null;
  href: string | null;
  connectUrl: string | null;
  connectedAt: string | null;
  lastError: string | null;
  ready: boolean;
  legacy: boolean;
};

export type SlackSecret = {
  botToken: string;
  refreshToken?: string;
  expiresAt?: number;
  teamId: string;
};

export type GoogleSecret = {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number;
};

export type TeamsSecret = { webhookUrl: string };

export type LeadCard = {
  company: string;
  domain: string;
  signal: string;
  whatHappened: string;
  whyItMatters: string;
  confidence: string;
  evidenceDate: string;
  sourceUrl: string;
  discoveredAt: string;
  link: string;
};

export const SHEET_HEADERS = [
  "Company", "Domain", "Signal", "What happened", "Why it matters",
  "Confidence", "Evidence date", "Source", "Discovered", "Link",
] as const;

export function providerReady(provider: Provider): boolean {
  const key = Boolean(process.env.DELIVERY_TOKEN_KEY);
  switch (provider) {
    case "slack":
      return key && Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
    case "google_sheets":
      return key && Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    case "teams":
      return key;
    case "telegram":
      return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }
}

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}
