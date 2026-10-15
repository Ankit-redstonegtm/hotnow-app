// Development-only Companies workspace prototype. 404s in production.
// All data is clearly-labeled sample data (see ./mock.ts); nothing calls an API or persists.
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/Toaster";
import CompaniesWorkspace from "./CompaniesWorkspace";

export const metadata = { title: "HotNow — Companies (Prototype)" };

export default function DevCompaniesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--fg)" }}>
      <Toaster />
      <div className="mx-auto max-w-[1180px] px-5 py-10">
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <p className="section-label">Workspace prototype</p>
            <span className="pill">Sample data</span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight mt-1">Companies</h1>
          <p className="text-sm mt-1 [color:var(--muted)]">
            Development-only interaction prototype. Every company below is fabricated; filtering, selection and
            bulk actions are local only — nothing is fetched, saved, or sent.
          </p>
        </header>
        <CompaniesWorkspace />
      </div>
    </div>
  );
}
