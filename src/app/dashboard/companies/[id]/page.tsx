"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ConfidenceBadge, PriorityBadge, EmailStatusBadge, type Priority, type EmailStatus } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { useToast } from "@/components/ui/Toast";
import OutreachPanel, { type OutreachContact, type OutreachContent } from "@/components/OutreachPanel";
import { fmtLongDate } from "@/lib/date";

type Feedback = { verdict: "useful" | "not_relevant"; reason: string | null; updated_at: string } | null;

type Detail = {
  opportunity: {
    id: string;
    companyName: string;
    companyDomain: string | null;
    situationName: string;
    whatHappened: string;
    whyItMatters: string;
    confidence: string;
    evidenceDate: string | null;
    status: string;
    firstDiscoveredAt: string | null;
  };
  evidence: { url: string | null; title: string | null; date: string | null }[];
  contacts: Array<{
    id: string;
    fullName: string;
    title: string;
    priority: Priority;
    linkedinUrl: string | null;
    email: string | null;
    emailStatus: EmailStatus;
  }>;
  recommendedContactId: string | null;
  draftsByContactId: Record<string, OutreachContent>;
  feedback?: Feedback;
};

const fmtDate = fmtLongDate;

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    try {
      const r = await fetch(`/api/opportunities/${id}`);
      if (r.status === 404) { setState("notfound"); return; }
      if (!r.ok) { setState("error"); return; }
      const j = (await r.json()) as Detail;
      setData(j);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Link href="/dashboard/companies" className="text-sm font-medium inline-flex items-center gap-1 mb-4" style={{ color: "var(--muted)" }}>
        ← Back to companies
      </Link>

      {state === "loading" && <DetailSkeleton />}

      {state === "notfound" && (
        <EmptyState
          title="This opportunity isn't available"
          description="It may have been removed, or it belongs to another workspace."
          action={<Link href="/dashboard/companies" className="btn btn-primary">Back to companies</Link>}
        />
      )}

      {state === "error" && (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load this opportunity. Please try again."
          action={<button className="btn btn-primary" onClick={load}>Retry</button>}
        />
      )}

      {state === "ok" && data && <Loaded data={data} />}
    </div>
  );
}

const GROUP_LABEL: Record<string, string> = {
  P1: "Decision-makers",
  P2: "Champions",
  P3: "Stakeholders",
  Other: "Other contacts",
};

function SectionHeader({ step, title, hint }: { step: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <div className="flex items-baseline gap-2.5 min-w-0">
        <span className="section-label" style={{ color: "var(--faint)" }}>{step}</span>
        <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>
      </div>
      {hint ? <span className="text-xs whitespace-nowrap" style={{ color: "var(--faint)" }}>{hint}</span> : null}
    </div>
  );
}

