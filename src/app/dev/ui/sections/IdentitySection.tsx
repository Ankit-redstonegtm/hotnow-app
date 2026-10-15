"use client";

import { CompanyAvatar } from "@/components/ui/CompanyAvatar";
import { ConfidenceBadge, EmailStatusBadge, PriorityBadge } from "@/components/ui/Badge";

const COMPANIES = [
  { name: "SPOTIO", domain: "spotio.com" },
  { name: "Northwind Logistics", domain: "northwind.com" },
  { name: "Brightwave Retail", domain: "brightwave.co" },
  { name: "Power Home Remodeling", domain: "powerhrg.com" },
];

export default function IdentitySection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="text-sm font-semibold mb-3">Company avatar — monogram fallback (default)</h3>
        <div className="flex items-center gap-4">
          {COMPANIES.map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-1.5">
              <CompanyAvatar name={c.name} domain={c.domain} size={44} />
              <span className="text-[11px] [color:var(--faint)]">{c.name.split(" ")[0]}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 ml-4">
            <CompanyAvatar name="SPOTIO" domain="spotio.com" size={28} />
            <CompanyAvatar name="SPOTIO" domain="spotio.com" size={36} />
            <CompanyAvatar name="SPOTIO" domain="spotio.com" size={52} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Company avatar — real logo, graceful fallback (<code>logo</code>)</h3>
        <div className="flex items-center gap-4">
          {COMPANIES.map((c) => (
            <CompanyAvatar key={c.name} name={c.name} domain={c.domain} size={44} logo />
          ))}
          <span className="text-xs [color:var(--faint)]">Loads a real favicon over the monogram; falls back if unavailable. No layout shift.</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-10">
        <div>
          <h3 className="text-sm font-semibold mb-3">Confidence</h3>
          <div className="flex gap-2"><ConfidenceBadge confidence="high" /><ConfidenceBadge confidence="medium" /><ConfidenceBadge confidence="low" /></div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Contact priority (not brand red)</h3>
          <div className="flex gap-2"><PriorityBadge priority="P1" /><PriorityBadge priority="P2" /><PriorityBadge priority="P3" /></div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Email status</h3>
          <div className="flex gap-2"><EmailStatusBadge status="verified" /><EmailStatusBadge status="found" /><EmailStatusBadge status="none" /><EmailStatusBadge status="unknown" /></div>
        </div>
      </div>
    </div>
  );
}
