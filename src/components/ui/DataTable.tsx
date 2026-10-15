"use client";

// Headless, dependency-free data table: sortable headers, global search, row selection,
// a bulk-action bar, sticky header, overflow-safe. (We deliberately don't use a table lib —
// the installed @tanstack/react-table resolved to a non-standard v9 with incompatible types.)

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpDown, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

export interface DataColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** value used for sorting this column */
  sortValue?: (row: T) => string | number;
  /** text contributed to the global search index */
  searchText?: (row: T) => string;
  align?: "left" | "right";
  width?: string | number;
}
export type DataTableColumn<T> = DataColumn<T>;

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  data: T[];
  getRowId?: (row: T, index: number) => string;
  enableSelection?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  initialSort?: Array<{ id: string; desc: boolean }>;
  onSelectionChange?: (rows: T[]) => void;
  selectionActions?: (rows: T[]) => ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowId = (_r, i) => String(i),
  enableSelection,
  searchable,
  searchPlaceholder = "Search…",
  initialSort,
  onSelectionChange,
  selectionActions,
  loading,
  skeletonRows = 5,
  emptyState,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(initialSort?.[0] ?? null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const emitted = useRef<Set<string>>(selected);

  const rows = useMemo(() => data.map((row, i) => ({ row, id: getRowId(row, i) })), [data, getRowId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const searchers = columns.filter((c) => c.searchText);
    return rows.filter(({ row }) => searchers.some((c) => c.searchText!(row).toLowerCase().includes(q)));
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return filtered;
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a.row);
      const vb = col.sortValue!(b.row);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sort, columns]);

  function emit(next: Set<string>) {
    setSelected(next);
    emitted.current = next;
    onSelectionChange?.(rows.filter((r) => next.has(r.id)).map((r) => r.row));
  }
  function toggleRow(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    emit(next);
  }
  const allVisibleIds = sorted.map((r) => r.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));
  function toggleAll() {
    emit(allSelected ? new Set() : new Set(allVisibleIds));
  }

  function onSort(col: DataColumn<T>) {
    if (!col.sortable) return;
    setSort((cur) => (cur?.id !== col.id ? { id: col.id, desc: false } : cur.desc ? null : { id: col.id, desc: true }));
  }

  const colCount = columns.length + (enableSelection ? 1 : 0);
  const selectedRows = rows.filter((r) => selected.has(r.id)).map((r) => r.row);

  return (
    <div className={cn("card overflow-hidden", className)}>
      {searchable && (
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <Search size={15} style={{ color: "var(--faint)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:[color:var(--faint)]"
            aria-label="Search table"
          />
          {query && (
            <button onClick={() => setQuery("")} className="focus-ring rounded p-0.5" aria-label="Clear search" style={{ color: "var(--faint)" }}>
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {enableSelection && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2" style={{ background: "var(--accent-soft)", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold" style={{ color: "var(--accent-ink)" }}>{selected.size} selected</span>
            <button onClick={() => emit(new Set())} className="text-xs underline focus-ring rounded" style={{ color: "var(--muted)" }}>Clear</button>
          </div>
          {selectionActions?.(selectedRows)}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr>
              {enableSelection && (
                <th className="sticky top-0 z-[1] w-10 px-3.5 py-2.5 text-left" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.id === col.id;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort!.desc ? "descending" : "ascending") : "none"}
                    className="sticky top-0 z-[1] px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[.04em] whitespace-nowrap"
                    style={{ color: "var(--faint)", background: "var(--surface)", borderBottom: "1px solid var(--border)", textAlign: col.align ?? "left", width: col.width }}
                  >
                    {col.sortable ? (
                      <button onClick={() => onSort(col)} className="inline-flex items-center gap-1 focus-ring rounded uppercase" style={{ color: active ? "var(--fg)" : "inherit" }}>
                        {col.header}
                        {active ? (sort!.desc ? <ChevronDown size={13} /> : <ChevronUp size={13} />) : <ArrowUpDown size={12} className="opacity-50" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i}>
                  {enableSelection && <td className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border)" }}><Skeleton className="h-[18px] w-[18px] rounded-[6px]" /></td>}
                  {columns.map((c) => (
                    <td key={c.id} className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border)" }}><Skeleton className="h-4 w-24 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
                  {emptyState ?? "No rows"}
                </td>
              </tr>
            ) : (
              sorted.map(({ row, id }) => {
                const isSel = selected.has(id);
                return (
                  <tr key={id} className="transition-colors" style={{ background: isSel ? "var(--accent-soft)" : undefined }} onMouseDown={undefined}>
                    {enableSelection && (
                      <td className="px-3.5 py-3 align-middle" style={{ borderBottom: "1px solid var(--border)" }}>
                        <Checkbox checked={isSel} onCheckedChange={() => toggleRow(id)} aria-label="Select row" />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.id} className="px-3.5 py-3 align-middle text-sm" style={{ borderBottom: "1px solid var(--border)", textAlign: col.align ?? "left" }}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
