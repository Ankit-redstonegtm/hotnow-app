"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";

type Opp = {
  id: string;
  what_happened: string;
  why_it_matters: string;
  confidence: string;
  evidence_date: string | null;
  status: string;
  first_discovered_at: string;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence: { source_url: string; source_date: string | null }[];
};

export default function Dashboard({ companyName }: { companyName: string }) {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadOpps = useCallback(async () => {
    const j = await fetch("/api/opportunities").then((r) => r.json());
    setOpps(j.opportunities ?? []);
    setLoaded(true);
  }, []);

  const poll = useCallback(async () => {
    try {
      const j = await fetch("/api/discovery/poll", { method: "POST" }).then((r) => r.json());
      const remaining = j.remaining ?? 0;
      setRunning(remaining > 0);
      if (remaining > 0) {
        setNote(`Discovery in progress — ${remaining} search${remaining > 1 ? "es" : ""} still running. Results appear as each finishes.`);
        timer.current = setTimeout(poll, 15000);
      } else {
        setNote(null);
      }
      await loadOpps();
    } catch {
      timer.current = setTimeout(poll, 20000);
    }
  }, [loadOpps]);

  useEffect(() => {
    loadOpps();
    poll(); // kick an ingest check on mount
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [loadOpps, poll]);

  const newCount = opps.filter((o) => o.status === "new").length;
  const situations = new Set(opps.map((o) => o.buying_situations?.name).filter(Boolean)).size;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-5xl px-5 py-8 flex-1">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>for {companyName}</p>
          </div>
          <Link href="/dashboard/situations" className="btn btn-ghost">Manage situations →</Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <Stat label="New" value={newCount} accent />
          <Stat label="Total" value={opps.length} />
          <Stat label="Situations" value={situations} />
          <Stat label="Status" value={running ? "Running" : "Idle"} small />
        </div>

        {note && (
          <div className="card p-4 mt-5 flex items-center gap-3">
            <span className="spin inline-block h-4 w-4 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
            <span className="text-sm dot">{note}</span>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {!loaded && <div className="text-sm" style={{ color: "var(--muted)" }}>Loading…</div>}
          {loaded && opps.length === 0 && !running && (
            <div className="card p-8 text-center">
              <p className="font-medium">No opportunities yet</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Discovery may still be running, or no companies met the quality bar. We never invent results.
              </p>
              <Link href="/dashboard/situations" className="btn btn-primary mt-4">Run discovery</Link>
            </div>
          )}
          {opps.map((o) => <OppCard key={o.id} o={o} />)}
        </div>
      </div>
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

function OppCard({ o }: { o: Opp }) {
  const domain = o.companies?.normalized_domain;
  const name = o.companies?.name || domain || "Company";
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold tracking-tight">{name}</h3>
            {o.status === "new" && <span className="chip">New</span>}
          </div>
          {domain && (
            <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--muted)" }}>{domain} ↗</a>
          )}
        </div>
        {o.buying_situations?.name && <span className="pill">{o.buying_situations.name}</span>}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>WHAT HAPPENED</p>
        <p className="text-sm mt-1">{o.what_happened}</p>
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>WHY IT MATTERS</p>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{o.why_it_matters}</p>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap text-xs" style={{ color: "var(--faint)" }}>
        <span className="pill">confidence: {o.confidence}</span>
        {o.evidence_date && <span>evidence {o.evidence_date}</span>}
        {o.evidence?.slice(0, 3).map((e, i) => (
          <a key={i} href={e.source_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
            source {i + 1} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
