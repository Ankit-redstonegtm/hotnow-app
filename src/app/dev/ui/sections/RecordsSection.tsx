"use client";

import { useState } from "react";
import { Link2, ArrowRight } from "lucide-react";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ConfidenceBadge, PriorityBadge, EmailStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { CopyButton } from "@/components/ui/CopyButton";

const EVIDENCE = [
  { title: "Spectrum OKC hiring event — ~100 sales jobs", url: "https://news9.com/…", date: "Sep 29, 2026" },
  { title: "Careers — Outside Sales Representative", url: "https://spectrum.com/careers", date: "Oct 13, 2026" },
];

export default function RecordsSection() {
  const [on, setOn] = useState(true);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Buying-situation card */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-label mb-1">Buying situation · sample</p>
            <h4 className="font-semibold">Scaling field teams to 5+ reps</h4>
          </div>
          <Switch checked={on} onCheckedChange={setOn} aria-label="Toggle signal" />
        </div>
        <div className="mt-3 border-l-2 pl-3" style={{ borderColor: "var(--accent-soft)" }}>
          <p className="section-label">Why now</p>
          <p className="text-sm [color:var(--muted)] mt-0.5">A hiring wave for field/outside reps signals they're scaling field execution and need territory + activity tooling.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {["job postings", "new-region PR", "territory announcements"].map((e) => <span key={e} className="pill">{e}</span>)}
        </div>
      </div>

      {/* Opportunity preview card */}
      <div className="card p-4">
        <p className="section-label mb-2">Opportunity preview · sample</p>
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2.5 min-w-0">
            <CompanyAvatar name="Spectrum" domain="spectrum.com" size={38} logo />
            <div className="min-w-0">
              <div className="font-semibold">Spectrum</div>
              <span className="text-xs [color:var(--faint)]">spectrum.com ↗</span>
            </div>
          </div>
          <ConfidenceBadge confidence="high" />
        </div>
        <div className="mt-2.5"><span className="pill">Scaling field teams</span></div>
        <p className="mt-2 text-sm [color:var(--muted)] line-clamp-2">Announced a ~100-position sales hiring wave in Oklahoma City, explicitly including residential outside sales reps.</p>
        <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 text-xs">
            <PriorityBadge priority="P1" /><span className="[color:var(--muted)]">Dana Lin · VP Ops</span><EmailStatusBadge status="found" />
          </div>
          <Button variant="ghost" size="sm">Review outreach <ArrowRight size={14} /></Button>
        </div>
      </div>

      {/* Evidence / source display */}
      <div className="card overflow-hidden">
        <p className="section-label px-4 pt-4">Evidence · {EVIDENCE.length}</p>
        <div className="mt-2">
          {EVIDENCE.map((e, i) => (
            <div key={i} className="px-4 py-3 flex items-start justify-between gap-3" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
              <div className="flex items-start gap-2.5 min-w-0">
                <Link2 size={15} className="mt-0.5 shrink-0" style={{ color: "var(--faint)" }} />
                <div className="min-w-0">
                  <a className="text-sm font-medium hover:underline" style={{ color: "var(--accent-ink)" }}>{e.title} ↗</a>
                  <p className="text-xs truncate [color:var(--faint)]">{e.url}</p>
                </div>
              </div>
              <span className="text-xs whitespace-nowrap [color:var(--faint)]">{e.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outreach preview */}
      <div className="card p-4">
        <p className="section-label mb-2">Outreach preview · sample (Eric's framework)</p>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide [color:var(--faint)]">Subject</span>
          <CopyButton text="field reps" label="Copy" />
        </div>
        <p className="text-sm font-medium">field reps</p>
        <div className="flex items-center justify-between mt-3 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide [color:var(--faint)]">Body</span>
          <CopyButton text="Hi Dana — saw Spectrum's OKC hiring push…" label="Copy" />
        </div>
        <p className="text-sm whitespace-pre-wrap leading-relaxed [color:var(--muted)]">Hi Dana – saw Spectrum's OKC hiring push for outside reps. Teams scaling field coverage fast often end up juggling territory assignment and activity tracking. If we could help your new reps ramp in days not weeks, worth a quick look?

— Alex, SPOTIO</p>
      </div>
    </div>
  );
}
