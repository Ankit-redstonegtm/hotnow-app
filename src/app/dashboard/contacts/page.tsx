"use client";
import { useCallback, useEffect, useState } from "react";
import { downloadCSV } from "@/lib/csv";

type Contact = {
  id: string; full_name: string; title: string; linkedin_url: string; priority: string;
  job_level: string | null; job_function: string | null;
  companies: { normalized_domain: string; name: string } | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [sourcing, setSourcing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const j = await fetch("/api/contacts").then((r) => r.json());
    setContacts(j.contacts ?? []); setPending(j.pending ?? 0); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function source() {
    setSourcing(true); setMsg("Finding decision-makers via Blitz…");
    const loop = async () => {
      const j = await fetch("/api/contacts/source", { method: "POST" }).then((r) => r.json());
      if (j.error) { setMsg(j.error); setSourcing(false); return; }
      await load();
      if (!j.done && j.remaining > 0) { setMsg(`Sourced a batch (+${j.contacts}). ${j.remaining} companies left…`); setTimeout(loop, 1000); }
      else { setMsg("Done sourcing decision-makers."); setSourcing(false); }
    };
    loop();
  }

  const shown = contacts.filter((c) => filter === "all" || c.priority === filter);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = () => (sel.size ? shown.filter((c) => sel.has(c.id)) : shown);

  function exportCsv() {
    downloadCSV(`hotnow-contacts-${new Date().toISOString().slice(0, 10)}`, chosen().map((c) => ({
      name: c.full_name, title: c.title, priority: c.priority, company: c.companies?.name ?? "",
      domain: c.companies?.normalized_domain ?? "", linkedin: c.linkedin_url, job_level: c.job_level ?? "", job_function: c.job_function ?? "",
    })));
  }
  async function saveList() {
    const name = window.prompt("Name this contact list", "Decision-makers"); if (!name) return;
    const r = await fetch("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kind: "contacts", contactIds: chosen().map((c) => c.id) }) });
    const j = await r.json(); setMsg(r.ok ? `Saved "${name}" (${j.added} contacts).` : j.error);
  }

  const counts = { P1: contacts.filter((c) => c.priority === "P1").length, P2: contacts.filter((c) => c.priority === "P2").length, P3: contacts.filter((c) => c.priority === "P3").length };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Decision-makers at your companies, ranked by priority.{pending > 0 ? ` ${pending} companies not yet sourced.` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={saveList} disabled={!shown.length}>Save as list</button>
          <button className="btn btn-primary btn-sm" onClick={source} disabled={sourcing || pending === 0}>{sourcing ? "Sourcing…" : pending > 0 ? `Find decision-makers (${pending})` : "All sourced"}</button>
        </div>
      </div>

      {msg && <div className="card p-3 mb-4 text-sm" style={{ color: "var(--accent-ink)" }}>{msg}</div>}

      <div className="flex items-center gap-2 mb-4">
        {(["all", "P1", "P2", "P3"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="pill" style={filter === f ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" } : undefined}>
            {f === "all" ? `All (${contacts.length})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      ) : contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No contacts yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Source decision-makers for your discovered companies with Blitz.</p>
          <button className="btn btn-primary mt-4" onClick={source} disabled={sourcing || pending === 0}>{pending > 0 ? `Find decision-makers (${pending})` : "Discover companies first"}</button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th style={{ width: 36 }}></th><th>Name</th><th>Title</th><th>Priority</th><th>Company</th><th>LinkedIn</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--accent)]" /></td>
                  <td className="font-medium">{c.full_name}</td>
                  <td style={{ color: "var(--muted)", maxWidth: 320 }} className="truncate">{c.title}</td>
                  <td><span className={`pill pill-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                  <td>{c.companies?.name || c.companies?.normalized_domain}</td>
                  <td>{c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent-ink)" }}>profile ↗</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
