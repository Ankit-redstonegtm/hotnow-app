"use client";
import { apiFetch } from "@/lib/workspace";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BrandWordmark } from "@/components/marks";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Head start: if they came from the marketing CTA with ?domain=, warm their
  // research NOW (while they fill in the signup form) and stash it so onboarding
  // can skip straight to the summary without them retyping the domain.
  useEffect(() => {
    if (mode !== "signup") return;
    try {
      const d = new URLSearchParams(window.location.search).get("domain")?.trim();
      if (!d) return;
      localStorage.setItem("hotnow_pw_domain", d);
      apiFetch("/api/prewarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: d }),
      }).catch(() => {});
    } catch {
      /* no-op */
    }
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      sessionStorage.removeItem("hotnow_workspace");
      const sb = createClient();
      if (mode === "signup") {
        const res = await apiFetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Could not sign up.");
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      // New signups go to onboarding; returning users to the dashboard
      // (the dashboard layout bounces them to onboarding if they have no profile yet).
      router.push(mode === "signup" ? "/onboarding" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    sessionStorage.removeItem("hotnow_workspace");
    setError(null);
    const sb = createClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message.includes("provider") ? "Google sign-in isn't enabled yet." : error.message);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <Link href="/" className="inline-flex"><BrandWordmark className="text-lg" /></Link>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {mode === "signup" ? "Start finding companies worth contacting." : "Log in to your workspace."}
        </p>

        <button onClick={google} className="btn btn-ghost w-full mt-6 gap-2.5">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.2 4-4 5.4l6.3 5.3C41.9 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
          Continue with Google
        </button>
        <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px" style={{ background: "var(--border)" }} /><span className="text-xs" style={{ color: "var(--faint)" }}>or</span><div className="flex-1 h-px" style={{ background: "var(--border)" }} /></div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="auth-email">Email</label>
            <input id="auth-email" autoComplete="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label className="label" htmlFor="auth-password">Password</label>
            <input id="auth-password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          {error && <p role="alert" className="text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
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
