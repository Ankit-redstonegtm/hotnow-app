"use client";
import { useEffect, useState } from "react";

const LEVELS = ["C-Team", "VP", "Director", "Manager", "Staff", "Other"];
const FUNCTIONS = ["Sales & Business Development", "Operations", "Advertising & Marketing", "General Business & Management"];

export default function ContactCriteriaPage() {
  const [levels, setLevels] = useState<string[]>(["C-Team", "VP", "Director"]);
  const [functions, setFunctions] = useState<string[]>(["Sales & Business Development", "Operations"]);
  const [countryCode, setCountry] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => {
      const c = j.settings?.contactCriteria ?? {};
      if (c.jobLevels?.length) setLevels(c.jobLevels);
      if (c.jobFunctions?.length) setFunctions(c.jobFunctions);
      if (c.countryCode) setCountry(c.countryCode);
      setLoaded(true);
    });
  }, []);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    setMsg(null);
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactCriteria: { jobLevels: levels, jobFunctions: functions, countryCode: countryCode || undefined } }) });
    setMsg(r.ok ? "Saved." : "Could not save.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Contact Criteria</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "var(--muted)" }}>Who counts as a decision-maker. We find these roles at every company you discover and rank them P1, P2, and P3 so you reach the right people first.</p>
      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <div className="card p-6 space-y-6">
          <div>
            <label className="label">Seniority levels</label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => <Chip key={l} on={levels.includes(l)} onClick={() => toggle(levels, setLevels, l)}>{l}</Chip>)}
            </div>
          </div>
          <div>
            <label className="label">Departments / functions</label>
            <div className="flex flex-wrap gap-2">
              {FUNCTIONS.map((f) => <Chip key={f} on={functions.includes(f)} onClick={() => toggle(functions, setFunctions, f)}>{f}</Chip>)}
            </div>
          </div>
          <div>
            <label className="label">Country code (optional, e.g. US)</label>
            <input className="input max-w-[160px]" value={countryCode} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="US" />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save}>Save criteria</button>
            {msg && <span className="text-sm" style={{ color: "var(--muted)" }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="pill" style={on ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" } : { cursor: "pointer" }}>
      {on ? "✓ " : ""}{children}
    </button>
  );
}
