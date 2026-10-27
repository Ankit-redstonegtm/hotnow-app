"use client";
import { apiJson } from "@/lib/workspace";
import { useEffect, useState } from "react";

const LEVELS = ["C-Team", "VP", "Director", "Manager", "Staff", "Other"];
const FUNCTIONS = ["Sales & Business Development", "Operations", "Advertising & Marketing", "General Business & Management"];

export default function ContactCriteriaPage() {
  const [levels, setLevels] = useState<string[]>(["C-Team", "VP", "Director"]);
  const [functions, setFunctions] = useState<string[]>(["Sales & Business Development", "Operations"]);
  const [countryCode, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiJson("/api/settings").then((j) => {
      const c = j.settings?.contactCriteria ?? {};
      if (c.jobLevels?.length) setLevels(c.jobLevels);
      if (c.jobFunctions?.length) setFunctions(c.jobFunctions);
      if (c.countryCode) setCountry(c.countryCode);
      setLoaded(true);
    }).catch(error => { setLoadError(error.message); setLoaded(true); });
  }, []);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    if (saving) return; setSaving(true); setMsg(null);
    try {
    const r = await apiJson("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactCriteria: { jobLevels: levels, jobFunctions: functions, countryCode: countryCode || undefined } }) });
    setMsg("Saved."); return true;
    } catch (error) { setMsg(error instanceof Error ? error.message : "Could not save"); return false; }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Contact Criteria</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "var(--muted)" }}>Who counts as a decision-maker. We find these roles at every company you discover and rank them P1, P2, and P3 so you reach the right people first.</p>
      {loadError ? <div className="card p-4" role="alert">{loadError}<button className="btn btn-ghost btn-sm ml-3" onClick={() => window.location.reload()}>Retry</button></div> : !loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
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
            <label className="label" htmlFor="country-code">Country code (optional, e.g. US)</label>
            <input id="country-code" maxLength={2} className="input max-w-[160px]" value={countryCode} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="US" />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save criteria"}</button>
            {msg && <span role="status" className="text-sm" style={{ color: "var(--muted)" }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-pressed={on} onClick={onClick} className="pill" style={on ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent" } : { cursor: "pointer" }}>
      {on ? "✓ " : ""}{children}
    </button>
  );
}
