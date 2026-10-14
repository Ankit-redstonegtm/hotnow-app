"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Signal = {
  id: string; name: string; description: string; demand_hypothesis: string;
  discovery_objective: string; generator: string; enabled: boolean; source: string;
};

export default function SignalsPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const j = await fetch("/api/situations").then((r) => r.json());
    setSignals(j.situations ?? []); setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function toggle(s: Signal) {
    setSignals((p) => p.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch("/api/situations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, enabled: !s.enabled }) });
  }

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/discovery/start", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not start.");
      if ((j.launched ?? []).length === 0) { setMsg(j.message || "Turn on at least one signal first."); setBusy(false); return; }
      router.push("/dashboard/companies");
    } catch (e) { setMsg(e instanceof Error ? e.message : "error"); setBusy(false); }
  }

  const enabled = signals.filter((s) => s.enabled).length;

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pain-Qualified Signals</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>The situations that make a company need what you sell. Turn on the ones worth watching, then start a search.</p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy || enabled === 0}>{busy ? "Starting…" : `Find opportunities (${enabled})`}</button>
      </div>

      {msg && <div className="card p-3 mb-4 text-sm" style={{ color: "var(--accent-ink)" }}>{msg}</div>}

      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-56 rounded" /></div>
      ) : signals.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">Let's figure out what makes companies need your product</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Finish setup and we'll suggest a few situations worth watching to start finding opportunities.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <div key={s.id} className="card p-4" style={{ opacity: s.enabled ? 1 : 0.65 }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{s.name}</p>
                    {s.source === "user" && <span className="pill">custom</span>}
                  </div>
                  <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{s.description}</p>
                  {s.demand_hypothesis && <p className="text-sm mt-2"><span style={{ color: "var(--faint)" }}>Why it matters: </span>{s.demand_hypothesis}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
