"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ConfidenceBadge, PriorityBadge, EmailStatusBadge, type Priority, type EmailStatus } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import OutreachPanel, { type OutreachContact, type OutreachContent } from "@/components/OutreachPanel";

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
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

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

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{o.companyName}</h1>
              {o.status === "new" && <span className="chip">New</span>}
            </div>
            {o.companyDomain && (
              <a href={`https://${o.companyDomain}`} target="_blank" rel="noreferrer" className="text-sm hover:underline" style={{ color: "var(--faint)" }}>
                {o.companyDomain} ↗
              </a>
            )}
          </div>
          <ConfidenceBadge confidence={o.confidence} />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="pill">{o.situationName}</span>
          {discovered && <span className="text-xs" style={{ color: "var(--faint)" }}>Discovered {discovered}</span>}
        </div>
      </div>

      {/* fact vs interpretation — visually distinct */}
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-grid place-items-center h-5 w-5 rounded-full text-white text-[11px]" style={{ background: "var(--good)" }}>✓</span>
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--good)" }}>What happened · verified</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{o.whatHappened || "—"}</p>
        </section>

        <section className="p-4 rounded-[12px]" style={{ background: "var(--surface-2)", border: "1px dashed var(--border-strong)" }}>
          <div className="flex items-center gap-2 mb-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />
            </svg>
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--info)" }}>Why it matters · HotNow&apos;s read</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{o.whyItMatters || "—"}</p>
        </section>
      </div>

      {/* evidence */}
      <section>
        <h2 className="font-semibold mb-3">Evidence</h2>
        {evidence.length === 0 ? (
          <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
            No linked sources recorded for this opportunity yet.
          </div>
        ) : (
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {evidence.map((e, i) => {
              const d = fmtDate(e.date);
              const label = e.title || e.url || "Source";
              return (
                <div key={i} className="p-4 flex items-start justify-between gap-3" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
                  <div className="min-w-0">
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: "var(--accent-ink)" }}>
                        {label} ↗
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{label}</span>
                    )}
                    {e.url && e.title && (
                      <p className="text-xs truncate" style={{ color: "var(--faint)" }}>{e.url}</p>
                    )}
                  </div>
                  {d && <span className="text-xs whitespace-nowrap" style={{ color: "var(--faint)" }}>{d}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* contacts */}
      <section>
        <h2 className="font-semibold mb-3">Who to contact</h2>
        {contacts.length === 0 ? (
          <div className="card p-6 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ color: "var(--muted)" }}>
            <span>No decision-makers sourced for this company yet.</span>
            <Link href="/dashboard/contacts" className="btn btn-ghost btn-sm">Find contacts</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {contacts.map((c, i) => {
              const recommended = c.id === recommendedContactId;
              return (
                <div
                  key={c.id}
                  className="p-4 flex items-start justify-between gap-3 flex-wrap"
                  style={{
                    borderTop: i ? "1px solid var(--border)" : undefined,
                    background: recommended ? "var(--accent-soft)" : undefined,
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.fullName}</span>
                      {recommended && (
                        <span className="chip" style={{ background: "var(--accent)", color: "#fff" }}>Recommended</span>
                      )}
                    </div>
                    <p className="text-sm truncate" style={{ color: "var(--muted)", maxWidth: 360 }}>{c.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <PriorityBadge priority={c.priority} />
                      {c.linkedinUrl && (
                        <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent-ink)" }}>LinkedIn ↗</a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <EmailStatusBadge status={c.emailStatus} />
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-xs underline" style={{ color: "var(--accent-ink)" }}>{c.email}</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* outreach */}
      <section>
        <h2 className="font-semibold mb-3">Outreach</h2>
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

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="skeleton h-7 w-56 rounded" />
        <div className="skeleton h-4 w-32 rounded mt-2" />
        <div className="skeleton h-5 w-40 rounded mt-3" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-3.5 w-full rounded mt-3" /><div className="skeleton h-3.5 w-5/6 rounded mt-2" /></div>
        <div className="card p-4"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-3.5 w-full rounded mt-3" /><div className="skeleton h-3.5 w-5/6 rounded mt-2" /></div>
      </div>
      <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div>
    </div>
  );
}
