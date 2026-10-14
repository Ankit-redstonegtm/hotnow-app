"use client";
import { useEffect, useState } from "react";

export default function CompanyCriteriaPage() {
  const [geographies, setGeo] = useState("");
  const [industries, setInd] = useState("");
  const [excluded, setExc] = useState("");
  const [dailyTarget, setDaily] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/icp").then((r) => r.json()).then((j) => {
      const i = j.icp; if (i) {
        setGeo((i.geographies ?? []).join(", ")); setInd((i.industries ?? []).join(", "));
        setExc((i.excludedIndustries ?? []).join(", ")); setDaily(i.dailyTarget ?? 5);
      }
      setLoaded(true);
    });
  }, []);

  async function save() {
    setMsg(null);
    const r = await fetch("/api/icp", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      geographies: split(geographies), industries: split(industries), excludedIndustries: split(excluded), dailyTarget,
    }) });
    setMsg(r.ok ? "Saved." : "Could not save.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Company Criteria</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "var(--muted)" }}>A light qualification layer. Pain-Qualified Signals do the heavy lifting — this just filters the companies they surface.</p>
      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <div className="card p-6 space-y-4">
          <Field label="Target geographies (comma-separated)" value={geographies} onChange={setGeo} placeholder="United States, Canada" />
          <Field label="Target industries (optional)" value={industries} onChange={setInd} placeholder="Roofing, Solar, Home services" />
          <Field label="Excluded industries" value={excluded} onChange={setExc} placeholder="Staffing, Agencies" />
          <div>
            <label className="label">Opportunities per signal (target)</label>
            <input className="input" type="number" min={1} max={15} value={dailyTarget} onChange={(e) => setDaily(parseInt(e.target.value || "5", 10))} />
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

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><label className="label">{label}</label><input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}
function split(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }
