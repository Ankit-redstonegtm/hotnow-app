// Development-only component gallery. 404s in production.
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/Toaster";
import IdentitySection from "./sections/IdentitySection";
import FormsSection from "./sections/FormsSection";
import OverlaysSection from "./sections/OverlaysSection";
import DataSection from "./sections/DataSection";
import RecordsSection from "./sections/RecordsSection";
import StatesSection from "./sections/StatesSection";

export const metadata = { title: "HotNow UI — Dev Gallery" };

const SECTIONS: Array<{ id: string; title: string; desc: string; Comp: React.ComponentType }> = [
  { id: "identity", title: "Company identity & badges", desc: "Logo-over-monogram avatars; confidence / priority / email-status badges.", Comp: IdentitySection },
  { id: "forms", title: "Buttons & form controls", desc: "Buttons, inputs, fields, checkbox, switch.", Comp: FormsSection },
  { id: "overlays", title: "Selects & overlays", desc: "Select, searchable multiselect, dropdown, tooltip, tabs, dialog.", Comp: OverlaysSection },
  { id: "data", title: "Data table", desc: "Sortable, searchable, selectable companies table.", Comp: DataSection },
  { id: "records", title: "Records & previews", desc: "Buying-situation card, opportunity preview, evidence, outreach.", Comp: RecordsSection },
  { id: "states", title: "Loading, empty & toasts", desc: "Skeletons, empty states, toasts.", Comp: StatesSection },
];

export default function DevUiGallery() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--fg)" }}>
      <Toaster />
      <div className="mx-auto max-w-[1080px] px-5 py-10">
        <header className="mb-2">
          <p className="section-label">HotNow design system</p>
          <h1 className="text-[28px] font-semibold tracking-tight mt-1">Component gallery</h1>
          <p className="text-sm mt-1 [color:var(--muted)]">Development-only. All data below is clearly-labeled sample data; nothing calls an API.</p>
        </header>

        <nav className="flex flex-wrap gap-2 my-6">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="pill focus-ring">{s.title}</a>
          ))}
        </nav>

        <div className="flex flex-col gap-14">
          {SECTIONS.map(({ id, title, desc, Comp }) => (
            <section key={id} id={id} className="scroll-mt-6">
              <div className="mb-4 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <p className="text-sm [color:var(--muted)]">{desc}</p>
              </div>
              <Comp />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
