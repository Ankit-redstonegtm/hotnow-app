"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadCSV } from "@/lib/csv";

type Opp = {
  id: string; what_happened: string; why_it_matters: string; confidence: string; evidence_date: string | null; status: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence: { source_url: string; source_date: string | null }[];
};

type Phase = "idle" | "contacts" | "emails" | "done";

export default function CompaniesPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseNote, setPhaseNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipelineBusy = useRef(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/opportunities").then((r) => r.json());
    setOpps(j.opportunities ?? []); setLoaded(true);
  }, []);

  // Once companies exist, find their decision-makers and verified emails automatically.
  const runPipeline = useCallback(async () => {
    if (pipelineBusy.current) return;
    const status = await fetch("/api/contacts").then((r) => r.json()).catch(() => null);
    if (!status) return;
    const needContacts = (status.pending ?? 0) > 0;
    const needEmails = (status.pendingPriorityEmails ?? 0) > 0;
    if (!needContacts && !needEmails) { setPhase((p) => (p === "idle" ? "idle" : "done")); return; }

    pipelineBusy.current = true;
    try {
      if (needContacts) {
        setPhase("contacts"); setPhaseNote("Finding the decision-makers at each company");
        for (let i = 0; i < 60; i++) {
          const j = await fetch("/api/contacts/source", { method: "POST" }).then((r) => r.json());
          if (j.error) break;
          if (j.done || (j.remaining ?? 0) === 0) break;
          setPhaseNote(`Finding decision-makers · ${j.remaining} companies to go`);
          await new Promise((r) => setTimeout(r, 900));
        }
      }
      setPhase("emails"); setPhaseNote("Finding verified emails for your top people");
      for (let i = 0; i < 60; i++) {
        const j = await fetch("/api/contacts/enrich", { method: "POST" }).then((r) => r.json());
        if (j.error) break;
        if (j.done || (j.remaining ?? 0) === 0) break;
        setPhaseNote(`Finding verified emails · ${j.remaining} to go`);
        await new Promise((r) => setTimeout(r, 700));
      }
      setPhase("done"); setPhaseNote("Decision-makers and emails are ready on the Contacts tab");
    } finally {
      pipelineBusy.current = false;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const j = await fetch("/api/discovery/poll", { method: "POST" }).then((r) => r.json());
      const rem = j.remaining ?? 0;
      setRunning(rem);
      await load();
      if (rem > 0) timer.current = setTimeout(poll, 15000);
    } catch { timer.current = setTimeout(poll, 20000); }
  }, [load]);

  useEffect(() => { load(); poll(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load, poll]);

  // Kick the contact + email pipeline whenever we have companies and nothing is in flight.
  useEffect(() => {
    if (loaded && opps.length > 0 && !pipelineBusy.current) runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, opps.length, running]);

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

  const showPipeline = phase === "contacts" || phase === "emails" || phase === "done";

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{opps.length} companies with a reason to buy{running > 0 ? ` · ${running} search${running > 1 ? "es" : ""} running` : ""}.</p>
        </div>
        <div className="flex items-center gap-2">
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

      {showPipeline && (
        <div className="card p-3.5 mb-4">
          <div className="flex items-center gap-3">
            {phase === "done"
              ? <span className="inline-grid place-items-center h-5 w-5 rounded-full text-white text-xs" style={{ background: "var(--good)" }}>✓</span>
              : <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />}
            <span className="text-sm font-medium" style={phase === "done" ? { color: "var(--good)" } : undefined}>{phaseNote}</span>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <Stage on={true} label="Companies" />
            <Dash />
            <Stage on={phase === "contacts" || phase === "emails" || phase === "done"} label="Decision-makers" active={phase === "contacts"} />
            <Dash />
            <Stage on={phase === "emails" || phase === "done"} label="Verified emails" active={phase === "emails"} />
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      ) : opps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Turn on a signal and start a search to see companies here.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={sel.size === opps.length && opps.length > 0} onChange={toggleAll} className="accent-[var(--accent)]" /></th>
                <th>Company</th><th>Signal</th><th>What's happening</th><th>Confidence</th><th>Evidence</th>
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
