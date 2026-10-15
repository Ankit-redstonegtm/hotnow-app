// Art-directed right panel for the auth screens. Purely presentational.
// Everything here is ILLUSTRATIVE sample data — labelled as such — never a live opportunity.
// Dark, self-contained palette (hardcoded, theme-independent) so the composition stays
// consistent regardless of the viewer's light/dark preference. The product card inside is a
// real-looking light surface to read as a layered product preview.

import { Link2, ShieldCheck, ArrowRight } from "lucide-react";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";

const INK = "#0b0b10";

export default function AuthShowcase() {
  return (
    <aside
      className="relative hidden lg:flex flex-col justify-center overflow-hidden px-14 xl:px-20"
      style={{ background: INK, color: "#fff" }}
      aria-hidden="true"
    >
      {/* fine dot texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      {/* one restrained warm glow, top-right */}
      <div
        className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(240,51,59,0.16), transparent 68%)" }}
      />
      {/* hairline edge on the seam */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />

      <div className="relative z-10 max-w-[480px]">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#a7a7b2" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          HotNow intelligence
        </div>

        <h2 className="mt-5 text-[40px] xl:text-[46px] font-semibold leading-[1.05] tracking-[-0.02em]">
          3 companies worth
          <br />
          contacting. <span style={{ color: "#8a8a97" }}>Every day.</span>
        </h2>

        <p className="mt-5 text-[15px] leading-relaxed" style={{ color: "#b7b7c0", maxWidth: 420 }}>
          HotNow finds companies with a reason to buy right now, identifies the right people, and
          helps you start the conversation.
        </p>

        {/* layered product preview */}
        <div className="relative mt-10">
          {/* ghost card behind, for depth */}
          <div
            className="absolute left-4 right-4 -top-3 h-24 rounded-[16px]"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <OpportunityCard />
        </div>

        <p className="mt-5 text-[12px]" style={{ color: "#6b6b76" }}>
          Illustrative example — not a live opportunity.
        </p>
      </div>
    </aside>
  );
}

function OpportunityCard() {
  return (
    <div
      className="relative rounded-[16px] p-5"
      style={{ background: "#fff", color: "#18181b", border: "1px solid #ececf0", boxShadow: "0 24px 60px -20px rgba(0,0,0,0.55)" }}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "#8a8a94" }}>
          Today&apos;s opportunity
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: "#f3f3f5", color: "#71717a", border: "1px solid #ececf0" }}
        >
          Sample preview
        </span>
      </div>

      {/* identity */}
      <div className="flex items-center gap-3">
        <CompanyAvatar name="Power Home Remodeling" domain="powerhrg.com" size={40} logo />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-semibold truncate">Power Home Remodeling</div>
          <div className="text-xs truncate" style={{ color: "#8a8a94" }}>powerhrg.com</div>
        </div>
      </div>

      {/* buying situation */}
      <div className="mt-4">
        <span
          className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold"
          style={{ background: "#f0edf7", color: "#5a4a86" }}
        >
          Expanding field sales operations
        </span>
      </div>

      {/* observed fact vs inferred relevance — kept distinct */}
      <div className="mt-3.5 grid gap-3">
        <Fact label="What happened" body="Opened two new regional offices." />
        <Fact label="Why it matters" body="Expansion may create a need for field sales coordination software." muted />
      </div>

      {/* evidence + confidence */}
      <div className="mt-4 flex items-center gap-3 text-[12px]" style={{ color: "#52525b" }}>
        <span className="inline-flex items-center gap-1.5">
          <Link2 size={13} style={{ color: "#a1a1aa" }} /> 3 sources
        </span>
        <span className="h-3 w-px" style={{ background: "#e4e4e8" }} />
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ background: "#eaf2ec", color: "#2f6b45" }}
        >
          High confidence
        </span>
      </div>

      <div className="my-4 h-px" style={{ background: "#eeeef1" }} />

      {/* contact preview */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold"
          style={{ background: "#eef1f6", color: "#3b4a63" }}
        >
          MB
        </span>
        <div className="min-w-0 leading-tight flex-1">
          <div className="text-[13px] font-semibold truncate">Marcus Bell</div>
          <div className="text-[11px] truncate" style={{ color: "#8a8a94" }}>VP, Field Sales</div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "#2f6b45" }}>
          <ShieldCheck size={13} /> Verified
        </span>
      </div>

      {/* outreach preview */}
      <div className="mt-3.5 rounded-[12px] p-3" style={{ background: "#fafafb", border: "1px solid #eeeef1" }}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#a1a1aa" }}>
          Suggested opening
        </div>
        <p className="text-[12.5px] leading-snug" style={{ color: "#3f3f46" }}>
          &ldquo;Marcus — saw Power opened two new regional offices this quarter. Standing up field
          sales in new metros usually means coordinating reps fast…&rdquo;
        </p>
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent-ink)" }}>
          Draft full message <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}

function Fact({ label, body, muted }: { label: string; body: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#a1a1aa" }}>{label}</div>
      <p className="mt-0.5 text-[13px] leading-snug" style={{ color: muted ? "#6b6b76" : "#27272a" }}>{body}</p>
    </div>
  );
}
