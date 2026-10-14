"use client";
import { useEffect, useState } from "react";

const SIZE_RANGES = [
  { label: "Any size", min: null as number | null, max: null as number | null },
  { label: "1 to 50", min: 1, max: 50 },
  { label: "51 to 200", min: 51, max: 200 },
  { label: "201 to 1,000", min: 201, max: 1000 },
  { label: "1,000+", min: 1000, max: null as number | null },
];

export default function CompanyCriteriaPage() {
  const [geographies, setGeo] = useState("");
  const [industries, setInd] = useState("");
  const [excluded, setExc] = useState("");
  const [sizeIdx, setSizeIdx] = useState(0);
  const [dailyTarget, setDaily] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/icp").then((r) => r.json()).then((j) => {
      const i = j.icp; if (i) {
        setGeo((i.geographies ?? []).join(", ")); setInd((i.industries ?? []).join(", "));
        setExc((i.excludedIndustries ?? []).join(", ")); setDaily(i.dailyTarget ?? 5);
        const idx = SIZE_RANGES.findIndex((r) => r.min === (i.sizeMin ?? null) && r.max === (i.sizeMax ?? null));
        setSizeIdx(idx >= 0 ? idx : 0);
      }
      setLoaded(true);
    });
  }, []);

  async function save() {
    setMsg(null);
    const size = SIZE_RANGES[sizeIdx];
    const r = await fetch("/api/icp", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
      geographies: split(geographies), industries: split(industries), excludedIndustries: split(excluded),
      sizeMin: size.min, sizeMax: size.max, dailyTarget,
    }) });
    setMsg(r.ok ? "Saved." : "Could not save.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Company Criteria</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "var(--muted)" }}>A light qualification layer. Your Pain-Qualified Signals do the heavy lifting. This just filters the companies they surface.</p>
      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <div className="card p-6 space-y-4">
          <Field label="Target geographies (comma-separated)" value={geographies} onChange={setGeo} placeholder="United States, Canada" />
          <div>
            <label className="label">Employee size</label>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_RANGES.map((r, i) => (
                <button key={r.label} type="button" className="chip-sel" data-on={i === sizeIdx} onClick={() => setSizeIdx(i)}>{r.label}</button>
              ))}
            </div>
          </div>
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
