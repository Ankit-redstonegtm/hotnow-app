"use client";
import { apiJson } from "@/lib/workspace";
import { useCallback, useEffect, useRef, useState } from "react";

type Provider = "slack" | "google_sheets" | "teams" | "telegram";
type Connection = {
  provider: Provider;
  status: "disconnected" | "pending" | "connected" | "error";
  enabled: boolean;
  displayName: string | null;
  destinationLabel: string | null;
  href: string | null;
  connectUrl: string | null;
  lastError: string | null;
  ready: boolean;
  legacy: boolean;
};
type SlackChannel = { id: string; name: string; isPrivate: boolean };

const COPY: Record<Provider, { name: string; mark: string; blurb: string }> = {
  slack: { name: "Slack", mark: "S", blurb: "Install HotNow in Slack and pick the channel that should receive opportunities." },
  google_sheets: { name: "Google Sheets", mark: "G", blurb: "Sign in with Google, then create a sheet or use an empty one you already have." },
  teams: { name: "Microsoft Teams", mark: "T", blurb: "Create a channel webhook in Teams and paste it here. Each new batch is posted as a card." },
  telegram: { name: "Telegram", mark: "Tg", blurb: "Open the HotNow bot and press Start. That chat receives new opportunities." },
};

const ERRORS: Record<string, string> = {
  cancelled: "Connection was cancelled.",
  state: "That connection link expired. Try connecting again.",
  slack: "Slack could not be connected. Try again.",
  google: "Google Sheets could not be connected. Try again.",
};

