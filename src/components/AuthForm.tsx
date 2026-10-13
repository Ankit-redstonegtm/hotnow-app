"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sb = createClient();
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Could not sign up.");
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <Link href="/" className="font-semibold tracking-tight text-lg">Hot<span style={{ color: "var(--accent)" }}>Now</span></Link>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {mode === "signup" ? "Start finding customers in minutes." : "Log in to your workspace."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          {error && <p className="text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-sm text-center" style={{ color: "var(--muted)" }}>
          {mode === "signup" ? (
            <>Already have an account? <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>Log in</Link></>
          ) : (
            <>New to HotNow? <Link href="/signup" className="font-medium" style={{ color: "var(--accent)" }}>Create one</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
