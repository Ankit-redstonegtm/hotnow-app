"use client";
import { useActivity } from "@/components/ActivityProvider";
import SaveListDialog from "@/components/SaveListDialog";
import { apiFetch, apiJson } from "@/lib/workspace";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { downloadCSV, opportunityCsvRows } from "@/lib/csv";

type Opp = {
  id: string; what_happened: string; why_it_matters: string; confidence: string; evidence_date: string | null; status: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence: { source_url: string; source_date: string | null }[];
};

type Phase = "idle" | "contacts" | "emails" | "done";

export default function CompaniesPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, workspaceId } = useActivity();
  const load = useCallback(async () => {
    try {
      const j = await apiJson("/api/opportunities");
      setOpps(j.opportunities ?? []); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load companies"); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    void load();
    setRunning((data?.items || []).filter(i => i.workspaceId === workspaceId && i.kind === "discovery" && ["queued", "running"].includes(i.status)).length);
  }, [load, data?.observedAt, workspaceId]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((p) => p.size === opps.length ? new Set() : new Set(opps.map((o) => o.id)));
  const chosen = () => (sel.size ? opps.filter((o) => sel.has(o.id)) : opps);

  function exportCsv() {
    downloadCSV(`hotnow-companies-${new Date().toISOString().slice(0, 10)}`, opportunityCsvRows(chosen()));
  }
  function saveList() { setListOpen(true); }



  return (
    <div>
      <SaveListDialog open={listOpen} onClose={() => setListOpen(false)} kind="companies" ids={chosen().map(item => item.id)} onSaved={setMsg} />
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{new Set(opps.map(o => o.companies?.normalized_domain)).size} companies · {opps.length} buying signals{running > 0 ? ` · ${running} search${running > 1 ? "es" : ""} running` : ""}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!opps.length}>Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={saveList} disabled={!opps.length}>Save as list</button>
        </div>
      </div>

      {msg && <div className="card p-3 mb-4 text-sm" style={{ color: "var(--accent-ink)" }}>{msg}</div>}

      {running > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-sm dot">Finding companies. New ones appear here as we verify them.</span>
        </div>
      )}

      {opps.length > 0 && <div className="card p-4 mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Turn buying signals into conversations</p><p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Choose contact criteria, then run enrichment in the background.</p></div><Link href="/dashboard/contacts" className="btn btn-ghost btn-sm">Find decision-makers →</Link></div>}

      {error ? <div role="alert" className="card p-4">{error}</div> : !loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      ) : opps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Your seller profile describes your own business. Start a discovery search to find prospective customers here.</p>
          <Link href="/dashboard/signals" className="btn btn-primary mt-4">Find opportunities</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" aria-label="Select all companies" checked={sel.size === opps.length && opps.length > 0} onChange={toggleAll} className="accent-[var(--accent)]" /></th>
                <th>Company</th><th>Signal</th><th>What's happening</th><th>Confidence</th><th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {opps.map((o) => (
                <tr key={o.id}>
                  <td><input type="checkbox" aria-label={`Select ${o.companies?.name || "company"}`} checked={sel.has(o.id)} onChange={() => toggle(o.id)} className="accent-[var(--accent)]" /></td>
                  <td>
                    <div className="font-medium flex items-center gap-2">{o.companies?.name || o.companies?.normalized_domain}{o.status === "new" && <span className="chip">New</span>}</div>
                    {o.companies?.normalized_domain && <a href={`https://${o.companies.normalized_domain}`} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--faint)" }}>{o.companies.normalized_domain} ↗</a>}
                  </td>
                  <td>{o.buying_situations?.name && <span className="pill">{o.buying_situations.name}</span>}</td>
                  <td style={{ maxWidth: 420, color: "var(--muted)" }}><div className="line-clamp-2">{o.what_happened}</div><details className="mt-2 text-xs"><summary className="cursor-pointer" style={{ color: "var(--accent-ink)" }}>Why this matters</summary><p className="mt-2">{o.why_it_matters || "Review the supporting evidence to assess fit."}</p>{o.evidence_date && <p className="mt-1">Evidence dated {o.evidence_date}</p>}</details></td>
                  <td><span className="pill">{o.confidence}</span></td>
                  <td>{o.evidence?.slice(0, 2).map((e, i) => <a key={i} href={e.source_url} target="_blank" rel="noreferrer" className="block text-xs underline" style={{ color: "var(--accent-ink)" }}>source {i + 1} ↗</a>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stage({ on, label, active }: { on: boolean; label: string; active?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
      style={{
        background: on ? "var(--accent-soft)" : "var(--surface-2)",
        color: on ? "var(--accent-ink)" : "var(--faint)",
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
      }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: on ? "var(--accent)" : "var(--faint)" }} />
      {label}
    </span>
  );
}
function Dash() { return <span style={{ color: "var(--faint)" }}>›</span>; }
