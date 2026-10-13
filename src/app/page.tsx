import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="font-semibold tracking-tight text-lg">Hot<span style={{ color: "var(--accent)" }}>Now</span></span>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">Log in</Link>
          <Link href="/signup" className="btn btn-primary">Get started</Link>
        </nav>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 max-w-2xl mx-auto">
        <span className="chip mb-6">Autonomous customer discovery</span>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08]">
          Find companies that need<br />what you sell. <span style={{ color: "var(--accent)" }}>Every day.</span>
        </h1>
        <p className="mt-5 text-lg" style={{ color: "var(--muted)" }}>
          HotNow finds companies experiencing situations that create demand for your
          product — with evidence explaining why each one matters right now.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link href="/signup" className="btn btn-primary px-6 py-3 text-base">Find my customers</Link>
          <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">Log in</Link>
        </div>
        <p className="mt-6 text-xs" style={{ color: "var(--faint)" }}>
          Enter your domain. Confirm what we understand. Get real opportunities with sources.
        </p>
      </section>
    </main>
  );
}