export default function DeliveryConnections({ variant }: { variant: "settings" | "onboarding" }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [channelId, setChannelId] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [teamsUrl, setTeamsUrl] = useState("");
  const [showSheet, setShowSheet] = useState(false);
  const [showChannels, setShowChannels] = useState(false);

  const load = useCallback(async () => {
    const data = await apiJson<{ connections: Connection[] }>("/api/delivery");
    setConnections(data.connections);
    return data.connections;
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("deliveryError");
    if (code) setError(ERRORS[code] || "Could not connect. Try again.");
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load destinations"));
  }, [load]);

  const telegramPending = connections?.some((item) => item.provider === "telegram" && item.status === "pending") ?? false;
  useEffect(() => {
    if (!telegramPending) return;
    const timer = setInterval(() => {
      apiJson("/api/delivery/telegram/check", { method: "POST" }).then(() => load()).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [telegramPending, load]);

  function row(provider: Provider) {
    return connections?.find((item) => item.provider === provider) ?? null;
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError(null); setNotice(null);
    try { await action(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  async function beginOAuth(provider: "slack" | "google_sheets") {
    const path = provider === "slack" ? "/api/delivery/slack/start" : "/api/delivery/google/start";
    const returnTo = variant === "onboarding" ? "/onboarding" : "/dashboard/settings";
    await run(provider, async () => {
      const data = await apiJson<{ url: string }>(path, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo }),
      });
      window.location.assign(data.url);
    });
  }

  async function ensureChannels() {
    setShowChannels(true);
    if (channels) return;
    await run("slack-channels", async () => {
      const data = await apiJson<{ channels: SlackChannel[] }>("/api/delivery/slack/channels");
      setChannels(data.channels);
      setChannelId(data.channels[0]?.id ?? "");
    });
  }

  const channelAttempt = useRef(false);
  const slack = row("slack");
  const sheets = row("google_sheets");
  const teams = row("teams");
  const telegram = row("telegram");
  const legacyOnly = Boolean(slack?.legacy && slack.destinationLabel === "Incoming webhook");

  useEffect(() => {
    if (slack?.status !== "pending" || !slack.ready || channels || channelAttempt.current) return;
    channelAttempt.current = true;
    apiJson<{ channels: SlackChannel[] }>("/api/delivery/slack/channels").then((data) => {
      setChannels(data.channels);
      setChannelId((current) => current || data.channels[0]?.id || "");
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load Slack channels"));
  }, [slack?.status, slack?.ready, channels]);

  return (
    <div className="space-y-3">
      {error && <div className="card p-3 text-sm" role="alert" style={{ color: "var(--accent-ink)" }}>{error}</div>}
      {notice && <div className="card p-3 text-sm" role="status" style={{ color: "var(--muted)" }}>{notice}</div>}
      {!connections ? <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div> : (
        <>
          <Destination
            provider="slack"
            connection={slack}
            busy={busy}
            onConnect={() => beginOAuth("slack")}
            onDisconnect={() => run("slack-off", async () => {
              if (legacyOnly) {
                await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: "" }) });
                return;
              }
              await apiJson("/api/delivery/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack" }) });
            })}
            onTest={() => run("slack-test", async () => { await apiJson("/api/delivery/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack" }) }); setNotice("Test sent to Slack."); })}
            onToggle={(enabled) => run("slack-toggle", () => apiJson("/api/delivery/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "slack", enabled }) }))}
            allowToggle={!legacyOnly}
          >
            {slack?.legacy && !legacyOnly && (
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                An older incoming webhook is still saved.
                <button className="ml-2 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => run("legacy", async () => {
                  await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: "" }) });
                  setNotice("Removed the old Slack webhook.");
                })}>Remove it</button>
              </p>
            )}
            {(slack?.status === "pending" || showChannels) && slack?.ready && (
              <div className="mt-3 space-y-2">
                <label className="label" htmlFor="slack-channel">Channel</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select id="slack-channel" className="input" value={channelId} onFocus={() => { if (!channels) void ensureChannels(); }} onChange={(event) => setChannelId(event.target.value)}>
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
            {slack?.status === "connected" && !showChannels && (
              <button className="text-xs mt-3 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => ensureChannels()}>Change channel</button>
            )}
          </Destination>

          <Destination
            provider="google_sheets"
            connection={sheets}
            busy={busy}
            onConnect={() => beginOAuth("google_sheets")}
            onDisconnect={() => run("sheets-off", () => apiJson("/api/delivery/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google_sheets" }) }))}
            onTest={() => run("sheets-test", async () => { await apiJson("/api/delivery/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google_sheets" }) }); setNotice("Test row added to Google Sheets."); })}
            onToggle={(enabled) => run("sheets-toggle", () => apiJson("/api/delivery/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google_sheets", enabled }) }))}
          >
            {(sheets?.status === "pending" || showSheet) && sheets?.status !== "disconnected" && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("sheet-create", async () => {
                    await apiJson("/api/delivery/google/sheet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "create" }) });
                    setShowSheet(false); setNotice("Created a Google Sheet for leads.");
                  })}>Create a sheet</button>
                </div>
                <label className="label" htmlFor="sheet-url">Or paste a sheet link</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="sheet-url" className="input" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
                  <button className="btn btn-ghost" disabled={!sheetUrl || !!busy} onClick={() => run("sheet-existing", async () => {
                    await apiJson("/api/delivery/google/sheet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "existing", spreadsheetUrl: sheetUrl }) });
                    setShowSheet(false); setNotice("Google Sheet saved.");
                  })}>Use this sheet</button>
                </div>
              </div>
            )}
            {sheets?.status === "connected" && !showSheet && (
              <button className="text-xs mt-3 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setShowSheet(true)}>Change sheet</button>
            )}
          </Destination>

          <Destination
            provider="teams"
            connection={teams}
            busy={busy}
            onConnect={() => undefined}
            hideConnect
            onDisconnect={() => run("teams-off", () => apiJson("/api/delivery/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "teams" }) }))}
            onTest={() => run("teams-test", async () => { await apiJson("/api/delivery/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "teams" }) }); setNotice("Test card sent to Teams."); })}
            onToggle={(enabled) => run("teams-toggle", () => apiJson("/api/delivery/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "teams", enabled }) }))}
          >
            {teams?.status !== "connected" && teams?.ready && (
              <div className="mt-3 space-y-2">
                <ol className="text-xs space-y-1 list-decimal pl-4" style={{ color: "var(--muted)" }}>
                  <li>In Teams, open the channel that should receive leads.</li>
                  <li>Choose Workflows, then “Post to a channel when a webhook request is received.” A legacy Incoming Webhook works too.</li>
                  <li>Copy the HTTPS URL and paste it here.</li>
                </ol>
                <label className="label" htmlFor="teams-url">Teams webhook URL</label>
                <input id="teams-url" className="input" value={teamsUrl} onChange={(event) => setTeamsUrl(event.target.value)} placeholder="https://....webhook.office.com/..." autoComplete="off" />
                <button className="btn btn-primary btn-sm" disabled={!teamsUrl || !!busy} onClick={() => run("teams-save", async () => {
                  await apiJson("/api/delivery/teams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ webhookUrl: teamsUrl }) });
                  setTeamsUrl(""); setNotice("Teams webhook saved.");
                })}>Connect Teams</button>
              </div>
            )}
          </Destination>

          <Destination
            provider="telegram"
            connection={telegram}
            busy={busy}
            onConnect={() => run("telegram", async () => {
              const data = await apiJson<{ deepLink: string }>("/api/delivery/telegram/start", { method: "POST" });
              window.open(data.deepLink, "_blank", "noopener,noreferrer");
              setNotice("Press Start in Telegram. This page updates when the chat connects.");
            })}
            onDisconnect={() => run("telegram-off", () => apiJson("/api/delivery/disconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "telegram" }) }))}
            onTest={() => run("telegram-test", async () => { await apiJson("/api/delivery/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "telegram" }) }); setNotice("Test message sent in Telegram."); })}
            onToggle={(enabled) => run("telegram-toggle", () => apiJson("/api/delivery/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "telegram", enabled }) }))}
          >
            {telegram?.status === "pending" && telegram.connectUrl && (
              <a className="btn btn-primary btn-sm mt-3" href={telegram.connectUrl} target="_blank" rel="noreferrer">Open Telegram</a>
            )}
            {telegram?.status === "pending" && !telegram.connectUrl && (
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>That connect link expired. Connect again.</p>
            )}
          </Destination>
        </>
      )}
    </div>
  );
}

function Destination({
  provider, connection, busy, children, onConnect, onDisconnect, onTest, onToggle, hideConnect, allowToggle = true,
}: {
  provider: Provider;
  connection: Connection | null;
  busy: string | null;
  children?: React.ReactNode;
  onConnect: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  hideConnect?: boolean;
  allowToggle?: boolean;
}) {
  const copy = COPY[provider];
  const status = connection?.status ?? "disconnected";
  const connected = status === "connected";
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-grid place-items-center h-9 w-9 rounded-lg text-sm font-bold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{copy.mark}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-sm">{copy.name}</h2>
            <Status status={status} />
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{copy.blurb}</p>
          {connection?.destinationLabel && <p className="text-sm mt-2 font-medium">{connection.destinationLabel}{connection.displayName && connection.displayName !== connection.destinationLabel ? ` · ${connection.displayName}` : ""}</p>}
          {connection?.href && <a className="text-xs font-medium" style={{ color: "var(--accent-ink)" }} href={connection.href} target="_blank" rel="noreferrer">Open spreadsheet</a>}
          {connection?.lastError && <p className="text-xs mt-2" style={{ color: "var(--accent-ink)" }}>{connection.lastError}</p>}
          {!connection?.ready && status === "disconnected" && <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>Not available on this server yet.</p>}
          {children}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {!hideConnect && !connected && connection?.ready && status !== "pending" && (
              <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={onConnect}>Connect {copy.name}</button>
            )}
            {status === "pending" && provider !== "google_sheets" && provider !== "slack" && connection?.ready && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={onConnect}>Connect again</button>
            )}
            {connected && (
              <>
                {allowToggle && (
                  <label className="text-xs flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                    <input type="checkbox" checked={connection?.enabled ?? true} onChange={(event) => onToggle(event.target.checked)} />
                    Deliver here
                  </label>
                )}
                <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={onTest}>Send test</button>
              </>
            )}
            {(connected || status === "pending" || status === "error") && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={onDisconnect}>{connected ? "Disconnect" : "Cancel"}</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Status({ status }: { status: Connection["status"] }) {
  if (status === "connected") {
    return <span className="pill" style={{ background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" }}>Connected</span>;
  }
  if (status === "pending") return <span className="pill">Finish setup</span>;
  if (status === "error") return <span className="pill pill-p1">Needs attention</span>;
  return <span className="pill">Not connected</span>;
}
