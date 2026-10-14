"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [slack, setSlack] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => {
      const s = j.settings; if (s) { setSlack(s.slackWebhookUrl ?? ""); setCompany(s.companyName ?? ""); setDomain(s.domain ?? ""); }
      setLoaded(true);
    });
  }, []);

  async function save() {
    setMsg(null);
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slackWebhookUrl: slack }) });
    setMsg(r.ok ? "Saved." : "Could not save.");
  }
  async function test() {
    setMsg("Sending test…");
    await save();
    const r = await fetch("/api/slack/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) });
    const j = await r.json(); setMsg(r.ok ? "Test sent — check your Slack channel ✓" : j.error);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Workspace, integrations, and delivery.</p>
      </div>

      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <>
          <div className="card p-6">
            <h2 className="font-semibold">Workspace</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <div><label className="label">Company</label><input className="input" value={company} disabled /></div>
              <div><label className="label">Domain</label><input className="input" value={domain} disabled /></div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Slack delivery</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>Paste an <a className="underline" style={{ color: "var(--accent-ink)" }} href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">incoming webhook URL</a>. Then push any list to that channel with one click.</p>
            <label className="label">Slack webhook URL</label>
            <input className="input" value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
            <div className="flex items-center gap-3 mt-4">
              <button className="btn btn-primary" onClick={save}>Save</button>
              <button className="btn btn-ghost" onClick={test} disabled={!slack}>Save & send test</button>
              {msg && <span className="text-sm" style={{ color: "var(--muted)" }}>{msg}</span>}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Daily discovery</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Automatic daily discovery is coming soon. For now, run discovery from the Pain-Qualified Signals tab whenever you want fresh companies.</p>
          </div>
        </>
      )}
    </div>
  );
}
