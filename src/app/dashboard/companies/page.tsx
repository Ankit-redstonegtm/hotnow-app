"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadCSV } from "@/lib/csv";

type Opp = {
  id: string; what_happened: string; why_it_matters: string; confidence: string; evidence_date: string | null; status: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence: { source_url: string; source_date: string | null }[];
};

export default function CompaniesPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/opportunities").then((r) => r.json());
    setOpps(j.opportunities ?? []); setLoaded(true);
  }, []);
  const poll = useCallback(async () => {
    try {
      const j = await fetch("/api/discovery/poll", { method: "POST" }).then((r) => r.json());
      setRunning(j.remaining ?? 0); await load();
      if ((j.remaining ?? 0) > 0) timer.current = setTimeout(poll, 15000);
    } catch { timer.current = setTimeout(poll, 20000); }
  }, [load]);
  useEffect(() => { load(); poll(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load, poll]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((p) => p.size === opps.length ? new Set() : new Set(opps.map((o) => o.id)));
  const chosen = () => (sel.size ? opps.filter((o) => sel.has(o.id)) : opps);

  function exportCsv() {
    const rows = chosen().map((o) => ({
      company: o.companies?.name ?? "", domain: o.companies?.normalized_domain ?? "",
      signal: o.buying_situations?.name ?? "", what_happened: o.what_happened,
      why_it_matters: o.why_it_matters, confidence: o.confidence, evidence_date: o.evidence_date ?? "",
      source: o.evidence?.[0]?.source_url ?? "",
    }));
    downloadCSV(`hotnow-companies-${new Date().toISOString().slice(0, 10)}`, rows);
  }
  async function saveList() {
    const name = window.prompt("Name this list", "Hot companies"); if (!name) return;
    const r = await fetch("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kind: "companies", opportunityIds: chosen().map((o) => o.id) }) });
    const j = await r.json(); setMsg(r.ok ? `Saved "${name}" (${j.added} companies).` : j.error);
  }
  async function findContacts() {
    setMsg("Finding decision-makers… this runs in the background.");
    const loop = async () => {
      const j = await fetch("/api/contacts/source", { method: "POST" }).then((r) => r.json());
      if (j.error) { setMsg(j.error); return; }
      if (!j.done && j.remaining > 0) { setMsg(`Sourced contacts for a batch — ${j.remaining} companies left…`); setTimeout(loop, 1200); }
      else setMsg("Decision-makers sourced. See the Contacts tab.");
    };
    loop();
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{opps.length} companies with a reason to buy{running > 0 ? ` · ${running} search(es) running` : ""}.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={findContacts} disabled={!opps.length}>Find decision-makers</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!opps.length}>Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={saveList} disabled={!opps.length}>Save as list</button>
        </div>
      </div>

      {msg && <div className="card p-3 mb-4 text-sm" style={{ color: "var(--accent-ink)" }}>{msg}</div>}
      {running > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-sm dot">Discovery running — new companies appear automatically.</span>
        </div>
      )}

      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      ) : opps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Enable a Pain-Qualified Signal and run discovery.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={sel.size === opps.length && opps.length > 0} onChange={toggleAll} className="accent-[var(--accent)]" /></th>
                <th>Company</th><th>Signal</th><th>What happened</th><th>Confidence</th><th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {opps.map((o) => (
                <tr key={o.id}>
                  <td><input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} className="accent-[var(--accent)]" /></td>
                  <td>
                    <div className="font-medium flex items-center gap-2">{o.companies?.name || o.companies?.normalized_domain}{o.status === "new" && <span className="chip">New</span>}</div>
                    {o.companies?.normalized_domain && <a href={`https://${o.companies.normalized_domain}`} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--faint)" }}>{o.companies.normalized_domain} ↗</a>}
                  </td>
                  <td>{o.buying_situations?.name && <span className="pill">{o.buying_situations.name}</span>}</td>
                  <td style={{ maxWidth: 420, color: "var(--muted)" }}><div className="line-clamp-2">{o.what_happened}</div></td>
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