function Loaded({ data }: { data: Detail }) {
  const { opportunity: o, evidence, contacts, recommendedContactId, draftsByContactId } = data;
  const discovered = fmtDate(o.firstDiscoveredAt);

  const outreachContacts: OutreachContact[] = contacts.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    title: c.title,
    priority: c.priority,
    linkedinUrl: c.linkedinUrl,
    email: c.email,
    emailStatus: c.emailStatus,
  }));

  // Group contacts by priority tier, preserving source order within each tier.
  const tierKeys = ["P1", "P2", "P3"] as const;
  const contactGroups = [...tierKeys, "Other"]
    .map((key) => ({
      key,
      items: contacts.filter((c) =>
        key === "Other" ? !tierKeys.includes(c.priority as (typeof tierKeys)[number]) : c.priority === key,
      ),
    }))
    .filter((g) => g.items.length > 0);

  const contactCount = contacts.length;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Briefing header ── */}
      <header className="pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start gap-4">
          <CompanyAvatar name={o.companyName} domain={o.companyDomain} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold tracking-tight">{o.companyName}</h1>
                  {o.status === "new" && <span className="chip">New</span>}
                </div>
                {o.companyDomain && (
                  <a
                    href={`https://${o.companyDomain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm hover:underline inline-flex items-center gap-1 mt-0.5 focus-ring"
                    style={{ color: "var(--faint)" }}
                  >
                    {o.companyDomain} ↗
                  </a>
                )}
              </div>
              <ConfidenceBadge confidence={o.confidence} />
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="pill">{o.situationName}</span>
              {discovered && (
                <span className="text-xs" style={{ color: "var(--faint)" }}>
                  Discovered {discovered}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <FeedbackBar opportunityId={o.id} initial={data.feedback ?? null} />

      {/* ── 01 · Why now ── */}
      <section>
        <SectionHeader step="01" title="Why now" />

        {/* fact vs interpretation — kept visually distinct */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4" style={{ borderColor: "var(--border-strong)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-grid place-items-center h-5 w-5 rounded-full text-white text-[11px]" style={{ background: "var(--good)" }}>✓</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--good)" }}>What happened · verified</h3>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{o.whatHappened || "—"}</p>
          </div>

          <div className="p-4 rounded-[12px]" style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)" }}>
            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />
              </svg>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--info)" }}>Why it matters · HotNow&apos;s read</h3>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{o.whyItMatters || "—"}</p>
          </div>
        </div>

        {/* evidence as titled source links */}
        <div className="mt-5">
          <p className="section-label mb-2">
            Evidence{evidence.length > 0 ? ` · ${evidence.length}` : ""}
          </p>
          {evidence.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No linked sources recorded for this opportunity yet.
            </p>
          ) : (
            <div className="card overflow-hidden">
              {evidence.map((e, i) => {
                const d = fmtDate(e.date);
                const label = e.title || e.url || "Source";
                return (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-start justify-between gap-3"
                    style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
                        <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                      </svg>
                      <div className="min-w-0">
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline focus-ring" style={{ color: "var(--accent-ink)" }}>
                            {label} ↗
                          </a>
                        ) : (
                          <span className="text-sm font-medium">{label}</span>
                        )}
                        {e.url && e.title && (
                          <p className="text-xs truncate" style={{ color: "var(--faint)" }}>{e.url}</p>
                        )}
                      </div>
                    </div>
                    {d && <span className="text-xs whitespace-nowrap mt-0.5" style={{ color: "var(--faint)" }}>{d}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 02 · Who to contact ── */}
      <section>
        <SectionHeader step="02" title="Who to contact" hint={contactCount > 0 ? `${contactCount} ${contactCount === 1 ? "person" : "people"}` : undefined} />
        {contacts.length === 0 ? (
          <EmptyState
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </svg>
            }
            title="No decision-makers sourced yet"
            description="This signal is real — the people to reach just aren't on file. Source them and they'll show up here."
            action={<Link href="/dashboard/contacts" className="btn btn-primary">Find contacts</Link>}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {contactGroups.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="section-label">{GROUP_LABEL[g.key] ?? g.key}</span>
                  <span className="text-[11px]" style={{ color: "var(--border-strong)" }}>{g.items.length}</span>
                </div>
                <div className="card overflow-hidden">
                  {g.items.map((c, i) => {
                    const recommended = c.id === recommendedContactId;
                    return (
                      <div
                        key={c.id}
                        className="p-4 flex items-start justify-between gap-3 flex-wrap"
                        style={{
                          borderTop: i ? "1px solid var(--border)" : undefined,
                          background: recommended ? "var(--accent-soft)" : undefined,
                          boxShadow: recommended ? "inset 3px 0 0 var(--accent)" : undefined,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{c.fullName}</span>
                            {recommended && (
                              <span className="chip" style={{ background: "var(--accent)", color: "#fff" }}>★ Recommended</span>
                            )}
                          </div>
                          <p className="text-sm truncate" style={{ color: "var(--muted)", maxWidth: 360 }}>{c.title}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <PriorityBadge priority={c.priority} />
                            {c.linkedinUrl && (
                              <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs underline focus-ring" style={{ color: "var(--accent-ink)" }}>LinkedIn ↗</a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <EmailStatusBadge status={c.emailStatus} />
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="text-xs underline focus-ring" style={{ color: "var(--accent-ink)" }}>{c.email}</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 03 · What to say ── */}
      <section>
        <SectionHeader step="03" title="What to say" />
        <OutreachPanel
          opportunityId={o.id}
          contacts={outreachContacts}
          recommendedContactId={recommendedContactId}
          initialDraftsByContactId={draftsByContactId}
        />
      </section>
    </div>
  );
}

const REASONS: Array<{ key: string; label: string }> = [
  { key: "wrong_company", label: "Wrong company" },
  { key: "wrong_timing", label: "Wrong timing" },
  { key: "weak_evidence", label: "Weak evidence" },
  { key: "wrong_contact", label: "Wrong contact" },
  { key: "other", label: "Other" },
];

/** Lightweight quality signal: was this opportunity useful? (optional reason if not). */
function FeedbackBar({ opportunityId, initial }: { opportunityId: string; initial: Feedback }) {
  const { toast } = useToast();
  const [verdict, setVerdict] = useState<"useful" | "not_relevant" | null>(initial?.verdict ?? null);
  const [reason, setReason] = useState<string | null>(initial?.reason ?? null);
  const [showReasons, setShowReasons] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(v: "useful" | "not_relevant", r: string | null) {
    setBusy(true);
    const prev = { verdict, reason };
    setVerdict(v); setReason(r);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: v, reason: r }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Could not save");
      toast({ title: "Thanks — noted.", description: v === "useful" ? "We'll find more like this." : "We'll use this to tune your signals.", variant: "success" });
    } catch (e) {
      setVerdict(prev.verdict); setReason(prev.reason);
      toast({ title: "Couldn't save feedback", description: e instanceof Error ? e.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const pillStyle = (active: boolean, tone: "good" | "muted") =>
    active
      ? tone === "good"
        ? { background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" }
        : { background: "var(--surface-2)", color: "var(--fg)", borderColor: "var(--border-strong)" }
      : undefined;

  return (
    <div className="card px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "var(--surface-2)" }}>
      <span className="text-sm font-medium">Was this useful?</span>
      <button className="btn btn-sm focus-ring" disabled={busy} style={pillStyle(verdict === "useful", "good")} onClick={() => send("useful", null)}>
        👍 Useful
      </button>
      <button
        className="btn btn-sm focus-ring"
        disabled={busy}
        style={pillStyle(verdict === "not_relevant", "muted")}
        onClick={() => { setShowReasons((s) => !s || verdict !== "not_relevant"); if (verdict !== "not_relevant") send("not_relevant", null); }}
      >
        👎 Not relevant
      </button>
      {verdict === "not_relevant" && (
        <>
          <button className="text-xs underline focus-ring rounded" style={{ color: "var(--muted)" }} onClick={() => setShowReasons((s) => !s)}>
            {reason ? `Reason: ${REASONS.find((x) => x.key === reason)?.label ?? reason}` : "Add a reason"}
          </button>
          {showReasons && (
            <div className="flex items-center gap-1.5 flex-wrap basis-full mt-1">
              {REASONS.map((r) => (
                <button key={r.key} className="pill focus-ring" disabled={busy}
                  style={reason === r.key ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" } : undefined}
                  onClick={() => { send("not_relevant", r.key); setShowReasons(false); }}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start gap-4 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="skeleton h-[52px] w-[52px] rounded-[14px]" />
        <div className="flex-1">
          <div className="skeleton h-7 w-56 rounded" />
          <div className="skeleton h-4 w-32 rounded mt-2" />
          <div className="skeleton h-5 w-40 rounded mt-3" />
        </div>
      </div>
      <div>
        <div className="skeleton h-3 w-24 rounded mb-3" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-3.5 w-full rounded mt-3" /><div className="skeleton h-3.5 w-5/6 rounded mt-2" /></div>
          <div className="card p-4"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-3.5 w-full rounded mt-3" /><div className="skeleton h-3.5 w-5/6 rounded mt-2" /></div>
        </div>
      </div>
      <div>
        <div className="skeleton h-3 w-28 rounded mb-3" />
        <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
      </div>
    </div>
  );
}
