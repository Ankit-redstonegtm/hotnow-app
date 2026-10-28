"use client";
import { downloadCSV, opportunityCsvRows, type OpportunityCsvSource } from "@/lib/csv";
import { apiJson } from "@/lib/workspace";
import { useEffect, useState } from "react";

export default function LeadCsvExport() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);

  useEffect(() => {
    apiJson<{ opportunities?: OpportunityCsvSource[] }>("/api/opportunities")
      .then((data) => {
        const next = opportunityCsvRows(data.opportunities ?? []);
        setRows(next);
        setCount(next.length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load opportunities"));
  }, []);

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-semibold text-sm">Export CSV</h2>
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        Download the opportunities in this workspace. The same file is available from Companies.
      </p>
      {error && <p className="text-xs mt-2" style={{ color: "var(--accent-ink)" }}>{error}</p>}
      {count === 0 && <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>No opportunities yet. Export is ready after the first search.</p>}
      <button className="btn btn-ghost btn-sm mt-3" disabled={!rows.length} onClick={() => downloadCSV(`hotnow-opportunities-${new Date().toISOString().slice(0, 10)}`, rows)}>
        {count == null ? "Loading…" : "Download CSV"}
      </button>
    </section>
  );
}
