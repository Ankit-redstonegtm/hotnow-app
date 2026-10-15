"use client";

import { useState } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ConfidenceBadge } from "@/components/ui/Badge";

// SAMPLE DATA — fabricated companies/signals for the gallery only. No fetch, no API.
type SampleCompany = { id: string; name: string; domain: string; signal: string; confidence: "high" | "medium" | "low"; sources: number };

const SAMPLE: SampleCompany[] = [
  { id: "c1", name: "SPOTIO", domain: "spotio.com", signal: "Hiring 4 AEs", confidence: "high", sources: 5 },
  { id: "c2", name: "Northwind Logistics", domain: "northwind.com", signal: "New VP Sales", confidence: "high", sources: 4 },
  { id: "c3", name: "Brightwave Retail", domain: "brightwave.co", signal: "Series B raised", confidence: "medium", sources: 6 },
  { id: "c4", name: "Power Home Remodeling", domain: "powerhrg.com", signal: "Opened 2 offices", confidence: "medium", sources: 3 },
  { id: "c5", name: "Cedar & Oak Co", domain: "cedaroak.com", signal: "Launched outbound", confidence: "low", sources: 2 },
  { id: "c6", name: "Meridian Health", domain: "meridianhealth.io", signal: "Hiring SDR lead", confidence: "high", sources: 7 },
  { id: "c7", name: "Fathom Analytics", domain: "usefathom.dev", signal: "Switched CRM", confidence: "medium", sources: 3 },
  { id: "c8", name: "Harbor Freight Depot", domain: "harbordepot.com", signal: "Expanding territory", confidence: "low", sources: 2 },
];

const CONF_RANK: Record<SampleCompany["confidence"], number> = { high: 3, medium: 2, low: 1 };

const columns: DataColumn<SampleCompany>[] = [
  {
    id: "name", header: "Company", sortable: true, sortValue: (c) => c.name.toLowerCase(), searchText: (c) => `${c.name} ${c.domain}`,
    cell: (c) => (
      <div className="flex items-center gap-3">
        <CompanyAvatar name={c.name} domain={c.domain} size={32} />
        <div className="flex flex-col leading-tight">
          <span className="font-semibold">{c.name}</span>
          <span className="text-xs [color:var(--faint)]">{c.domain}</span>
        </div>
      </div>
    ),
  },
  { id: "signal", header: "Signal", sortable: true, sortValue: (c) => c.signal, searchText: (c) => c.signal, cell: (c) => <span className="pill">{c.signal}</span> },
  { id: "confidence", header: "Confidence", sortable: true, sortValue: (c) => CONF_RANK[c.confidence], searchText: (c) => c.confidence, cell: (c) => <ConfidenceBadge confidence={c.confidence} /> },
  {
    id: "evidence", header: "Evidence", sortable: true, sortValue: (c) => c.sources,
    cell: (c) => (
      <div className="flex items-center gap-2">
        <span className="text-[13px] [color:var(--muted)]">{c.sources} sources</span>
        <a href="#" onClick={(e) => { e.preventDefault(); console.log("[sample] view evidence", c.name); }} className="text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>View</a>
      </div>
    ),
  },
];

export default function DataSection() {
  const [selected, setSelected] = useState<SampleCompany[]>([]);
  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">Companies — sortable, searchable, selectable</h3><span className="pill">Sample data</span></div>
        <p className="mb-3 text-xs [color:var(--faint)]">Click a header to sort; search filters across visible text; select rows for the bulk bar.{selected.length ? ` — ${selected.length} selected` : ""}</p>
        <DataTable<SampleCompany>
          columns={columns}
          data={SAMPLE}
          getRowId={(r) => r.id}
          enableSelection
          searchable
          searchPlaceholder="Search companies, signals…"
          initialSort={[{ id: "name", desc: false }]}
          onSelectionChange={setSelected}
          selectionActions={(rows) => (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => console.log("[sample] Save as list", rows.map((r) => r.name))}>Save as list</button>
          )}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">Loading</h3><span className="pill">Sample data</span></div>
        <DataTable<SampleCompany> columns={columns} data={[]} enableSelection loading skeletonRows={5} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">Empty</h3><span className="pill">Sample data</span></div>
        <DataTable<SampleCompany> columns={columns} data={[]} enableSelection searchable
          emptyState={<div className="flex flex-col items-center gap-1 py-2"><span className="font-semibold">No companies yet</span><span className="text-[13px] [color:var(--muted)]">Signals you discover will show up here.</span></div>}
        />
      </div>
    </div>
  );
}
