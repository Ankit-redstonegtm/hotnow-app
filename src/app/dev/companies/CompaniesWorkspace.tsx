"use client";

// Dev prototype for the shared DataWorkspace, driven by mock data. The production
// Companies and Contacts screens use the same <DataWorkspace/> with real data.

import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef, type FilterFn } from "@tanstack/react-table";
import { Link2, Download, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { DataWorkspace, type Facet } from "@/components/ui/DataWorkspace";
import { toast } from "@/components/ui/Toaster";
import { fmtShortDate } from "@/lib/date";
import { MOCK_COMPANIES, SITUATIONS, type MockCompany } from "./mock";

const CONF_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const col = createColumnHelper<MockCompany>();
const inList: FilterFn<MockCompany> = (row, id, value) => !((value as string[])?.length) || (value as string[]).includes(String(row.getValue(id)));

export default function CompaniesWorkspace() {
  const [loading, setLoading] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<ColumnDef<MockCompany, any>[]>(() => [
    col.accessor("name", {
      id: "company", header: "Company", size: 240, enableHiding: false,
      cell: (c) => {
        const r = c.row.original;
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <CompanyAvatar name={r.name} domain={r.domain} size={30} logo />
            <div className="min-w-0 leading-tight">
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-xs truncate [color:var(--faint)]">{r.domain}</div>
            </div>
          </div>
        );
      },
    }),
    col.accessor("situation", { id: "situation", header: "Signal", size: 170, filterFn: inList, cell: (c) => <span className="pill">{c.getValue() as string}</span> }),
    col.accessor("whatHappened", { id: "whatHappened", header: "What happened", size: 340, enableSorting: false, cell: (c) => <span className="line-clamp-2 [color:var(--muted)]">{c.getValue() as string}</span> }),
    col.accessor("evidenceCount", {
      id: "evidence", header: "Evidence", size: 130,
      cell: (c) => <span className="inline-flex items-center gap-1.5 [color:var(--muted)]"><Link2 size={13} style={{ color: "var(--faint)" }} /> {c.getValue() as number} sources</span>,
    }),
    col.accessor("confidence", {
      id: "confidence", header: "Confidence", size: 130, filterFn: inList,
      sortingFn: (a, b) => (CONF_RANK[a.original.confidence] ?? 0) - (CONF_RANK[b.original.confidence] ?? 0),
      cell: (c) => <ConfidenceBadge confidence={c.getValue() as string} />,
    }),
    col.accessor("discoveredAt", { id: "discoveredAt", header: "Discovered", size: 120, cell: (c) => <span className="[color:var(--muted)] tabular-nums">{fmtShortDate(c.getValue() as string)}</span> }),
  ], []);

  const facets: Facet[] = [
    { columnId: "situation", label: "Signal", options: [...SITUATIONS].map((s) => ({ value: s })) },
    { columnId: "confidence", label: "Confidence", options: [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }] },
  ];

  const columnLabels = { company: "Company", situation: "Signal", whatHappened: "What happened", evidence: "Evidence", confidence: "Confidence", discoveredAt: "Discovered" };

  return (
    <DataWorkspace<MockCompany>
      columns={columns}
      data={MOCK_COMPANIES}
      getRowId={(r) => r.id}
      columnLabels={columnLabels}
      searchPlaceholder="Search companies…"
      searchText={(r) => `${r.name} ${r.domain} ${r.situation} ${r.whatHappened} ${r.industry}`}
      facets={facets}
      densityKey="hn_dev_companies_density"
      loading={loading}
      initialSorting={[{ id: "confidence", desc: true }]}
      countNoun="companies"
      toolbarExtra={<Button variant="ghost" size="sm" onClick={() => setLoading((v) => !v)}>{loading ? "Show data" : "Preview loading"}</Button>}
      bulkActions={({ rows, clear }) => (
        <>
          <Button variant="secondary" size="sm" onClick={() => toast.success(`Exported ${rows.length} companies`, { description: "Prototype — no file was written." })}><Download size={14} /> Export</Button>
          <Button variant="primary" size="sm" onClick={() => { toast.success(`Saved ${rows.length} to a list`, { description: "Prototype — nothing was persisted." }); clear(); }}><Bookmark size={14} /> Save to list</Button>
        </>
      )}
    />
  );
}
