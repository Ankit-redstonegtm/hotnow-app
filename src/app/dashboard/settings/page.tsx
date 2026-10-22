"use client";
import { apiJson } from "@/lib/workspace";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [slack, setSlack] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiJson("/api/settings").then((j) => {
      const s = j.settings; if (s) { setSlack(s.slackWebhookUrl ?? ""); setCompany(s.companyName ?? ""); setDomain(s.domain ?? ""); }
      setLoaded(true);
    }).catch(error => { setLoadError(error.message); setLoaded(true); });
  }, []);

  async function save() {
    if (saving) return; setSaving(true); setMsg(null);
    try {
    const r = await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: slack }) });
    setMsg("Saved."); return true;
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not save"); return false; }
    finally { setSaving(false); }
  }
  async function test() {
    if (saving) return;
    const saved = await save(); if (!saved) return;
    setSaving(true); setMsg("Sending test…");
    try {
      await apiJson("/api/slack/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) });
      setMsg("Test sent. Check your Slack channel.");
    } catch (error) { setMsg(error instanceof Error ? error.message : "Test delivery failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Workspace, integrations, and delivery.</p>
      </div>

      {loadError ? <div className="card p-4" role="alert">{loadError}<button className="btn btn-ghost btn-sm ml-3" onClick={() => window.location.reload()}>Retry</button></div> : !loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <>
          <div className="card p-6">
            <h2 className="font-semibold">Workspace</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <div><label className="label" htmlFor="workspace-company">Company</label><input id="workspace-company" className="input" value={company} disabled /></div>
              <div><label className="label" htmlFor="workspace-domain">Domain</label><input id="workspace-domain" className="input" value={domain} disabled /></div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Slack delivery</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>Paste an <a className="underline" style={{ color: "var(--accent-ink)" }} href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">incoming webhook URL</a>. Then push any list to that channel with one click.</p>
            <label className="label" htmlFor="slack-webhook">Slack webhook URL</label>
            <input id="slack-webhook" className="input" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
            <div className="flex items-center gap-3 mt-4">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button className="btn btn-ghost" onClick={test} disabled={!slack || saving}>Save & send test</button>
              {msg && <span role="status" className="text-sm" style={{ color: "var(--muted)" }}>{msg}</span>}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Daily opportunities</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>New opportunities on a set schedule are coming soon. For now, start a search from the Pain-Qualified Signals tab whenever you want fresh companies.</p>
          </div>
        </>
      )}
    </div>
  );
}
