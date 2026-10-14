"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadCSV } from "@/lib/csv";
import { EmailStatusBadge, type EmailStatus } from "@/components/ui/Badge";

type Contact = {
  id: string; full_name: string; title: string; linkedin_url: string; priority: string; email: string | null;
  email_status?: EmailStatus;
  job_level: string | null; job_function: string | null;
  companies: { normalized_domain: string; name: string } | null;
};

/** Trust the backend status; fall back only when it's absent. Never upgrade to "verified". */
function emailStatusOf(c: Contact): EmailStatus {
  if (c.email_status != null) return c.email_status;
  if (c.email) return "found";
  if (c.email === "") return "none";
  return "unknown";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState(0);
  const [pendingEmails, setPendingEmails] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const auto = useRef(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/contacts").then((r) => r.json());
    setContacts(j.contacts ?? []); setPending(j.pending ?? 0); setPendingEmails(j.pendingEmails ?? 0); setLoaded(true);
    return j;
  }, []);
  useEffect(() => { load(); }, [load]);

  // If people still need finding, run the flow automatically the first time.
  useEffect(() => {
    if (loaded && !auto.current && (pending > 0)) { auto.current = true; run(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pending]);

  // run the flow: find decision-makers, then verified emails.
  async function run(allEmails: boolean) {
    if (working) return;
    setWorking(true);
    try {
      if (pending > 0) {
        setNote("Finding the decision-makers at each company");
        for (let i = 0; i < 60; i++) {
          const j = await fetch("/api/contacts/source", { method: "POST" }).then((r) => r.json());
          if (j.error) { setNote(j.error); setWorking(false); return; }
          await load();
          if (j.done || (j.remaining ?? 0) === 0) break;
          setNote(`Finding decision-makers · ${j.remaining} companies to go`);
          await new Promise((r) => setTimeout(r, 900));
        }
      }
      setNote("Finding verified emails");
      for (let i = 0; i < 80; i++) {
        const j = await fetch("/api/contacts/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(allEmails ? { all: true } : {}) }).then((r) => r.json());
        if (j.error) { setNote(j.error); break; }
        await load();
        if (j.done || (j.remaining ?? 0) === 0) break;
        setNote(`Finding verified emails · ${j.remaining} to go`);
        await new Promise((r) => setTimeout(r, 700));
      }
      setNote("Everyone is ready.");
    } finally { setWorking(false); }
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
  async function saveList() {
    const name = window.prompt("Name this contact list", "Decision-makers"); if (!name) return;
    const r = await fetch("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kind: "contacts", contactIds: chosen().map((c) => c.id) }) });
    const j = await r.json(); setNote(r.ok ? `Saved "${name}" (${j.added} contacts).` : j.error);
  }

  const counts = { P1: contacts.filter((c) => c.priority === "P1").length, P2: contacts.filter((c) => c.priority === "P2").length, P3: contacts.filter((c) => c.priority === "P3").length };
  const withEmail = contacts.filter((c) => c.email).length;

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Decision-makers at your companies, ranked by priority{withEmail > 0 ? ` · ${withEmail} with verified emails` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={saveList} disabled={!shown.length}>Save as list</button>
          <button className="btn btn-primary btn-sm" onClick={() => run(true)} disabled={working || (pending === 0 && pendingEmails === 0)}>
            {working ? "Working…" : pending > 0 ? `Find decision-makers (${pending})` : pendingEmails > 0 ? `Find all emails (${pendingEmails})` : "All found"}
          </button>
        </div>
      </div>

      {(note || working) && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          {working && <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />}
          <span className="text-sm" style={{ color: "var(--accent-ink)" }}>{note}</span>
        </div>
      )}

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
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {pending > 0 ? "We are finding the decision-makers at your companies now." : "Find companies first, then we bring you the people to reach."}
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th style={{ width: 36 }}></th><th>Name</th><th>Title</th><th>Priority</th><th>Email</th><th>Company</th><th>LinkedIn</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--accent)]" /></td>
                  <td className="font-medium">{c.full_name}</td>
                  <td style={{ color: "var(--muted)", maxWidth: 280 }} className="truncate">{c.title}</td>
                  <td><span className={`pill pill-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                  <td>
                    <div className="flex flex-col gap-1 items-start">
                      <EmailStatusBadge status={emailStatusOf(c)} checking={working && !c.email} />
                      {c.email && <a href={`mailto:${c.email}`} className="text-xs underline" style={{ color: "var(--accent-ink)" }}>{c.email}</a>}
                    </div>
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
