export const PROVIDERS = ["slack"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type ConnectionStatus = "pending" | "connected" | "error";

export type ConnectionConfig = {
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

export function providerReady(provider: Provider): boolean {
  if (provider !== "slack") return false;
  return Boolean(process.env.DELIVERY_TOKEN_KEY && process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}
