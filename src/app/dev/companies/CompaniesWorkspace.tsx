"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel,
  flexRender, createColumnHelper,
  type SortingState, type ColumnFiltersState, type VisibilityState, type ColumnOrderState,
  type RowSelectionState, type PaginationState, type FilterFn, type Table,
} from "@tanstack/react-table";
import {
  Search, X, ChevronUp, ChevronDown, ArrowUpDown, SlidersHorizontal, Columns3,
  ChevronLeft, ChevronRight, Download, Bookmark, ArrowUp, ArrowDown, Link2, ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/Popover";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/cn";
import { MOCK_COMPANIES, SITUATIONS, type MockCompany, type Confidence } from "./mock";

type Density = "compact" | "comfortable" | "spacious";
const DENSITY_PAD: Record<Density, string> = { compact: "py-1.5", comfortable: "py-3", spacious: "py-5" };
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const COL_LABELS: Record<string, string> = { company: "Company", situation: "Signal", whatHappened: "What happened", evidence: "Evidence", confidence: "Confidence", discoveredAt: "Discovered" };

// scalar value ∈ selected set
const inList: FilterFn<MockCompany> = (row, colId, value: string[]) =>
  !value?.length || value.includes(String(row.getValue(colId)));

const col = createColumnHelper<MockCompany>();

function fmtDate(iso: string) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CompaniesWorkspace() {
  const [sorting, setSorting] = useState<SortingState>([{ id: "confidence", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [density, setDensity] = useState<Density>("comfortable");
  const [loading, setLoading] = useState(false);

  // persist density locally (per-viewer convenience)
  useEffect(() => {
    try { const d = localStorage.getItem("hn_density") as Density | null; if (d) setDensity(d); } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem("hn_density", density); } catch { /* ignore */ } }, [density]);

  const columns = useMemo(() => [
    col.accessor("name", {
      id: "company", header: "Company", size: 240, enableHiding: false,
      filterFn: "includesString",
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
    col.accessor("situation", { id: "situation", header: "Signal", size: 170, filterFn: inList, cell: (c) => <span className="pill">{c.getValue()}</span> }),
    col.accessor("whatHappened", {
      id: "whatHappened", header: "What happened", size: 340, enableSorting: false,
      cell: (c) => <span className="text-[13px] line-clamp-2 [color:var(--muted)]">{c.getValue()}</span>,
    }),
    col.accessor("evidenceCount", {
      id: "evidence", header: "Evidence", size: 130,
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 text-[13px] [color:var(--muted)]">
          <Link2 size={13} style={{ color: "var(--faint)" }} /> {c.getValue()} sources
        </span>
      ),
    }),
    col.accessor("confidence", {
      id: "confidence", header: "Confidence", size: 130, filterFn: inList,
      sortingFn: (a, b) => CONF_RANK[a.original.confidence] - CONF_RANK[b.original.confidence],
      cell: (c) => <ConfidenceBadge confidence={c.getValue()} />,
    }),
    col.accessor("discoveredAt", { id: "discoveredAt", header: "Discovered", size: 120, cell: (c) => <span className="text-[13px] [color:var(--muted)] tabular-nums">{fmtDate(c.getValue())}</span> }),
  ], []);

  const table = useReactTable({
    data: MOCK_COMPANIES,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, columnOrder, rowSelection, pagination },
    filterFns: { inList },
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase();
      const r = row.original;
      return [r.name, r.domain, r.situation, r.whatHappened, r.industry].some((f) => f.toLowerCase().includes(q));
    },
    enableRowSelection: true,
    columnResizeMode: "onChange",
    getRowId: (r) => r.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const total = MOCK_COMPANIES.length;
  const selectedCount = Object.keys(rowSelection).filter((k) => rowSelection[k]).length;
  const pageRows = table.getRowModel().rows;
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => r.getIsSelected());

  // active filter chips
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (globalFilter) chips.push({ key: "q", label: `Search: "${globalFilter}"`, clear: () => setGlobalFilter("") });
  for (const f of columnFilters) {
    const vals = (f.value as string[]) ?? [];
    for (const v of vals) chips.push({ key: `${f.id}:${v}`, label: `${COL_LABELS[f.id] ?? f.id}: ${v}`, clear: () => table.getColumn(f.id)?.setFilterValue(vals.filter((x) => x !== v)) });
  }

  function selectAllFiltered() {
    const next: RowSelectionState = {};
    for (const r of table.getFilteredRowModel().rows) next[r.id] = true;
    setRowSelection(next);
  }
  const moreThanPage = filteredCount > pageRows.length;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 h-9 w-[260px] max-w-full focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <Search size={15} style={{ color: "var(--faint)" }} />
          <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search companies…" className="flex-1 bg-transparent text-sm outline-none placeholder:[color:var(--faint)]" aria-label="Search companies" />
          {globalFilter && <button onClick={() => setGlobalFilter("")} aria-label="Clear search" style={{ color: "var(--faint)" }}><X size={14} /></button>}
        </div>

        <FacetFilter table={table} columnId="situation" label="Signal" options={[...SITUATIONS]} />
        <FacetFilter table={table} columnId="confidence" label="Confidence" options={["high", "medium", "low"]} />

        <div className="flex-1" />

        <DensityControl value={density} onChange={setDensity} />
        <ColumnsMenu table={table} order={columnOrder} setOrder={setColumnOrder} />
        <Button variant="ghost" size="sm" onClick={() => setLoading((v) => !v)}>{loading ? "Show data" : "Preview loading"}</Button>
      </div>

      {/* ── Active filter chips + count ── */}
      <div className="flex items-center gap-2 flex-wrap min-h-[26px]">
        <span className="text-[13px] [color:var(--muted)] tabular-nums">{filteredCount === total ? `${total} companies` : `${filteredCount} of ${total} companies`}</span>
        {chips.length > 0 && <span className="[color:var(--border-strong)]">·</span>}
        {chips.map((c) => (
          <button key={c.key} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium [background:var(--surface-2)] border border-[var(--border)] hover:[border-color:var(--border-strong)] focus-ring">
            <ListFilter size={11} style={{ color: "var(--faint)" }} />{c.label}<X size={12} />
          </button>
        ))}
        {chips.length > 0 && (
          <button onClick={() => { setGlobalFilter(""); setColumnFilters([]); }} className="text-xs underline [color:var(--muted)] focus-ring rounded">Clear all</button>
        )}
      </div>

      {/* ── Bulk toolbar ── */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] px-3.5 py-2 [background:var(--accent-soft)] border border-[var(--accent-soft)]">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="font-semibold [color:var(--accent-ink)]">{selectedCount} selected</span>
            <button onClick={() => setRowSelection({})} className="text-xs underline [color:var(--muted)] focus-ring rounded">Clear</button>
            {allPageSelected && moreThanPage && selectedCount < filteredCount && (
              <button onClick={selectAllFiltered} className="text-xs font-semibold [color:var(--accent-ink)] focus-ring rounded">Select all {filteredCount} matching</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast.success(`Exported ${selectedCount} companies`, { description: "Prototype — no file was written." })}><Download size={14} /> Export</Button>
            <Button variant="primary" size="sm" onClick={() => toast.success(`Saved ${selectedCount} to a list`, { description: "Prototype — nothing was persisted." })}><Bookmark size={14} /> Save to list</Button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 0, minWidth: table.getCenterTotalSize() + 48 }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="sticky top-0 z-[1] w-10 px-3.5 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  <Checkbox
                    checked={allPageSelected ? true : pageRows.some((r) => r.getIsSelected()) ? "indeterminate" : false}
                    onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
                    aria-label="Select all on page"
                  />
                </th>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} scope="col" aria-sort={sorted ? (sorted === "desc" ? "descending" : "ascending") : "none"}
                      className="relative sticky top-0 z-[1] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.04em] whitespace-nowrap"
                      style={{ color: "var(--faint)", background: "var(--surface)", borderBottom: "1px solid var(--border)", width: header.getSize() }}>
                      {canSort ? (
                        <button onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 uppercase focus-ring rounded" style={{ color: sorted ? "var(--fg)" : "inherit" }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? <ChevronUp size={13} /> : sorted === "desc" ? <ChevronDown size={13} /> : <ArrowUpDown size={12} className="opacity-50" />}
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanResize() && (
                        <span onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
                          className={cn("absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none", header.column.getIsResizing() && "bg-[var(--accent)]")}
                          style={{ userSelect: "none" }} aria-hidden />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: pagination.pageSize }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border)" }}><Skeleton className="h-[18px] w-[18px] rounded-[6px]" /></td>
                  {table.getVisibleLeafColumns().map((c) => <td key={c.id} className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border)" }}><Skeleton className="h-4 w-24 rounded" /></td>)}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={table.getVisibleLeafColumns().length + 1} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-semibold">No companies match</span>
                  <span className="text-[13px] [color:var(--muted)]">Try clearing a filter or your search.</span>
                </div>
              </td></tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id} className="transition-colors hover:[background:var(--surface-2)]" style={{ background: row.getIsSelected() ? "var(--accent-soft)" : undefined }}>
                  <td className={cn("px-3.5 align-middle", DENSITY_PAD[density])} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} aria-label={`Select ${row.original.name}`} />
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3.5 align-middle", DENSITY_PAD[density])} style={{ borderBottom: "1px solid var(--border)", width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[13px] [color:var(--muted)]">
          <span>Rows per page</span>
          <select value={pagination.pageSize} onChange={(e) => table.setPageSize(Number(e.target.value))} className="h-8 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[13px] outline-none focus:border-[var(--accent)]">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 text-[13px] [color:var(--muted)]">
          <span className="tabular-nums">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft size={16} /></Button>
            <Button variant="secondary" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight size={16} /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Facet (column) filter: a Popover of checkboxes that sets a string[] filter value ──
function FacetFilter({ table, columnId, label, options }: { table: Table<MockCompany>; columnId: string; label: string; options: string[] }) {
  const column = table.getColumn(columnId);
  const value = (column?.getFilterValue() as string[]) ?? [];
  const toggle = (v: string) => column?.setFilterValue(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className={cn(value.length && "[border-color:var(--accent)] [color:var(--accent-ink)]")}>
          <SlidersHorizontal size={14} /> {label}{value.length > 0 && <span className="ml-1 rounded-full px-1.5 text-[11px] [background:var(--accent-soft)] [color:var(--accent-ink)]">{value.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5">
        <div className="flex flex-col">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:[background:var(--surface-2)] cursor-pointer capitalize">
              <Checkbox checked={value.includes(o)} onCheckedChange={() => toggle(o)} /> {o}
            </label>
          ))}
          {value.length > 0 && <button onClick={() => column?.setFilterValue(undefined)} className="mt-1 text-xs underline [color:var(--muted)] px-2 py-1 text-left focus-ring rounded">Clear {label.toLowerCase()}</button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Density control: a 3-way segmented control ──
function DensityControl({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const items: Density[] = ["compact", "comfortable", "spacious"];
  return (
    <div className="inline-flex rounded-[var(--radius)] p-0.5 gap-0.5 [background:var(--surface-2)]" role="group" aria-label="Row density">
      {items.map((d) => (
        <button key={d} onClick={() => onChange(d)} aria-pressed={value === d} title={`${d} rows`}
          className={cn("h-7 px-2.5 rounded-[7px] text-xs font-semibold capitalize transition-colors focus-ring", value === d ? "[background:var(--surface)] shadow-[var(--shadow-xs)] [color:var(--fg)]" : "[color:var(--muted)]")}>
          {d}
        </button>
      ))}
    </div>
  );
}

// ── Columns menu: show/hide + reorder (up/down) ──
function ColumnsMenu({ table, order, setOrder }: { table: Table<MockCompany>; order: ColumnOrderState; setOrder: (o: ColumnOrderState) => void }) {
  const cols = table.getAllLeafColumns();
  const currentOrder = order.length ? order : cols.map((c) => c.id);
  function move(id: string, dir: -1 | 1) {
    const ids = cols.map((c) => c.id);
    const ord = currentOrder.filter((x) => ids.includes(x));
    const i = ord.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    setOrder([...ord]);
  }
  const ordered = currentOrder.filter((id) => cols.some((c) => c.id === id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm"><Columns3 size={14} /> Columns</Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide [color:var(--faint)]">Columns</p>
        <div className="flex flex-col">
          {ordered.map((id, idx) => {
            const c = cols.find((x) => x.id === id)!;
            return (
              <div key={id} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:[background:var(--surface-2)]">
                <Checkbox checked={c.getIsVisible()} disabled={!c.getCanHide()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))} />
                <span className="flex-1">{COL_LABELS[id] ?? id}</span>
                <button onClick={() => move(id, -1)} disabled={idx === 0} className="disabled:opacity-30 focus-ring rounded p-0.5" aria-label={`Move ${id} up`}><ArrowUp size={13} /></button>
                <button onClick={() => move(id, 1)} disabled={idx === ordered.length - 1} className="disabled:opacity-30 focus-ring rounded p-0.5" aria-label={`Move ${id} down`}><ArrowDown size={13} /></button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
