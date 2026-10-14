"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Opp = {
  id: string; what_happened: string; status: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
};

export default function OverviewPage() {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [running, setRunning] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/opportunities").then((r) => r.json());
    setOpps(j.opportunities ?? []);
    setLoaded(true);
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

  const newCount = opps.filter((o) => o.status === "new").length;
  const signals = new Set(opps.map((o) => o.buying_situations?.name).filter(Boolean)).size;

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Your pipeline of companies with a reason to buy, right now.</p>
        </div>
        <Link href="/dashboard/signals" className="btn btn-primary">Find opportunities</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="New opportunities" value={newCount} accent />
        <Stat label="Total companies" value={opps.length} />
        <Stat label="Active signals" value={signals} />
        <Stat label="Discovery" value={running > 0 ? `${running} running` : "Idle"} small />
      </div>

      {running > 0 && (
        <div className="card p-4 mt-5 flex items-center gap-3">
          <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-sm dot">Discovery in progress — {running} search{running > 1 ? "es" : ""} running. Results appear as each finishes.</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-semibold">Recent companies</h2>
        <Link href="/dashboard/companies" className="text-sm font-medium" style={{ color: "var(--accent-ink)" }}>View all →</Link>
      </div>

      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div>
      ) : opps.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No opportunities yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Enable a Pain-Qualified Signal and run discovery. We never invent results.</p>
          <Link href="/dashboard/signals" className="btn btn-primary mt-4">Go to Signals</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead><tr><th>Company</th><th>Signal</th><th>What happened</th><th></th></tr></thead>
            <tbody>
              {opps.slice(0, 8).map((o) => (
                <tr key={o.id}>
                  <td className="font-medium">{o.companies?.name || o.companies?.normalized_domain || "—"}</td>
                  <td>{o.buying_situations?.name && <span className="pill">{o.buying_situations.name}</span>}</td>
                  <td style={{ color: "var(--muted)", maxWidth: 440 }} className="truncate">{o.what_happened}</td>
                  <td>{o.status === "new" && <span className="chip">New</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: number | string; accent?: boolean; small?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className={small ? "text-lg font-semibold mt-1" : "text-2xl font-semibold mt-1"} style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{value}</p>
    </div>
  );
}
