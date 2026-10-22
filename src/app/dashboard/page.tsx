"use client";
import { useActivity } from "@/components/ActivityProvider";
import ParallelActivity from "@/components/ParallelActivity";
import { apiJson } from "@/lib/workspace";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Opp = {
  id: string; what_happened: string; status: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
};

export default function OverviewPage() {
  const { data } = useActivity();
  const [opps, setOpps] = useState<Opp[]>([]);
  const [running, setRunning] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ newOpportunities: 0, companies: 0, contacts: 0, lists: 0, enabledSignals: 0 });
  const [discovery, setDiscovery] = useState({ state: "not_started", lastError: null as string | null });

  const load = useCallback(async () => {
    try {
      const j = await apiJson("/api/overview");
      setOpps(j.recentOpportunities ?? []);
      setSummary(j.summary); setDiscovery(j.discovery); setRunning(j.summary.activeRuns);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load overview"); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load, data?.observedAt]);

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>The companies worth contacting right now, and the reason behind each.</p></div>
        <Link href="/dashboard/signals" className="btn btn-primary">Find opportunities</Link>
      </div>
      {error && <div role="alert" className="card p-4 mb-4">{error} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Retry</button></div>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="New opportunities" value={summary.newOpportunities} accent />
        <Stat label="Companies found" value={summary.companies} />
        <Stat label="Situations we're watching" value={summary.enabledSignals} />
        <Stat label="Contacts" value={summary.contacts} />
        <Stat label="Saved lists" value={summary.lists} />
        <Stat label="Status" value={running > 0 ? running + " running" : discovery.state === "not_started" ? "Search not started" : discovery.state === "failed" ? "Search failed" : "Idle"} small />
      </div>
      <ParallelActivity />
      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-semibold">Recent companies</h2>
        <Link href="/dashboard/companies" className="text-sm font-medium" style={{ color: "var(--accent-ink)" }}>View all →</Link>
      </div>
      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div>
        : error ? <div className="card p-6">Results could not be loaded. Retry to check again.</div>
        : opps.length === 0 ? <div className="card p-10 text-center">
          <p className="font-medium">{running > 0 ? "Your first opportunities are on the way" : "No opportunities yet"}</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{running > 0 ? "Results appear as searches finish. You can explore other sections while we work."
            : discovery.state === "failed" ? discovery.lastError || "The last search failed. Review your signals and try again."
            : discovery.state === "no_matches" ? "Your search finished without qualifying companies. Adjust your signals or company criteria and try again."
            : "Start a discovery search to find prospective customers. Researching your own company builds your business profile."}</p>
          <Link href="/dashboard/signals" className="btn btn-primary mt-4">Choose what to look for</Link>
        </div> : <div className="card overflow-hidden"><table className="tbl">
          <thead><tr><th>Company</th><th>Signal</th><th>What's happening</th><th></th></tr></thead>
          <tbody>{opps.slice(0, 8).map(o => <tr key={o.id}>
            <td className="font-medium">{o.companies?.name || o.companies?.normalized_domain || ""}</td>
            <td>{o.buying_situations?.name && <span className="pill">{o.buying_situations.name}</span>}</td>
            <td className="truncate" style={{ color: "var(--muted)", maxWidth: 440 }}>{o.what_happened}</td>
            <td>{o.status === "new" && <span className="chip">New</span>}</td>
          </tr>)}</tbody></table></div>}
    </div>
  );
}
function Stat({ label, value, accent, small }: { label: string; value: number | string; accent?: boolean; small?: boolean }) {
  return <div className="card p-4"><p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
    <p className={small ? "text-lg font-semibold mt-1" : "text-2xl font-semibold mt-1"} style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{value}</p></div>;
}
