"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";

type Situation = {
  id: string; name: string; description: string; demand_hypothesis: string;
  discovery_objective: string; generator: string; enabled: boolean; source: string;
};

export default function SituationsManager() {
  const router = useRouter();
  const [situations, setSituations] = useState<Situation[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const j = await fetch("/api/situations").then((r) => r.json());
    setSituations(j.situations ?? []);
  }
  useEffect(() => { load(); }, []);

  async function toggle(s: Situation) {
    setSituations((p) => p.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch("/api/situations", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    });
  }

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/discovery/start", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not start.");
      const n = (j.launched ?? []).length;
      if (n === 0) { setMsg(j.message || "Nothing to run — enable a situation first."); setBusy(false); return; }
      router.push("/dashboard?justStarted=1");
    } catch (e) { setMsg(e instanceof Error ? e.message : "error"); setBusy(false); }
  }

  const enabled = situations.filter((s) => s.enabled).length;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-3xl px-5 py-8 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">Buying situations</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Enable the situations to watch, then run discovery. Each enabled situation searches the web for buyers experiencing it.
        </p>

        {msg && <div className="card p-4 mt-4 text-sm" style={{ color: "var(--accent)" }}>{msg}</div>}

        <div className="space-y-3 mt-6">
          {situations.map((s) => (
            <div key={s.id} className="card p-4" style={{ opacity: s.enabled ? 1 : 0.6 }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{s.name}</p>
                    {s.source === "user" && <span className="pill">custom</span>}
                    <span className="pill">{s.generator}</span>
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{s.description}</p>
                </div>
              </div>
            </div>
          ))}
          {situations.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No situations yet.</p>}
        </div>

        <div className="sticky bottom-4 mt-6">
          <button className="btn btn-primary w-full py-3" disabled={busy || enabled === 0} onClick={run}>
            {busy ? "Starting…" : `Find opportunities (${enabled} enabled)`}
          </button>
        </div>
      </div>
    </div>
  );
}
