"use client";

// Reusable premium data workspace built on TanStack Table v8.
// Powers the Companies and Contacts screens (and the /dev/companies prototype).
// Encapsulates: global search, faceted filters with active chips, sortable /
// resizable / reorderable / hideable columns, compact/comfortable/spacious density
// (persisted per-viewer), row selection with select-all-matching, a contextual bulk
// toolbar, pagination, loading + empty states, keyboard-accessible controls.
// It is purely presentational — all data, columns, and actions come from props.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel,
  flexRender,
  type ColumnDef, type SortingState, type ColumnFiltersState, type VisibilityState,
  type ColumnOrderState, type RowSelectionState, type PaginationState, type FilterFn, type Table,
} from "@tanstack/react-table";
import {
  Search, X, ChevronUp, ChevronDown, ArrowUpDown, SlidersHorizontal, Columns3,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/Popover";
import { cn } from "@/lib/cn";

export type Density = "compact" | "comfortable" | "spacious";
const DENSITY_PAD: Record<Density, string> = { compact: "py-1.5", comfortable: "py-3", spacious: "py-5" };

export interface Facet {
  columnId: string;
  label: string;
  options: Array<{ value: string; label?: string }>;
}

export interface DataWorkspaceProps<T> {
  // TanStack column defs are invariant in their value type; `any` matches useReactTable's own signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Column labels for the chips + columns menu, keyed by column id. */
  columnLabels: Record<string, string>;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  /** Searched fields; receives a row and returns the text to match globally. */
  searchText: (row: T) => string;
  facets?: Facet[];
  /** Renders the bulk toolbar buttons when rows are selected. */
  bulkActions?: (ctx: { rows: T[]; clear: () => void }) => ReactNode;
  /** Extra controls on the right of the toolbar (e.g. a refresh button). */
  toolbarExtra?: ReactNode;
  densityKey: string;
  loading?: boolean;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  initialSorting?: SortingState;
  countNoun?: string;
}

/** scalar cell value ∈ selected set */
const inList: FilterFn<unknown> = (row, colId, value: string[]) =>
  !value?.length || value.includes(String(row.getValue(colId)));

export function DataWorkspace<T>({
  columns, data, getRowId, columnLabels, onRowClick, searchPlaceholder = "Search…",
  searchText, facets = [], bulkActions, toolbarExtra, densityKey, loading, pageSize = 10,
  emptyTitle = "Nothing matches", emptyDescription = "Try clearing a filter or your search.",
  initialSorting = [], countNoun = "rows",
}: DataWorkspaceProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    try { const d = localStorage.getItem(densityKey) as Density | null; if (d) setDensity(d); } catch { /* ignore */ }
  }, [densityKey]);
  useEffect(() => { try { localStorage.setItem(densityKey, density); } catch { /* ignore */ } }, [densityKey, density]);

  const table = useReactTable<T>({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, columnOrder, rowSelection, pagination },
    filterFns: { inList },
    globalFilterFn: (row, _id, value) => searchText(row.original).toLowerCase().includes(String(value).toLowerCase()),
    enableRowSelection: true,
    columnResizeMode: "onChange",
    getRowId: (r) => getRowId(r),
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
  const total = data.length;
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedCount = selectedIds.length;
  const selectedRows = useMemo(
    () => table.getFilteredRowModel().rows.filter((r) => rowSelection[r.id]).map((r) => r.original),
    [table, rowSelection, columnFilters, globalFilter, data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pageRows = table.getRowModel().rows;
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => r.getIsSelected());
  const moreThanPage = filteredCount > pageRows.length;

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (globalFilter) chips.push({ key: "q", label: `Search: "${globalFilter}"`, clear: () => setGlobalFilter("") });
  for (const f of columnFilters) {
    const vals = (f.value as string[]) ?? [];
    const facet = facets.find((x) => x.columnId === f.id);
    for (const v of vals) {
      const optLabel = facet?.options.find((o) => o.value === v)?.label ?? v;
      chips.push({
        key: `${f.id}:${v}`,
        label: `${columnLabels[f.id] ?? f.id}: ${optLabel}`,
        clear: () => table.getColumn(f.id)?.setFilterValue(vals.filter((x) => x !== v)),
      });
    }
  }

  function selectAllFiltered() {
    const next: RowSelectionState = {};
    for (const r of table.getFilteredRowModel().rows) next[r.id] = true;
    setRowSelection(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 h-9 w-[240px] max-w-full focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <Search size={15} style={{ color: "var(--faint)" }} />
          <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="flex-1 bg-transparent text-sm outline-none placeholder:[color:var(--faint)]" aria-label="Search" />
          {globalFilter && <button onClick={() => setGlobalFilter("")} aria-label="Clear search" style={{ color: "var(--faint)" }}><X size={14} /></button>}
        </div>

        {facets.map((f) => <FacetFilter key={f.columnId} table={table} facet={f} />)}

        <div className="flex-1" />

        {toolbarExtra}
        <DensityControl value={density} onChange={setDensity} />
        <ColumnsMenu table={table} order={columnOrder} setOrder={setColumnOrder} labels={columnLabels} />
      </div>

      {/* ── Active filter chips + count ── */}
      <div className="flex items-center gap-2 flex-wrap min-h-[26px]">
        <span className="text-[13px] [color:var(--muted)] tabular-nums">
          {filteredCount === total ? `${total} ${countNoun}` : `${filteredCount} of ${total} ${countNoun}`}
        </span>
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
      {selectedCount > 0 && bulkActions && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] px-3.5 py-2 [background:var(--accent-soft)] border border-[var(--accent-soft)]">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="font-semibold [color:var(--accent-ink)]">{selectedCount} selected</span>
            <button onClick={() => setRowSelection({})} className="text-xs underline [color:var(--muted)] focus-ring rounded">Clear</button>
            {allPageSelected && moreThanPage && selectedCount < filteredCount && (
              <button onClick={selectAllFiltered} className="text-xs font-semibold [color:var(--accent-ink)] focus-ring rounded">Select all {filteredCount} matching</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {bulkActions({ rows: selectedRows, clear: () => setRowSelection({}) })}
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
                  <span className="font-semibold">{emptyTitle}</span>
                  <span className="text-[13px] [color:var(--muted)]">{emptyDescription}</span>
                </div>
              </td></tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") { e.preventDefault(); onRowClick(row.original); } } : undefined}
                  role={onRowClick ? "link" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn("transition-colors hover:[background:var(--surface-2)] focus-ring", onRowClick && "cursor-pointer")}
                  style={{ background: row.getIsSelected() ? "var(--accent-soft)" : undefined }}
                >
                  <td onClick={(e) => e.stopPropagation()} className={cn("px-3.5 align-middle", DENSITY_PAD[density])} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} aria-label="Select row" />
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-3.5 align-middle text-sm", DENSITY_PAD[density])} style={{ borderBottom: "1px solid var(--border)", width: cell.column.getSize() }}>
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
      {filteredCount > 0 && (
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
      )}
    </div>
  );
}

function FacetFilter<T>({ table, facet }: { table: Table<T>; facet: Facet }) {
  const column = table.getColumn(facet.columnId);
  const value = (column?.getFilterValue() as string[]) ?? [];
  const toggle = (v: string) => column?.setFilterValue(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className={cn(value.length && "[border-color:var(--accent)] [color:var(--accent-ink)]")}>
          <SlidersHorizontal size={14} /> {facet.label}{value.length > 0 && <span className="ml-1 rounded-full px-1.5 text-[11px] [background:var(--accent-soft)] [color:var(--accent-ink)]">{value.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5">
        <div className="flex flex-col">
          {facet.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:[background:var(--surface-2)] cursor-pointer">
              <Checkbox checked={value.includes(o.value)} onCheckedChange={() => toggle(o.value)} /> {o.label ?? o.value}
            </label>
          ))}
          {value.length > 0 && <button onClick={() => column?.setFilterValue(undefined)} className="mt-1 text-xs underline [color:var(--muted)] px-2 py-1 text-left focus-ring rounded">Clear {facet.label.toLowerCase()}</button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DensityControl({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const items: Density[] = ["compact", "comfortable", "spacious"];
  return (
    <div className="hidden sm:inline-flex rounded-[var(--radius)] p-0.5 gap-0.5 [background:var(--surface-2)]" role="group" aria-label="Row density">
      {items.map((d) => (
        <button key={d} onClick={() => onChange(d)} aria-pressed={value === d} title={`${d} rows`}
          className={cn("h-7 px-2.5 rounded-[7px] text-xs font-semibold capitalize transition-colors focus-ring", value === d ? "[background:var(--surface)] shadow-[var(--shadow-xs)] [color:var(--fg)]" : "[color:var(--muted)]")}>
          {d}
        </button>
      ))}
    </div>
  );
}

function ColumnsMenu<T>({ table, order, setOrder, labels }: { table: Table<T>; order: ColumnOrderState; setOrder: (o: ColumnOrderState) => void; labels: Record<string, string> }) {
  const cols = table.getAllLeafColumns();
  const currentOrder = order.length ? order : cols.map((c) => c.id);
  const ordered = currentOrder.filter((id) => cols.some((c) => c.id === id));
  function move(id: string, dir: -1 | 1) {
    const ord = [...ordered];
    const i = ord.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    setOrder([...ord]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm"><Columns3 size={14} /> <span className="hidden sm:inline">Columns</span></Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide [color:var(--faint)]">Columns</p>
        <div className="flex flex-col">
          {ordered.map((id, idx) => {
            const c = cols.find((x) => x.id === id)!;
            return (
              <div key={id} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:[background:var(--surface-2)]">
                <Checkbox checked={c.getIsVisible()} disabled={!c.getCanHide()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))} />
                <span className="flex-1">{labels[id] ?? id}</span>
                <button onClick={() => move(id, -1)} disabled={idx === 0} className="disabled:opacity-30 focus-ring rounded p-0.5" aria-label={`Move ${labels[id] ?? id} up`}><ArrowUp size={13} /></button>
                <button onClick={() => move(id, 1)} disabled={idx === ordered.length - 1} className="disabled:opacity-30 focus-ring rounded p-0.5" aria-label={`Move ${labels[id] ?? id} down`}><ArrowDown size={13} /></button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
