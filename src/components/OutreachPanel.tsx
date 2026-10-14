"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { PriorityBadge, EmailStatusBadge, type Priority, type EmailStatus } from "@/components/ui/Badge";

export type OutreachContact = {
  id: string;
  fullName: string;
  title: string;
  priority: Priority;
  linkedinUrl: string | null;
  email: string | null;
  emailStatus: EmailStatus;
};

export type Followup = { channel: string; waitDays: number; subject?: string; body: string };
export type OutreachContent = {
  email?: { subject: string; body: string };
  linkedin?: { body: string };
  followups?: Followup[];
};

type Props = {
  opportunityId: string;
  contacts: OutreachContact[];
  recommendedContactId: string | null;
  initialDraftsByContactId: Record<string, OutreachContent>;
};

type Tab = "email" | "linkedin";

function hasDraft(c: OutreachContent | null | undefined): c is OutreachContent {
  return !!c && (!!c.email || !!c.linkedin || (c.followups?.length ?? 0) > 0);
}

export default function OutreachPanel({ opportunityId, contacts, recommendedContactId, initialDraftsByContactId }: Props) {
  const { toast } = useToast();
  const defaultId = recommendedContactId && contacts.some((c) => c.id === recommendedContactId)
    ? recommendedContactId
    : contacts[0]?.id ?? "";

  const [selectedId, setSelectedId] = useState(defaultId);
  const [tab, setTab] = useState<Tab>("email");
  const [withSequence, setWithSequence] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [fetching, setFetching] = useState(false);
  // undefined = not yet checked; null = checked, no draft; object = draft present.
  const [drafts, setDrafts] = useState<Record<string, OutreachContent | null>>(() => ({ ...initialDraftsByContactId }));

  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const current = selectedId ? drafts[selectedId] : undefined;

  // When a contact is selected and we have no cached draft, check the backend for a saved one.
  useEffect(() => {
    if (!selectedId || drafts[selectedId] !== undefined) return;
    let cancelled = false;
    setFetching(true);
    fetch(`/api/outreach?opportunityId=${encodeURIComponent(opportunityId)}&contactId=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((j: { content?: OutreachContent | null }) => {
        if (cancelled) return;
        setDrafts((prev) => ({ ...prev, [selectedId]: hasDraft(j.content) ? j.content : null }));
      })
      .catch(() => {
        if (!cancelled) setDrafts((prev) => ({ ...prev, [selectedId]: null }));
      })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [selectedId, opportunityId, drafts]);

  const generate = useCallback(async () => {
    if (!selectedId || generating) return;
    setGenerating(true);
    try {
      const r = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId, contactId: selectedId, withSequence }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Generation failed");
      setDrafts((prev) => ({ ...prev, [selectedId]: j.content as OutreachContent }));
      toast({ title: "Outreach ready", description: "Review it below, then copy what you need.", variant: "success" });
    } catch (e) {
      toast({ title: "Couldn't generate outreach", description: e instanceof Error ? e.message : "Please try again.", variant: "error" });
    } finally {
      setGenerating(false);
    }
  }, [selectedId, generating, opportunityId, withSequence, toast]);

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          </svg>
        }
        title="No contacts to write to yet"
        description="Source the decision-makers at this company first, then come back to draft outreach grounded in this signal."
        action={<Link href="/dashboard/contacts" className="btn btn-primary">Go to Contacts</Link>}
      />
    );
  }

  const emailBody = current?.email?.body ?? "";
  const emailSubject = current?.email?.subject ?? "";
  const linkedinBody = current?.linkedin?.body ?? "";
  const followups = current?.followups ?? [];

  return (
    <div className="card overflow-hidden">
      {/* contact selector */}
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="label mb-0">Writing to</label>
          {selected && (
            <div className="flex items-center gap-2">
              <PriorityBadge priority={selected.priority} />
              <EmailStatusBadge status={selected.emailStatus} />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <select
            className="input"
            style={{ maxWidth: 320 }}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}{c.title ? ` — ${c.title}` : ""}{c.id === recommendedContactId ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          {selected?.linkedinUrl && (
            <a href={selected.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent-ink)" }}>
              LinkedIn ↗
            </a>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {(["email", "linkedin"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="btn btn-sm"
            style={tab === t
              ? { background: "var(--accent-soft)", color: "var(--accent-ink)" }
              : { background: "transparent", color: "var(--muted)" }}
          >
            {t === "email" ? "Email" : "LinkedIn"}
          </button>
        ))}
      </div>

      <div className="p-4">
        {fetching && current === undefined ? (
          <div className="py-8 flex justify-center"><Spinner label="Checking for a saved draft…" /></div>
        ) : !hasDraft(current) ? (
          <div className="py-6 text-center flex flex-col items-center gap-3">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No outreach drafted for {selected?.fullName ?? "this contact"} yet.
            </p>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <input type="checkbox" checked={withSequence} onChange={(e) => setWithSequence(e.target.checked)} className="accent-[var(--accent)]" />
              Include a short follow-up sequence
            </label>
            <button type="button" className="btn btn-primary" onClick={generate} disabled={generating}>
              {generating ? <><Spinner size={15} /> Writing… (~10s)</> : "Generate outreach"}
            </button>
            <p className="text-[11px]" style={{ color: "var(--faint)" }}>
              Written only from this opportunity&apos;s verified evidence.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {tab === "email" ? (
              current?.email ? (
                <>
                  <Field label="Subject" copyText={emailSubject}>
                    <p className="text-sm font-medium">{emailSubject || <span style={{ color: "var(--faint)" }}>No subject</span>}</p>
                  </Field>
                  <Field label="Body" copyText={emailBody}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{emailBody}</p>
                  </Field>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No email draft for this contact. Switch to LinkedIn or regenerate.</p>
              )
            ) : current?.linkedin ? (
              <Field label="LinkedIn message" copyText={linkedinBody}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{linkedinBody}</p>
              </Field>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No LinkedIn draft for this contact. Switch to Email or regenerate.</p>
            )}

            {followups.length > 0 && (
              <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="label">Follow-up sequence</p>
                <div className="flex flex-col gap-3">
                  {followups.map((f, i) => (
                    <div key={i} className="rounded-[10px] p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="pill">{f.channel} · wait {f.waitDays}d</span>
                        <CopyButton text={[f.subject, f.body].filter(Boolean).join("\n\n")} label="Copy" />
                      </div>
                      {f.subject && <p className="text-sm font-medium">{f.subject}</p>}
                      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--muted)" }}>{f.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={withSequence} onChange={(e) => setWithSequence(e.target.checked)} className="accent-[var(--accent)]" />
                Include a short follow-up sequence
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={generate} disabled={generating}>
                {generating ? <><Spinner size={14} /> Regenerating…</> : "Regenerate"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, copyText, children }: { label: string; copyText: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="label mb-0">{label}</p>
        {copyText && <CopyButton text={copyText} label="Copy" />}
      </div>
      {children}
    </div>
  );
}
