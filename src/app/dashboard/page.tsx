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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
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

  const todayOpps = opps.filter((o) => isToday(o.first_discovered_at));
  const earlierOpps = opps.filter((o) => !isToday(o.first_discovered_at));
  const todayCount = todayOpps.length;
  const newCount = opps.filter((o) => o.status === "new").length;
  const signals = new Set(opps.map((o) => o.buying_situations?.name).filter(Boolean)).size;

  // Up to 6 cards, today first; group headings only when both buckets exist.
  const MAX = 6;
  const shownToday = todayOpps.slice(0, MAX);
  const shownEarlier = earlierOpps.slice(0, Math.max(0, MAX - shownToday.length));
  const grouped = todayOpps.length > 0 && earlierOpps.length > 0;

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
          <p className="section-label mb-1.5">Your briefing</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span style={{ color: "var(--muted)" }}>{greeting()}</span>{" "}
            <span>{briefing}</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            The companies worth contacting right now, and the reason behind each.
          </p>
        </div>
        <Link href="/dashboard/signals" className="btn btn-primary">Find opportunities</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="New today" value={loaded ? todayCount : "—"} accent />
        <Stat label="New opportunities" value={loaded ? newCount : "—"} />
        <Stat label="Companies found" value={loaded ? opps.length : "—"} />
        <Stat label="Situations we're watching" value={loaded ? signals : "—"} />
      </div>

      {running > 0 && (
        <div className="card px-4 py-3 mt-5 flex items-center gap-3">
          <span className="spin inline-block h-4 w-4 rounded-full border-2 shrink-0" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            <span className="dot font-medium" style={{ color: "var(--fg)" }}>Scanning now</span>
            {" · "}{running} search{running > 1 ? "es" : ""} running. New companies land here as each finishes.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-semibold">Opportunities</h2>
        <Link href="/dashboard/companies" className="text-sm font-medium focus-ring rounded" style={{ color: "var(--accent-ink)" }}>View all →</Link>
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
      ) : grouped ? (
        <div className="flex flex-col gap-6">
          <OppGroup label="Today" count={todayCount} opps={shownToday} />
          <OppGroup label="Earlier" count={earlierOpps.length} opps={shownEarlier} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {(todayOpps.length > 0 ? shownToday : shownEarlier).map((o) => (
            <OpportunityCard key={o.id} opp={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OppGroup({ label, count, opps }: { label: string; count: number; opps: OpportunityRow[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="section-label">{label}</h3>
        <span className="section-label" style={{ color: "var(--border-strong)" }}>·</span>
        <span className="section-label">{count}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {opps.map((o) => <OpportunityCard key={o.id} opp={o} />)}
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="card px-3.5 py-3 flex items-baseline justify-between gap-2">
      <p className="text-xs leading-tight" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-lg font-semibold tabular-nums" style={{ color: accent ? "var(--accent)" : "var(--fg)" }}>{value}</p>
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
