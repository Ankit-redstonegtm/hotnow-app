"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper, type ColumnDef, type FilterFn } from "@tanstack/react-table";
import { Download, Bookmark } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import { EmailStatusBadge, PriorityBadge, type EmailStatus } from "@/components/ui/Badge";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Button } from "@/components/ui/Button";
import { DataWorkspace, type Facet } from "@/components/ui/DataWorkspace";
import { SaveListDialog } from "@/components/SaveListDialog";
import { describeJob, useEnrichmentJobs } from "@/components/useEnrichmentJobs";

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

const col = createColumnHelper<Contact>();
const inList: FilterFn<Contact> = (row, id, value) => !((value as string[])?.length) || (value as string[]).includes(String(row.getValue(id)));
const PRIO_RANK: Record<string, number> = { P1: 3, P2: 2, P3: 1 };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState(0);
  const [pendingEmails, setPendingEmails] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<{ open: boolean; ids: string[] }>({ open: false, ids: [] });
  const auto = useRef(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/contacts").then((r) => r.json());
    setContacts(j.contacts ?? []); setPending(j.pending ?? 0); setPendingEmails(j.pendingEmails ?? 0); setLoaded(true);
    return j;
  }, []);
  useEffect(() => { load(); }, [load]);

  // Enrichment runs in the background worker; this page starts it and shows progress.
  const jobs = useEnrichmentJobs(load);
  const working = !!jobs.active;
  const note = jobs.error ?? (jobs.active ? describeJob(jobs.active)
    : jobs.last?.status === "failed" || jobs.last?.status === "cancelled" ? describeJob(jobs.last)
    : jobs.last?.status === "completed" && pending === 0 && pendingEmails === 0 ? "Everyone is ready." : null);

  // If people still need finding, run the flow automatically the first time.
  useEffect(() => {
    if (loaded && !auto.current && pending > 0 && !jobs.active && jobs.last?.status !== "failed") { auto.current = true; run(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pending, jobs.last?.status]);

  // Queue the flow: find decision-makers, then work emails. Safe to call twice (idempotent).
  function run(allEmails: boolean) {
    if (working) return;
    void jobs.start(allEmails);
  }

  function exportCsv(rows: Contact[]) {
    const data = (rows.length ? rows : contacts).map((c) => ({
      name: c.full_name, title: c.title, priority: c.priority, email: c.email || "", company: c.companies?.name ?? "",
      domain: c.companies?.normalized_domain ?? "", linkedin: c.linkedin_url, job_level: c.job_level ?? "", job_function: c.job_function ?? "",
    }));
    downloadCSV(`hotnow-contacts-${new Date().toISOString().slice(0, 10)}`, data);
  }

  const withEmail = contacts.filter((c) => c.email).length;

  const facets: Facet[] = useMemo(() => [
    { columnId: "priority", label: "Priority", options: [{ value: "P1" }, { value: "P2" }, { value: "P3" }] },
    { columnId: "email", label: "Email", options: [{ value: "verified", label: "Verified" }, { value: "found", label: "Found" }, { value: "none", label: "None" }, { value: "unknown", label: "Unknown" }] },
  ], []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<ColumnDef<Contact, any>[]>(() => [
    col.accessor((c) => c.full_name, {
      id: "name", header: "Name", size: 210, enableHiding: false,
      cell: (c) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <CompanyAvatar name={c.row.original.full_name || "?"} size={28} />
          <span className="font-semibold truncate">{c.getValue() as string}</span>
        </div>
      ),
    }),
    col.accessor((c) => c.title, {
      id: "title", header: "Title", size: 240,
      cell: (c) => <span className="truncate [color:var(--muted)] block" style={{ maxWidth: 260 }}>{c.getValue() as string}</span>,
    }),
    col.accessor((c) => c.priority, {
      id: "priority", header: "Priority", size: 110, filterFn: inList,
      sortingFn: (a, b) => (PRIO_RANK[a.original.priority] ?? 0) - (PRIO_RANK[b.original.priority] ?? 0),
      cell: (c) => (c.getValue() ? <PriorityBadge priority={c.getValue() as string} /> : <span className="pill">—</span>),
    }),
    col.accessor((c) => String(emailStatusOf(c) ?? "unknown"), {
      id: "email", header: "Email", size: 170, filterFn: inList,
      cell: (c) => {
        const row = c.row.original;
        return (
          <div className="flex flex-col gap-1 items-start">
            <EmailStatusBadge status={emailStatusOf(row)} checking={working && emailStatusOf(row) === "unknown"} />
            {row.email && <a href={`mailto:${row.email}`} className="text-xs underline [color:var(--accent-ink)]">{row.email}</a>}
          </div>
        );
      },
    }),
    col.accessor((c) => c.companies?.name || c.companies?.normalized_domain || "", {
      id: "company", header: "Company", size: 180,
      cell: (c) => <span className="truncate block">{c.getValue() as string}</span>,
    }),
    col.accessor((c) => c.linkedin_url, {
      id: "linkedin", header: "LinkedIn", size: 110, enableSorting: false,
      cell: (c) => (c.getValue() ? <a href={c.getValue() as string} target="_blank" rel="noreferrer" className="text-xs underline [color:var(--accent-ink)]">profile ↗</a> : <span className="text-xs [color:var(--faint)]">—</span>),
    }),
  ], [working]);

  const columnLabels = { name: "Name", title: "Title", priority: "Priority", email: "Email", company: "Company", linkedin: "LinkedIn" };
  const primaryLabel = working ? "Working…" : pending > 0 ? `Find decision-makers (${pending})` : pendingEmails > 0 ? `Find all emails (${pendingEmails})` : "All found";

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Decision-makers at your companies, ranked by priority{withEmail > 0 ? ` · ${withEmail} with a work email` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => exportCsv(contacts)} disabled={!contacts.length}><Download size={14} /> Export</Button>
          <Button variant="secondary" size="sm" onClick={() => setSave({ open: true, ids: contacts.map((c) => c.id) })} disabled={!contacts.length}><Bookmark size={14} /> Save as list</Button>
          <Button variant="primary" size="sm" onClick={() => run(true)} loading={working} disabled={working || (pending === 0 && pendingEmails === 0)}>
            {primaryLabel}
          </Button>
        </div>
      </div>

      {(note || working) && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          {working && <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />}
          <span className="text-sm" style={{ color: "var(--accent-ink)" }}>{note}</span>
          {working && <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void jobs.cancel()}>Stop</Button>}
        </div>
      )}

      {loaded && contacts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No contacts yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {pending > 0 ? "We are finding the decision-makers at your companies now." : "Find companies first, then we bring you the people to reach."}
          </p>
        </div>
      ) : (
        <DataWorkspace<Contact>
          columns={columns}
          data={contacts}
          getRowId={(c) => c.id}
          columnLabels={columnLabels}
          searchPlaceholder="Search people, titles, companies…"
          searchText={(c) => `${c.full_name} ${c.title} ${c.companies?.name ?? ""} ${c.email ?? ""}`}
          facets={facets}
          densityKey="hn_contacts_density"
          loading={!loaded}
          initialSorting={[{ id: "priority", desc: true }]}
          countNoun="contacts"
          emptyTitle="No contacts match"
          emptyDescription="Try a different priority, email status, or search."
          bulkActions={({ rows, clear }) => (
            <>
              <Button variant="secondary" size="sm" onClick={() => exportCsv(rows)}><Download size={14} /> Export</Button>
              <Button variant="primary" size="sm" onClick={() => { setSave({ open: true, ids: rows.map((c) => c.id) }); clear(); }}><Bookmark size={14} /> Save to list</Button>
            </>
          )}
        />
      )}

      <SaveListDialog
        open={save.open}
        onOpenChange={(v) => setSave((s) => ({ ...s, open: v }))}
        kind="contacts"
        ids={save.ids}
        defaultName="Decision-makers"
      />
    </div>
  );
}
