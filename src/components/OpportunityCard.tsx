"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { ConfidenceBadge } from "@/components/ui/Badge";

/** One opportunity row as returned by GET /api/opportunities. */
export type OpportunityRow = {
  id: string;
  company_id: string;
  situation_id?: string;
  what_happened: string;
  why_it_matters?: string;
  confidence: string;
  evidence_date?: string | null;
  status: string;
  first_discovered_at?: string | null;
  companies: { normalized_domain: string; name: string } | null;
  buying_situations: { name: string } | null;
  evidence?: { source_url: string; source_date: string | null }[];
};

function stop(e: MouseEvent) {
  e.stopPropagation();
}

/**
 * Premium, calm opportunity card. The whole card opens the detail view
 * (/dashboard/companies/[id] — [id] is the opportunity id). Inner links
 * (domain, evidence) stop propagation so they open on their own.
 * Contacts/outreach live on the detail page; nothing is fabricated here.
 */
export default function OpportunityCard({ opp }: { opp: OpportunityRow }) {
  const router = useRouter();
  const href = `/dashboard/companies/${opp.id}`;
  const name = opp.companies?.name || opp.companies?.normalized_domain || "Unknown company";
  const domain = opp.companies?.normalized_domain;
  const whyNow = opp.what_happened || opp.why_it_matters || "";
  const sources = opp.evidence ?? [];

  const go = () => router.push(href);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
      className="card p-4 cursor-pointer transition-all hover:-translate-y-0.5 focus-ring"
      style={{ boxShadow: "0 1px 2px rgba(24,23,26,.03)" }}
      aria-label={`Open opportunity for ${name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{name}</h3>
            {opp.status === "new" && <span className="chip">New</span>}
          </div>
          {domain && (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              onClick={stop}
              className="text-xs hover:underline"
              style={{ color: "var(--faint)" }}
            >
              {domain} ↗
            </a>
          )}
        </div>
        <ConfidenceBadge confidence={opp.confidence} />
      </div>

      {opp.buying_situations?.name && (
        <div className="mt-3">
          <span className="pill">{opp.buying_situations.name}</span>
        </div>
      )}

      {whyNow && (
        <p className="mt-3 text-sm line-clamp-2" style={{ color: "var(--muted)" }}>
          {whyNow}
        </p>
      )}

      <div
        className="mt-4 pt-3 flex items-center justify-between gap-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {sources.length > 0 ? (
            <>
              <span className="text-xs" style={{ color: "var(--faint)" }}>
                {sources.length} source{sources.length > 1 ? "s" : ""}
              </span>
              <span style={{ color: "var(--border-strong)" }}>·</span>
              {sources.slice(0, 2).map((e, i) => (
                <a
                  key={i}
                  href={e.source_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={stop}
                  className="text-xs underline"
                  style={{ color: "var(--accent-ink)" }}
                >
                  source {i + 1} ↗
                </a>
              ))}
            </>
          ) : (
            <span className="text-xs" style={{ color: "var(--faint)" }}>
              No linked sources yet
            </span>
          )}
        </div>
        <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--accent-ink)" }}>
          View opportunity →
        </span>
      </div>
    </div>
  );
}
