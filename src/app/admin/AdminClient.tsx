"use client";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string; email: string; createdAt: string; domain: string | null; company: string | null;
  onboarded: boolean; situations: number; runs: number; opportunities: number;
  findAllActualUsd: number; estSpendUsd: number;
};
type Data = {
  totals: { users: number; onboarded: number; opportunities: number; findAllActualUsd: number; researchEstUsd: number; totalEstUsd: number };
  users: Row[];
};

export default function AdminClient({ email }: { email: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/admin/overview");
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Could not load"); return; }
    setData(j);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearUser(u: Row) {
    if (!confirm(`Delete ALL data for ${u.email}? Profile, situations, searches, and opportunities are removed. The shared company database is not affected. Cannot be undone.`)) return;
    setBusy(u.id);
    const r = await fetch("/api/admin/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: u.id }) });
    setBusy(null);
    if (!r.ok) { const j = await r.json(); alert(j.error || "Could not clear"); return; }
    load();
  }

  const money = (n: number) => `$${n.toFixed(2)}`;
  const date = (s: string) => new Date(s).toLocaleString();

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--fg)" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px 64px" }}>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>Signed in as {email} · internal only</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost" onClick={load}>Refresh</button>
            <a className="btn btn-ghost" href="/dashboard">← Dashboard</a>
          </div>
        </div>

        {err && <div className="card p-4 mb-5" style={{ color: "#dc2626" }}>{err}</div>}

        {!data ? (
          <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total spend (est)" value={money(data.totals.totalEstUsd)} accent />
              <Stat label="FindAll — actual" value={money(data.totals.findAllActualUsd)} />
              <Stat label="Research — est" value={money(data.totals.researchEstUsd)} />
              <Stat label="Users" value={String(data.totals.users)} sub={`${data.totals.onboarded} onboarded`} />
            </div>

            <div className="flex items-center justify-between mt-8 mb-3">
              <h2 className="font-semibold">Users</h2>
              <span className="text-sm" style={{ color: "var(--muted)" }}>{data.totals.opportunities} opportunities total</span>
            </div>

            <div className="card overflow-x-auto">
              <table className="tbl" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Email</th><th>Domain</th><th>Signed up</th>
                    <th style={{ textAlign: "right" }}>Sits</th>
                    <th style={{ textAlign: "right" }}>Runs</th>
                    <th style={{ textAlign: "right" }}>Opps</th>
                    <th style={{ textAlign: "right" }}>Spend (est)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium">{u.email}{!u.onboarded && <span className="pill" style={{ marginLeft: 6 }}>no profile</span>}</td>
                      <td style={{ color: "var(--muted)" }}>{u.domain || "—"}</td>
                      <td style={{ color: "var(--muted)" }} className="whitespace-nowrap">{date(u.createdAt)}</td>
                      <td style={{ textAlign: "right" }}>{u.situations}</td>
                      <td style={{ textAlign: "right" }}>{u.runs}</td>
                      <td style={{ textAlign: "right" }}>{u.opportunities}</td>
                      <td style={{ textAlign: "right" }} title={`FindAll actual ${money(u.findAllActualUsd)}`}>{money(u.estSpendUsd)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn" style={{ background: "#dc2626", color: "white", padding: "4px 10px", fontSize: 13 }} disabled={busy === u.id} onClick={() => clearUser(u)}>
                          {busy === u.id ? "Clearing…" : "Clear"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs mt-4" style={{ color: "var(--muted)" }}>
              FindAll spend is actual (summed from discovery runs). Research is an estimate ($0.025 per Parallel Task; per-call cost isn’t logged) and Gemini situations are negligible. For exact billing, check the Parallel and Google AI Studio dashboards.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-2xl font-semibold mt-1" style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>}
    </div>
  );
}
