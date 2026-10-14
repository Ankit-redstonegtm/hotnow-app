"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [slack, setSlack] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // --- TEMPORARY testing tools (remove before launch) ---
  const [costs, setCosts] = useState<null | {
    parallel: { findAllActualUsd: number; findAllRuns: number; researchEstUsd: number; researchTasks: number; subtotalUsd: number };
    gemini: { situationsEstUsd: number; generations: number };
    totalEstUsd: number;
  }>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const loadCosts = () => fetch("/api/admin/costs").then((r) => r.json()).then((j) => { if (!j.error) setCosts(j); });

  async function clearData() {
    if (!confirm("Delete ALL of your data (company profile, situations, searches, opportunities)? This cannot be undone. The shared company database is not affected.")) return;
    setClearing(true); setClearMsg(null);
    const r = await fetch("/api/admin/reset", { method: "POST" });
    const j = await r.json();
    setClearing(false);
    setClearMsg(r.ok ? "Cleared. Reload to start fresh." : (j.error || "Could not clear."));
    if (r.ok) loadCosts();
  }

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => {
      const s = j.settings; if (s) { setSlack(s.slackWebhookUrl ?? ""); setCompany(s.companyName ?? ""); setDomain(s.domain ?? ""); }
      setLoaded(true);
    });
    loadCosts();
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
    const j = await r.json(); setMsg(r.ok ? "Test sent. Check your Slack channel ✓" : j.error);
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
            <h2 className="font-semibold">Daily opportunities</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>New opportunities on a set schedule are coming soon. For now, start a search from the Pain-Qualified Signals tab whenever you want fresh companies.</p>
          </div>

          {/* ---------- TEMPORARY testing tools (remove before launch) ---------- */}
          <div className="card p-6" style={{ borderColor: "var(--accent)", borderStyle: "dashed" }}>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Spend so far</h2>
              <span className="chip">Temporary</span>
            </div>
            {!costs ? (
              <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>Loading…</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Metric label="Total (est)" value={`$${costs.totalEstUsd.toFixed(2)}`} accent />
                  <Metric label="FindAll — actual" value={`$${costs.parallel.findAllActualUsd.toFixed(2)}`} sub={`${costs.parallel.findAllRuns} run${costs.parallel.findAllRuns === 1 ? "" : "s"}`} />
                  <Metric label="Research — est" value={`$${costs.parallel.researchEstUsd.toFixed(2)}`} sub={`${costs.parallel.researchTasks} tasks`} />
                  <Metric label="Gemini — est" value={`$${costs.gemini.situationsEstUsd.toFixed(2)}`} sub={`${costs.gemini.generations} gens`} />
                  <Metric label="Parallel subtotal" value={`$${costs.parallel.subtotalUsd.toFixed(2)}`} />
                </div>
                <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>FindAll is actual (summed from runs). Research + Gemini are estimates (we don’t log per-call cost). For exact billing see the Parallel &amp; Google AI Studio dashboards. Figures are workspace-wide.</p>
                <button className="btn btn-ghost mt-3" onClick={loadCosts}>Refresh</button>
              </>
            )}
          </div>

          <div className="card p-6" style={{ borderColor: "#dc2626", borderStyle: "dashed" }}>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Clear my data</h2>
              <span className="chip">Temporary</span>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Deletes your company profile, situations, searches, and opportunities so you can test a fresh run. Only your data — the shared company database is untouched. Can’t be undone.</p>
            <div className="flex items-center gap-3 mt-4">
              <button className="btn" style={{ background: "#dc2626", color: "white" }} onClick={clearData} disabled={clearing}>{clearing ? "Clearing…" : "Clear all my data"}</button>
              {clearMsg && <span className="text-sm" style={{ color: "var(--muted)" }}>{clearMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-lg font-semibold mt-0.5" style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: "var(--muted)" }}>{sub}</p>}
    </div>
  );
}
