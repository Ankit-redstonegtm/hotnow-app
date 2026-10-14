"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";

type Step = "domain" | "studio";
type Profile = {
  company_name?: string; product_description?: string; target_customers?: string;
  problems_solved?: string; buyer_personas?: string[]; industries?: string[];
};
type Situation = {
  id: string; name: string; description: string; demand_hypothesis: string;
  discovery_objective: string; match_conditions: { name: string; description: string }[];
  generator: string; enabled: boolean; source: string;
};

const RESEARCH_MSGS = [
  "Reading your website",
  "Learning what you sell",
  "Mapping who buys from you",
  "Finding the moments that create demand",
];

const SIZE_RANGES = [
  { label: "Any size", min: null as number | null, max: null as number | null },
  { label: "1 to 50", min: 1, max: 50 },
  { label: "51 to 200", min: 51, max: 200 },
  { label: "201 to 1,000", min: 201, max: 1000 },
  { label: "1,000+", min: 1000, max: null as number | null },
];

const LEVELS = ["C-Team", "VP", "Director", "Manager"];
const FUNCTIONS = ["Sales & Business Development", "Operations", "Advertising & Marketing", "General Business & Management"];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("domain");
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [desc, setDesc] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editSummary, setEditSummary] = useState(false);
  const [situations, setSituations] = useState<Situation[]>([]);

  // company criteria
  const [geographies, setGeos] = useState("United States");
  const [industries, setIndustries] = useState("");
  const [excluded, setExcluded] = useState("");
  const [sizeIdx, setSizeIdx] = useState(0);
  const [perSignal, setPerSignal] = useState(5);

  // contact criteria
  const [levels, setLevels] = useState<string[]>(["C-Team", "VP", "Director"]);
  const [functions, setFunctions] = useState<string[]>(["Sales & Business Development", "Operations"]);

  // Resume: if the user already has a profile, open the studio directly instead of
  // re-researching. Keeps the setup picking up where they left off.
  useEffect(() => {
    (async () => {
      try {
        const [sr, situ] = await Promise.all([
          fetch("/api/seller").then((r) => r.json()),
          fetch("/api/situations").then((r) => r.json()),
        ]);
        const p = sr.profile;
        if (!p) return;
        setProfile({
          company_name: p.company_name, product_description: p.product_description,
          target_customers: p.target_customers, problems_solved: p.problems_solved,
          buyer_personas: p.buyer_personas, industries: p.industries,
        });
        setDomain(p.domain ?? "");
        if (situ.situations?.length) setSituations(situ.situations);
        const [icp, settings] = await Promise.all([
          fetch("/api/icp").then((r) => r.json()).catch(() => ({})),
          fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
        ]);
        const i = icp.icp;
        if (i) {
          if (i.geographies?.length) setGeos(i.geographies.join(", "));
          if (i.industries?.length) setIndustries(i.industries.join(", "));
          if (i.excludedIndustries?.length) setExcluded(i.excludedIndustries.join(", "));
          if (i.dailyTarget) setPerSignal(i.dailyTarget);
          const idx = SIZE_RANGES.findIndex((r) => r.min === (i.sizeMin ?? null) && r.max === (i.sizeMax ?? null));
          if (idx >= 0) setSizeIdx(idx);
        } else if (p.industries?.length) {
          setIndustries(p.industries.join(", "));
        }
        const cc = settings.settings?.contactCriteria;
        if (cc?.jobLevels?.length) setLevels(cc.jobLevels);
        if (cc?.jobFunctions?.length) setFunctions(cc.jobFunctions);
        setStep("studio");
      } catch { /* stay on domain step */ }
    })();
  }, []);

  function cycleMsgs(msgs: string[]) {
    let i = 0;
    setBusyMsg(msgs[0]);
    const t = setInterval(() => { i = (i + 1) % msgs.length; setBusyMsg(msgs[i]); }, 2600);
    return () => clearInterval(t);
  }

  async function research(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const stop = cycleMsgs(RESEARCH_MSGS);
    try {
      const res = await fetch("/api/seller/research", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, description: desc || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "We could not research that domain. Please check it and try again.");

      const p = await pollUntilDone("/api/seller/research/status", 90);
      const pr = p.profile;
      setProfile(pr ? {
        company_name: pr.companyName, product_description: pr.productDescription,
        target_customers: pr.targetCustomers, problems_solved: pr.problemsSolved,
        buyer_personas: pr.buyerPersonas, industries: pr.industries,
      } : null);
      if (pr?.industries?.length) setIndustries(pr.industries.join(", "));

      await fetch("/api/seller", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(pr ? {
          company_name: pr.companyName, product_description: pr.productDescription,
          target_customers: pr.targetCustomers, problems_solved: pr.problemsSolved,
        } : {}),
      });

      stop(); // research done; hand the loader message over to the signals phase
      await loadOrGenerateSituations();
      setStep("studio");
    } catch (err) { setError(msg(err)); } finally { stop(); setBusy(false); setBusyMsg(""); }
  }

  async function loadOrGenerateSituations() {
    const existing = await fetch("/api/situations").then((r) => r.json());
    if (existing.situations?.length) { setSituations(existing.situations); return; }
    setBusyMsg("Finding the moments that create demand");
    const res = await fetch("/api/situations", { method: "POST" });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "We could not map your buying signals. Please try again.");
    if (j.status === "done" && j.situations) { setSituations(j.situations); return; }
    const done = await pollUntilDone("/api/situations/status", 90);
    setSituations(done.situations ?? []);
  }

  async function pollUntilDone(url: string, maxTries: number): Promise<any> {
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(url);
        const text = await res.text();
        let j: any;
        try { j = JSON.parse(text); } catch { continue; }
        if (j.status === "done") return j;
        if (j.status === "failed") throw new Error(j.error || "That step did not finish. Please try again.");
      } catch (err) {
        if (err instanceof Error && /finish|failed/i.test(err.message)) throw err;
      }
    }
    throw new Error("This is taking longer than usual. Please try again in a moment.");
  }

  async function patchSituation(id: string, fields: Partial<Situation>) {
    setSituations((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));
    await fetch("/api/situations", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
  }

  async function addCustomSituation(ns: { name: string; description: string; objective: string }) {
    const res = await fetch("/api/situations/custom", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(ns),
    });
    const j = await res.json();
    if (res.ok && j.situation) setSituations((p) => [...p, j.situation]);
  }

  const toggleIn = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function launch() {
    setLaunching(true); setError(null);
    try {
      if (profile) {
        await fetch("/api/seller", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify(profile),
        });
      }
      const size = SIZE_RANGES[sizeIdx];
      await fetch("/api/icp", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          geographies: splitList(geographies),
          industries: splitList(industries),
          excludedIndustries: splitList(excluded),
          sizeMin: size.min, sizeMax: size.max,
          dailyTarget: perSignal,
        }),
      });
      await fetch("/api/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactCriteria: { jobLevels: levels, jobFunctions: functions } }),
      });
      const res = await fetch("/api/discovery/start?max=2", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "We could not start the search. Please try again.");
      router.push("/dashboard/companies?justStarted=1");
    } catch (err) { setError(msg(err)); setLaunching(false); }
  }

  const enabledCount = situations.filter((s) => s.enabled).length;

  // ---- domain + loading screen ----
  if (step === "domain") {
    return (
      <div className="min-h-dvh flex flex-col hero-wrap">
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-xl">
            {busy ? (
              <ResearchLoader msg={busyMsg} />
            ) : (
              <div className="text-center">
                <span className="chip mb-5">Set up in under a minute</span>
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                  Find companies ready to buy, right now.
                </h1>
                <p className="mt-3 text-base" style={{ color: "var(--muted)" }}>
                  Tell us your website. We study your business and build your targeting for you.
                </p>
                {error && <div className="card p-3 mt-5 text-sm text-left" style={{ color: "var(--accent)" }}>{error}</div>}
                <form onSubmit={research} className="card p-2 mt-7 flex flex-col sm:flex-row items-stretch gap-2 text-left">
                  <input className="input border-0 shadow-none text-base flex-1" style={{ background: "transparent" }}
                    placeholder="yourcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} required autoFocus />
                  <button className="btn btn-primary px-5 py-3 text-base" disabled={!domain}>Build my targeting</button>
                </form>
                <div className="mt-3">
                  <input className="input text-sm" placeholder="Optional: one line on what you sell"
                    value={desc} onChange={(e) => setDesc(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- studio: the three connected panels ----
  const size = SIZE_RANGES[sizeIdx];
  return (
    <div className="min-h-dvh flex flex-col hero-wrap">
      <TopBar />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 flex-1 pb-28">
        {/* header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-grid place-items-center h-8 w-8 rounded-lg text-white font-bold" style={{ background: "var(--accent)" }}>
                {(profile?.company_name || domain).slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight leading-none">{profile?.company_name || domain}</h1>
                <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>We studied your business. Review your targeting below.</p>
              </div>
            </div>
            {profile?.product_description && !editSummary && (
              <p className="text-sm mt-3 max-w-2xl" style={{ color: "var(--muted)" }}>
                {profile.product_description}{" "}
                <button className="font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setEditSummary(true)}>Edit</button>
              </p>
            )}
          </div>
        </div>

        {editSummary && profile && (
          <div className="card p-5 mt-4 space-y-3">
            <Field label="What you sell" value={profile.product_description ?? ""} textarea onChange={(v) => setProfile({ ...profile, product_description: v })} />
            <Field label="Who buys" value={profile.target_customers ?? ""} textarea onChange={(v) => setProfile({ ...profile, target_customers: v })} />
            <Field label="Problems you solve" value={profile.problems_solved ?? ""} textarea onChange={(v) => setProfile({ ...profile, problems_solved: v })} />
            <div><button className="btn btn-ghost btn-sm" onClick={() => setEditSummary(false)}>Done</button></div>
          </div>
        )}

        {/* pipeline preview: the dots connect here */}
        <div className="card p-4 mt-6 overflow-x-auto">
          <div className="pipe">
            <PipeNode color="var(--accent)">Target companies</PipeNode>
            <PipeSep />
            <PipeNode color="var(--accent)">Catch the buying moment</PipeNode>
            <PipeSep />
            <PipeNode color="var(--info)">Reach the decision-makers</PipeNode>
            <PipeSep />
            <PipeNode color="var(--good)">Get verified emails</PipeNode>
          </div>
          <p className="text-xs mt-2.5" style={{ color: "var(--faint)" }}>
            The three settings below drive this. Companies come first, then we find who to contact and their emails automatically.
          </p>
        </div>

        {error && <div className="card p-3 mt-5 text-sm" style={{ color: "var(--accent)" }}>{error}</div>}

        {/* three panels */}
        <div className="mt-6 flex flex-col lg:flex-row items-stretch gap-0">
          {/* 1. Company criteria */}
          <div className="relative flex-1 min-w-0 lg:mt-3">
            <span className="step-badge">1 · Companies</span>
            <div className="panel h-full">
              <div className="panel-head">
                <span className="panel-ico" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Ico name="building" /></span>
                <div><p className="font-semibold text-sm">Company criteria</p><p className="text-xs" style={{ color: "var(--faint)" }}>Who you want to sell to</p></div>
              </div>
              <div className="panel-body">
                <div>
                  <label className="label">Geographies</label>
                  <input className="input" value={geographies} onChange={(e) => setGeos(e.target.value)} placeholder="United States, Canada" />
                </div>
                <div>
                  <label className="label">Employee size</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SIZE_RANGES.map((r, i) => (
                      <button key={r.label} type="button" className="chip-sel" data-on={i === sizeIdx} onClick={() => setSizeIdx(i)}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Industries to focus on</label>
                  <input className="input" value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Roofing, Solar, Home services" />
                </div>
                <div>
                  <label className="label">Industries to exclude</label>
                  <input className="input" value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="Staffing, Agencies" />
                </div>
              </div>
            </div>
          </div>

          <Flow />

          {/* 2. Pain-Qualified Signals */}
          <div className="relative flex-1 min-w-0 lg:mt-3">
            <span className="step-badge">2 · Signals</span>
            <div className="panel h-full">
              <div className="panel-head">
                <span className="panel-ico" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Ico name="signal" /></span>
                <div><p className="font-semibold text-sm">Pain-Qualified Signals</p><p className="text-xs" style={{ color: "var(--faint)" }}>The moments that create demand</p></div>
              </div>
              <div className="panel-body">
                {situations.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No signals yet.</p>
                ) : (
                  <div className="space-y-2">
                    {situations.map((s) => <SignalRow key={s.id} s={s} onToggle={() => patchSituation(s.id, { enabled: !s.enabled })} onEdit={(f) => patchSituation(s.id, f)} />)}
                  </div>
                )}
                <AddSignal onAdd={addCustomSituation} />
              </div>
            </div>
          </div>

          <Flow />

          {/* 3. Contact criteria */}
          <div className="relative flex-1 min-w-0 lg:mt-3">
            <span className="step-badge">3 · Contacts</span>
            <div className="panel h-full">
              <div className="panel-head">
                <span className="panel-ico" style={{ background: "#e8f0fe", color: "#1b4fd0" }}><Ico name="users" /></span>
                <div><p className="font-semibold text-sm">Contact criteria</p><p className="text-xs" style={{ color: "var(--faint)" }}>Who we reach inside each company</p></div>
              </div>
              <div className="panel-body">
                <div className="space-y-2">
                  <Tier tag="P1" tagClass="pill-p1" title="Primary decision-makers" sub="Founders, C-suite, VPs" />
                  <Tier tag="P2" tagClass="pill-p2" title="Champions and influencers" sub="Directors, heads, senior managers" />
                  <Tier tag="P3" tagClass="pill-p3" title="Wider buying team" sub="Everyone else who may weigh in" />
                </div>
                <div>
                  <label className="label">Prioritize these seniorities</label>
                  <div className="flex flex-wrap gap-1.5">
                    {LEVELS.map((l) => <button key={l} type="button" className="chip-sel" data-on={levels.includes(l)} onClick={() => toggleIn(levels, setLevels, l)}>{l}</button>)}
                  </div>
                </div>
                <div>
                  <label className="label">In these teams</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FUNCTIONS.map((f) => <button key={f} type="button" className="chip-sel" data-on={functions.includes(f)} onClick={() => toggleIn(functions, setFunctions, f)}>{f.replace(" & Business Development", "").replace("General Business & Management", "Management").replace("Advertising & Marketing", "Marketing")}</button>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* sticky launch bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t backdrop-blur" style={{ borderColor: "var(--border)", background: "rgba(250,248,246,.86)" }}>
        <div className="mx-auto max-w-6xl px-5 py-3 flex items-center justify-between gap-4">
          <p className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>
            <b style={{ color: "var(--fg)" }}>{enabledCount}</b> signal{enabledCount === 1 ? "" : "s"} on · {size.label.toLowerCase()} · {geographies.split(",")[0] || "anywhere"}
          </p>
          <button className="btn btn-primary px-6 py-3 text-base w-full sm:w-auto" disabled={launching || enabledCount === 0} onClick={launch}>
            {launching ? "Starting the search" : "Find opportunities"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function ResearchLoader({ msg }: { msg: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="flex justify-center">
        <span className="spin inline-block h-7 w-7 rounded-full border-[3px]" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
      <p className="mt-5 font-semibold dot">{msg || "Working"}</p>
      <p className="text-sm mt-1" style={{ color: "var(--faint)" }}>This usually takes under a minute. You can keep this tab open.</p>
      <div className="flex items-center justify-center flex-nowrap gap-1.5 mt-6 opacity-80 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />Your business</span>
        <span style={{ color: "var(--faint)" }}>›</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />Your buyers</span>
        <span style={{ color: "var(--faint)" }}>›</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--info)" }} />Your signals</span>
      </div>
    </div>
  );
}

function PipeNode({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="pipe-node">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
function PipeSep() {
  return (
    <span className="pipe-sep" aria-hidden>
      <svg width="22" height="12" viewBox="0 0 22 12" fill="none"><path d="M1 6h17m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

function Flow() {
  return (
    <div className="flow-line px-2 py-2 lg:py-0 lg:px-1">
      <svg className="flow-dot hidden lg:block" width="28" height="14" viewBox="0 0 28 14" fill="none">
        <path d="M1 7h22m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg className="flow-dot lg:hidden" width="14" height="22" viewBox="0 0 14 22" fill="none">
        <path d="M7 1v18m0 0-5-5m5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Tier({ tag, tagClass, title, sub }: { tag: string; tagClass: string; title: string; sub: string }) {
  return (
    <div className="tier">
      <span className={`tier-tag pill ${tagClass}`}>{tag}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--faint)" }}>{sub}</p>
      </div>
    </div>
  );
}

function SignalRow({ s, onToggle, onEdit }: { s: Situation; onToggle: () => void; onEdit: (f: Partial<Situation>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[10px] p-3" style={{ border: "1px solid var(--border)", background: s.enabled ? "var(--surface)" : "var(--surface-2)", opacity: s.enabled ? 1 : 0.7 }}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={s.enabled} onChange={onToggle} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium leading-tight">{s.name}</p>
            {s.source === "user" && <span className="pill">custom</span>}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.description}</p>
          <button className="text-xs mt-1.5 font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Why this matters"}
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              <textarea className="input text-xs min-h-[52px]" value={s.demand_hypothesis} onChange={(e) => onEdit({ demand_hypothesis: e.target.value })} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSignal({ onAdd }: { onAdd: (s: { name: string; description: string; objective: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [objective, setObjective] = useState("");
  if (!open) return <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => setOpen(true)}>+ Add your own signal</button>;
  return (
    <div className="rounded-[10px] p-3 space-y-2" style={{ border: "1px solid var(--border)" }}>
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Describe it" value={description} onChange={setDescription} textarea />
      <Field label="What to look for at buyers" value={objective} onChange={setObjective} textarea />
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm flex-1" disabled={!name || !objective}
          onClick={() => { onAdd({ name, description, objective }); setOpen(false); setName(""); setDescription(""); setObjective(""); }}>Add</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea
        ? <textarea className="input min-h-[64px] resize-y text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className="input text-sm" value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

const ICOS = {
  building: "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 21V9h5a1 1 0 0 1 1 1v11M7 8h2M7 12h2M7 16h2",
  signal: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11",
} as const;
function Ico({ name }: { name: keyof typeof ICOS }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICOS[name]} /></svg>;
}

function splitList(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }
function msg(e: unknown) { return e instanceof Error ? e.message : "Something went wrong."; }
