"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import OpportunityCard, { type OpportunityRow } from "@/components/OpportunityCard";
import { EmptyState } from "@/components/ui/EmptyState";

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return new Date(t).toDateString() === new Date().toDateString();
}

export default function OverviewPage() {
  const [opps, setOpps] = useState<OpportunityRow[]>([]);
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

  const todayCount = opps.filter((o) => isToday(o.first_discovered_at)).length;
  const newCount = opps.filter((o) => o.status === "new").length;
  const signals = new Set(opps.map((o) => o.buying_situations?.name).filter(Boolean)).size;

  // Header: the AI-employee briefing line. Never fabricated — counts come from fetched rows.
  const briefing = !loaded
    ? "Checking what came in since you were last here…"
    : todayCount > 0
      ? `Found ${todayCount} compan${todayCount === 1 ? "y" : "ies"} worth contacting today.`
      : running > 0
        ? "Scanning now — new companies will land here as we verify them."
        : "No new companies today — your next scan will surface more.";

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>
            Your briefing
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{briefing}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            The companies worth contacting right now, and the reason behind each.
          </p>
        </div>
        <Link href="/dashboard/signals" className="btn btn-primary">Find opportunities</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="New today" value={loaded ? todayCount : "—"} accent />
        <Stat label="New opportunities" value={loaded ? newCount : "—"} />
        <Stat label="Companies found" value={loaded ? opps.length : "—"} />
        <Stat label="Situations we're watching" value={loaded ? signals : "—"} small />
      </div>

      {running > 0 && (
        <div className="card p-4 mt-5 flex items-center gap-3">
          <span className="spin inline-block h-4 w-4 rounded-full border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-sm dot">Finding companies now · {running} search{running > 1 ? "es" : ""} running. Results appear as each finishes.</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-semibold">Recent companies</h2>
        <Link href="/dashboard/companies" className="text-sm font-medium" style={{ color: "var(--accent-ink)" }}>View all →</Link>
      </div>

      {!loaded ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : opps.length === 0 ? (
        <EmptyState
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 21V9h5a1 1 0 0 1 1 1v11M7 8h2M7 12h2M7 16h2" />
            </svg>
          }
          title={running > 0 ? "Your first opportunities are on the way" : "No opportunities yet"}
          description={
            running > 0
              ? "We're looking for companies in a situation that fits what you sell. They appear here as we verify them."
              : "Turn on a signal and start a search. We only show companies backed by real evidence."
          }
          action={<Link href="/dashboard/signals" className="btn btn-primary">Choose what to look for</Link>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {opps.slice(0, 6).map((o) => <OpportunityCard key={o.id} opp={o} />)}
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

function CardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton h-5 w-14 rounded" />
      </div>
      <div className="skeleton h-4 w-24 rounded mt-3" />
      <div className="skeleton h-3.5 w-full rounded mt-3" />
      <div className="skeleton h-3.5 w-3/4 rounded mt-2" />
      <div className="skeleton h-3.5 w-28 rounded mt-4" />
    </div>
  );
}
