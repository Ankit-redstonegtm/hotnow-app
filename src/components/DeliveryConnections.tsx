"use client";
import { apiJson } from "@/lib/workspace";
import { useCallback, useEffect, useRef, useState } from "react";

type Connection = {
  provider: "slack";
  status: "disconnected" | "pending" | "connected" | "error";
  enabled: boolean;
  displayName: string | null;
  destinationLabel: string | null;
  lastError: string | null;
  ready: boolean;
  legacy: boolean;
};
type SlackChannel = { id: string; name: string; isPrivate: boolean };

export default function DeliveryConnections({
  variant,
  returnTo,
  description,
  footnote,
  defer = false,
}: {
  variant: "settings" | "onboarding";
  /** Overrides the OAuth return. Research wait uses /onboarding?resume=1. */
  returnTo?: string;
  description?: string;
  footnote?: string;
  /** Skip the delivery request until a workspace exists. */
  defer?: boolean;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [channelId, setChannelId] = useState("");
  const [showChannels, setShowChannels] = useState(false);
  const channelAttempt = useRef(false);

  const load = useCallback(async () => {
    const data = await apiJson<{ connections: Connection[] }>("/api/delivery");
    setConnection(data.connections.find((item) => item.provider === "slack") ?? null);
  }, []);

  useEffect(() => {
    if (defer) return;
    const code = new URLSearchParams(window.location.search).get("deliveryError");
    const messages: Record<string, string> = {
      cancelled: "Slack connection was cancelled.",
      state: "That Slack link expired. Try connecting again.",
      slack: "Slack could not be connected. Try again.",
    };
    if (code) setError(messages[code] || "Could not connect Slack. Try again.");
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load Slack"));
  }, [load, defer]);

  useEffect(() => {
    if (connection?.status !== "pending" || !connection.ready || channels || channelAttempt.current) return;
    channelAttempt.current = true;
    apiJson<{ channels: SlackChannel[] }>("/api/delivery/slack/channels").then((data) => {
      setChannels(data.channels);
      setChannelId((current) => current || data.channels[0]?.id || "");
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load Slack channels"));
  }, [connection?.status, connection?.ready, channels]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError(null); setNotice(null);
    try { await action(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  const legacyOnly = Boolean(connection?.legacy && connection.destinationLabel === "Incoming webhook");
  const status = connection?.status ?? "disconnected";
  const connected = status === "connected";
  const unavailable = Boolean(connection && !connection.ready && status === "disconnected");
  const detail = slackDetail(description, status, connected, unavailable);

  return (
    <section className="card p-4 sm:p-5">
      {error && <div className="card p-3 mb-3 text-sm" role="alert" style={{ color: "var(--accent-ink)" }}>{error}</div>}
      {notice && <div className="card p-3 mb-3 text-sm" role="status" style={{ color: "var(--muted)" }}>{notice}</div>}
      <div className="flex items-start gap-3">
        <span className="inline-grid place-items-center h-9 w-9 rounded-lg text-sm font-bold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>S</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-sm">Slack</h2>
            {(!description || connection) && <Status status={status} />}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{detail}</p>
          {connection?.destinationLabel && <p className="text-sm mt-2 font-medium">{connection.destinationLabel}{connection.displayName && connection.displayName !== connection.destinationLabel ? ` · ${connection.displayName}` : ""}</p>}
          {connection?.lastError && <p className="text-xs mt-2" style={{ color: "var(--accent-ink)" }}>{connection.lastError}</p>}
          {!description && unavailable && <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>Slack is not available on this server yet.</p>}
          {connection?.legacy && !legacyOnly && (
            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
              An older incoming webhook is still saved.
              <button className="ml-2 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => run("legacy", async () => {
                await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: "" }) });
                setNotice("Removed the old Slack webhook.");
              })}>Remove it</button>
            </p>
          )}
          {(status === "pending" || showChannels) && connection?.ready && (
            <div className="mt-3 space-y-2">
              <label className="label" htmlFor="slack-channel">Channel</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select id="slack-channel" className="input" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
                  {(channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.isPrivate ? "Private · " : "#"}{channel.name}</option>)}
                  {!channels && <option value="">Loading channels…</option>}
                  {channels && !channels.length && <option value="">No channels found</option>}
                </select>
                <button className="btn btn-primary" disabled={!channelId || !!busy} onClick={() => run("slack-channel", async () => {
                  await apiJson("/api/delivery/slack/channel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId }) });
                  setShowChannels(false); setNotice("Slack channel saved.");
                })}>Use this channel</button>
              </div>
            </div>
          )}
          {connected && !showChannels && !legacyOnly && (
            <button className="text-xs mt-3 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setShowChannels(true)}>Change channel</button>
          )}
          {(connection?.ready || connected || status === "pending" || status === "error") && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {!connected && status !== "pending" && connection?.ready && (
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("slack", async () => {
                const destination = returnTo ?? (variant === "onboarding" ? "/onboarding" : "/dashboard/settings");
                const data = await apiJson<{ url: string }>("/api/delivery/slack/start", {
                  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo: destination }),
                });
                window.location.assign(data.url);
              })}>Connect Slack</button>
            )}
            {connected && !legacyOnly && (
              <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={connection?.enabled ?? true} onChange={(event) => run("toggle", () => apiJson("/api/delivery/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack", enabled: event.target.checked }) }))} />
                Deliver here
              </label>
            )}
            {connected && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("test", async () => {
                await apiJson("/api/delivery/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack" }) });
                setNotice("Test sent to Slack.");
              })}>Send test</button>
            )}
            {(connected || status === "pending" || status === "error") && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("off", async () => {
                if (legacyOnly) {
                  await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: "" }) });
                  return;
                }
                await apiJson("/api/delivery/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack" }) });
              })}>{connected ? "Disconnect" : "Cancel"}</button>
            )}
          </div>
          )}
          {footnote && !connected && <p className="text-xs mt-3" style={{ color: "var(--faint)" }}>{footnote}</p>}
        </div>
      </div>
    </section>
  );
}

const DEFAULT_SLACK_DETAIL = "Install HotNow in Slack and pick the channel that should receive new opportunities.";

export function slackDetail(description: string | undefined, status: Connection["status"], connected: boolean, unavailable: boolean) {
  if (!description) return DEFAULT_SLACK_DETAIL;
  if (unavailable) return "Slack is not available on this server yet.";
  if (connected) return "Slack is ready. New opportunities will arrive in your channel.";
  if (status === "pending") return "Pick the channel that should receive new opportunities.";
  return description;
}

function Status({ status }: { status: Connection["status"] }) {
  if (status === "connected") return <span className="pill" style={{ background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" }}>Connected</span>;
  if (status === "pending") return <span className="pill">Choose a channel</span>;
  if (status === "error") return <span className="pill pill-p1">Needs attention</span>;
  return <span className="pill">Not connected</span>;
}
