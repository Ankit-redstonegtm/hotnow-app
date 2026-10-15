"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createColumnHelper, type ColumnDef, type FilterFn } from "@tanstack/react-table";
import { Download, Bookmark, Link2 } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { Button } from "@/components/ui/Button";
import { DataWorkspace, type Facet } from "@/components/ui/DataWorkspace";
import { SaveListDialog } from "@/components/SaveListDialog";
import { fmtShortDate } from "@/lib/date";

type Opp = {
  id: string; what_happened: string; why_it_matters: string; confidence: string; evidence_date: string | null; status: string;
  first_discovered_at?: string | null;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence: { source_url: string; source_date: string | null }[];
};

type Phase = "idle" | "contacts" | "emails" | "done";

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const col = createColumnHelper<Opp>();
const inList: FilterFn<Opp> = (row, id, value) => !((value as string[])?.length) || (value as string[]).includes(String(row.getValue(id)));

function stop(e: React.MouseEvent) { e.stopPropagation(); }

export default function CompaniesPage() {
  const router = useRouter();
  const [opps, setOpps] = useState<Opp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseNote, setPhaseNote] = useState("");
  const [save, setSave] = useState<{ open: boolean; ids: string[] }>({ open: false, ids: [] });
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
      setPhase("emails"); setPhaseNote("Finding work emails for your top people");
      for (let i = 0; i < 60; i++) {
        const j = await fetch("/api/contacts/enrich", { method: "POST" }).then((r) => r.json());
        if (j.error) break;
        if (j.done || (j.remaining ?? 0) === 0) break;
        setPhaseNote(`Finding emails · ${j.remaining} to go`);
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

  function exportCsv(rows: Opp[]) {
    const data = (rows.length ? rows : opps).map((o) => ({
      company: o.companies?.name ?? "", domain: o.companies?.normalized_domain ?? "",
      signal: o.buying_situations?.name ?? "", what_happened: o.what_happened,
      why_it_matters: o.why_it_matters, confidence: o.confidence, evidence_date: o.evidence_date ?? "",
      source: o.evidence?.[0]?.source_url ?? "",
    }));
    downloadCSV(`hotnow-companies-${new Date().toISOString().slice(0, 10)}`, data);
  }

  const facets: Facet[] = useMemo(() => {
    const situations = Array.from(new Set(opps.map((o) => o.buying_situations?.name).filter(Boolean))) as string[];
    return [
      { columnId: "signal", label: "Signal", options: situations.map((s) => ({ value: s })) },
      { columnId: "confidence", label: "Confidence", options: [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }] },
    ];
  }, [opps]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<ColumnDef<Opp, any>[]>(() => [
    col.accessor((o) => o.companies?.name || o.companies?.normalized_domain || "", {
      id: "company", header: "Company", size: 240, enableHiding: false,
      cell: (c) => {
        const o = c.row.original;
        const name = o.companies?.name || o.companies?.normalized_domain || "Unknown";
        const domain = o.companies?.normalized_domain;
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <CompanyAvatar name={name} domain={domain} size={30} logo />
            <div className="min-w-0 leading-tight">
              <div className="font-semibold truncate flex items-center gap-2">{name}{o.status === "new" && <span className="chip">New</span>}</div>
              {domain && <a href={`https://${domain}`} target="_blank" rel="noreferrer" onClick={stop} className="text-xs truncate [color:var(--faint)] hover:underline">{domain} ↗</a>}
            </div>
          </div>
        );
      },
    }),
    col.accessor((o) => o.buying_situations?.name ?? "", {
      id: "signal", header: "Signal", size: 170, filterFn: inList,
      cell: (c) => (c.getValue() ? <span className="pill">{c.getValue() as string}</span> : null),
    }),
    col.accessor((o) => o.what_happened, {
      id: "whatHappened", header: "What's happening", size: 340, enableSorting: false,
      cell: (c) => <span className="line-clamp-2 [color:var(--muted)]">{c.getValue() as string}</span>,
    }),
    col.accessor((o) => o.confidence, {
      id: "confidence", header: "Confidence", size: 130, filterFn: inList,
      sortingFn: (a, b) => (CONF_RANK[a.original.confidence] ?? 0) - (CONF_RANK[b.original.confidence] ?? 0),
      cell: (c) => <ConfidenceBadge confidence={c.getValue() as string} />,
    }),
    col.accessor((o) => o.evidence?.length ?? 0, {
      id: "evidence", header: "Evidence", size: 150,
      cell: (c) => {
        const ev = c.row.original.evidence ?? [];
        if (!ev.length) return <span className="text-[13px] [color:var(--faint)]">—</span>;
        return (
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[13px] [color:var(--muted)]"><Link2 size={13} style={{ color: "var(--faint)" }} />{ev.length}</span>
            <a href={ev[0].source_url} target="_blank" rel="noreferrer" onClick={stop} className="text-[13px] underline [color:var(--accent-ink)]">source ↗</a>
          </span>
        );
      },
    }),
    col.accessor((o) => o.first_discovered_at ?? o.evidence_date ?? "", {
      id: "discovered", header: "Discovered", size: 120,
      cell: (c) => <span className="text-[13px] [color:var(--muted)] tabular-nums">{fmtShortDate(c.getValue() as string)}</span>,
    }),
  ], []);

  const columnLabels = { company: "Company", signal: "Signal", whatHappened: "What's happening", confidence: "Confidence", evidence: "Evidence", discovered: "Discovered" };
  const showPipeline = phase === "contacts" || phase === "emails" || phase === "done";

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {opps.length} companies with a reason to buy{running > 0 ? ` · ${running} search${running > 1 ? "es" : ""} running` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => exportCsv(opps)} disabled={!opps.length}><Download size={14} /> Export</Button>
          <Button variant="primary" size="sm" onClick={() => setSave({ open: true, ids: opps.map((o) => o.id) })} disabled={!opps.length}><Bookmark size={14} /> Save as list</Button>
        </div>
      </div>

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
          <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
            <Stage on={true} label="Companies" />
            <Dash />
            <Stage on={phase === "contacts" || phase === "emails" || phase === "done"} label="Decision-makers" active={phase === "contacts"} />
            <Dash />
            <Stage on={phase === "emails" || phase === "done"} label="Emails" active={phase === "emails"} />
          </div>
        </div>
      )}

      {opps.length === 0 && loaded ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No companies yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Turn on a signal and start a search to see companies here.</p>
        </div>
      ) : (
        <DataWorkspace<Opp>
          columns={columns}
          data={opps}
          getRowId={(o) => o.id}
          columnLabels={columnLabels}
          onRowClick={(o) => router.push(`/dashboard/companies/${o.id}`)}
          searchPlaceholder="Search companies, signals…"
          searchText={(o) => `${o.companies?.name ?? ""} ${o.companies?.normalized_domain ?? ""} ${o.buying_situations?.name ?? ""} ${o.what_happened}`}
          facets={facets}
          densityKey="hn_companies_density"
          loading={!loaded}
          initialSorting={[{ id: "confidence", desc: true }]}
          countNoun="companies"
          emptyTitle="No companies match"
          emptyDescription="Try clearing a filter or your search."
          bulkActions={({ rows, clear }) => (
            <>
              <Button variant="secondary" size="sm" onClick={() => exportCsv(rows)}><Download size={14} /> Export</Button>
              <Button variant="primary" size="sm" onClick={() => { setSave({ open: true, ids: rows.map((o) => o.id) }); clear(); }}><Bookmark size={14} /> Save to list</Button>
            </>
          )}
        />
      )}

      <SaveListDialog
        open={save.open}
        onOpenChange={(v) => setSave((s) => ({ ...s, open: v }))}
        kind="companies"
        ids={save.ids}
        defaultName="Hot companies"
      />
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
