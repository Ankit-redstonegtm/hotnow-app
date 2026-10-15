"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import AuthShowcase from "@/components/AuthShowcase";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preserve any query params (notably ?domain=) across the login <-> signup toggle.
  const [search, setSearch] = useState("");

  useEffect(() => {
    try { setSearch(window.location.search || ""); } catch { /* no-op */ }
  }, []);

  // Head start: if they came from the marketing CTA with ?domain=, warm their
  // research NOW (while they fill in the signup form) and stash it so onboarding
  // can skip straight to the summary without them retyping the domain.
  useEffect(() => {
    if (mode !== "signup") return;
    try {
      const d = new URLSearchParams(window.location.search).get("domain")?.trim();
      if (!d) return;
      localStorage.setItem("hotnow_pw_domain", d);
      fetch("/api/prewarm", {
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
    if (busy) return;
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
    if (googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    const sb = createClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message.includes("provider") ? "Google sign-in isn't enabled yet." : error.message);
      setGoogleBusy(false);
    }
    // on success the browser navigates away to Google; keep the button locked.
  }

  const isSignup = mode === "signup";
  const anyBusy = busy || googleBusy;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* ── Left: authentication ── */}
      <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-10 lg:px-14">
        <header>
          <Link href="/" className="inline-flex items-center text-lg font-semibold tracking-tight focus-ring rounded">
            Hot<span style={{ color: "var(--accent)" }}>Now</span>
          </Link>
        </header>

        <main className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[380px] py-10">
            <h1 className="text-[26px] font-semibold tracking-tight">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
              {isSignup
                ? "Start finding companies worth contacting — every day."
                : "Log in to your HotNow workspace."}
            </p>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="mt-7 w-full"
              onClick={google}
              loading={googleBusy}
              disabled={anyBusy}
            >
              {!googleBusy && (
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.2 4-4 5.4l6.3 5.3C41.9 36.3 44 30.7 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
              )}
              Continue with Google
            </Button>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--faint)" }}>or continue with email</span>
              <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={anyBusy}
                  aria-invalid={error ? true : undefined}
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignup ? "At least 8 characters" : "Your password"}
                    className="pr-11"
                    disabled={anyBusy}
                    aria-invalid={error ? true : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5"
                    style={{ color: "var(--faint)" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    tabIndex={0}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-[var(--radius-sm)] px-3 py-2 text-sm"
                  style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                >
                  {error}
                </p>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={anyBusy}>
                {isSignup ? "Create account" : "Log in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              {isSignup ? (
                <>Already have an account?{" "}
                  <Link href={`/login${search}`} className="font-semibold focus-ring rounded" style={{ color: "var(--accent-ink)" }}>Log in</Link>
                </>
              ) : (
                <>New to HotNow?{" "}
                  <Link href={`/signup${search}`} className="font-semibold focus-ring rounded" style={{ color: "var(--accent-ink)" }}>Create one</Link>
                </>
              )}
            </p>
          </div>
        </main>

        <footer className="text-xs" style={{ color: "var(--faint)" }}>
          © {new Date().getFullYear()} HotNow · Know who to contact today, and why.
        </footer>
      </div>

      {/* ── Right: branded showcase (hidden on mobile) ── */}
      <AuthShowcase />
    </div>
  );
}
