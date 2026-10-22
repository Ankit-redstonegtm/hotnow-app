"use client";
import { useActivity } from "@/components/ActivityProvider";
import SaveListDialog from "@/components/SaveListDialog";
import { apiFetch, apiJson } from "@/lib/workspace";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { downloadCSV } from "@/lib/csv";

type Contact = {
  id: string; full_name: string; title: string; linkedin_url: string; priority: string; email: string | null;
  job_level: string | null; job_function: string | null;
  companies: { normalized_domain: string; name: string } | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState(0);
  const [pendingEmails, setPendingEmails] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [listOpen, setListOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { data, workspaceId, refresh } = useActivity();
  const working = requesting || (data?.items || []).some(i => i.workspaceId === workspaceId && ["contacts", "emails"].includes(i.kind) && ["queued", "running", "retrying"].includes(i.status));

  const load = useCallback(async () => {
    try {
      const j = await apiJson("/api/contacts");
      setContacts(j.contacts ?? []); setPending(j.pending ?? 0); setPendingEmails(j.pendingEmails ?? 0);
      setError(null); return j;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load contacts"); return null; }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void load(); }, [load, data?.observedAt]);

  async function run(allEmails: boolean) {
    if (working) return;
    setWorking(true); setNote(null);
    try {
      await apiJson(pending > 0 ? "/api/contacts/source" : "/api/contacts/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: allEmails }) });
      setNote("Task queued. You can leave this page; progress and results are saved automatically.");
      await refresh();
    } catch (error) { setNote(error instanceof Error ? error.message : "Could not start enrichment"); }
    finally { setWorking(false); }
  }

  const shown = contacts.filter((c) => filter === "all" || c.priority === filter);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = () => (sel.size ? shown.filter((c) => sel.has(c.id)) : shown);

  function exportCsv() {
    downloadCSV(`hotnow-contacts-${new Date().toISOString().slice(0, 10)}`, chosen().map((c) => ({
      name: c.full_name, title: c.title, priority: c.priority, email: c.email || "", company: c.companies?.name ?? "",
      domain: c.companies?.normalized_domain ?? "", linkedin: c.linkedin_url, job_level: c.job_level ?? "", job_function: c.job_function ?? "",
    })));
  }
  function saveList() { setListOpen(true); }

  const counts = { P1: contacts.filter((c) => c.priority === "P1").length, P2: contacts.filter((c) => c.priority === "P2").length, P3: contacts.filter((c) => c.priority === "P3").length };
  const withEmail = contacts.filter((c) => c.email).length;

  return (
    <div>
      <SaveListDialog open={listOpen} onClose={() => setListOpen(false)} kind="contacts" ids={chosen().map(item => item.id)} onSaved={setNote} />
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Decision-makers at your companies, ranked by priority{withEmail > 0 ? ` · ${withEmail} with emails found` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={saveList} disabled={!shown.length}>Save as list</button>
          <button className="btn btn-primary btn-sm" onClick={() => run(true)} disabled={working || (pending === 0 && pendingEmails === 0)}>
            {working ? "Working…" : pending > 0 ? `Find decision-makers (${pending})` : pendingEmails > 0 ? `Find all emails (${pendingEmails})` : contacts.length ? "All found" : "No contacts yet"}
          </button>
        </div>
      </div>

      {(note || working) && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          {working && <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />}
          <span className="text-sm" style={{ color: "var(--accent-ink)" }}>{note} {working && <Link href="/dashboard#parallel-activity" className="underline ml-2">View live activity →</Link>}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        {(["all", "P1", "P2", "P3"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="pill" style={filter === f ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" } : undefined}>
            {f === "all" ? `All (${contacts.length})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {error ? <div role="alert" className="card p-4">{error}</div> : !loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      ) : contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No contacts yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {pending > 0 ? "Start a background lookup to find decision-makers at your companies." : "Find companies first, then we bring you the people to reach."}
          </p>
          <Link href="/dashboard/companies" className="btn btn-primary mt-4">View companies</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th style={{ width: 36 }}></th><th>Name</th><th>Title</th><th>Priority</th><th>Email</th><th>Company</th><th>LinkedIn</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" aria-label={`Select ${c.full_name}`} checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--accent)]" /></td>
                  <td className="font-medium">{c.full_name}</td>
                  <td style={{ color: "var(--muted)", maxWidth: 280 }} className="truncate">{c.title}</td>
                  <td><span className={`pill pill-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                  <td>
                    {c.email
                      ? <a href={`mailto:${c.email}`} className="text-xs underline" style={{ color: "var(--accent-ink)" }}>{c.email}</a>
                      : <span className="text-xs" style={{ color: "var(--faint)" }}>{c.email === null ? "not checked" : "no email found"}</span>}
                  </td>
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
