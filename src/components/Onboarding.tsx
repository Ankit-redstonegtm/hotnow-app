"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";

type Step = "domain" | "studio";
type StudioStep = "company" | "contacts" | "signals";
type LoadState = "idle" | "loading" | "ready" | "error";
type Profile = {
  company_name?: string; product_description?: string; target_customers?: string;
  problems_solved?: string; buyer_personas?: string[]; industries?: string[];
};
type Situation = {
  id: string; name: string; description: string; demand_hypothesis: string;
  discovery_objective: string; match_conditions: { name: string; description: string }[];
  generator: string; enabled: boolean; source: string;
};

const SIZE_RANGES = [
  { label: "Any size", min: null as number | null, max: null as number | null },
  { label: "1 to 50", min: 1, max: 50 },
  { label: "51 to 200", min: 51, max: 200 },
  { label: "201 to 1,000", min: 201, max: 1000 },
  { label: "1,000+", min: 1000, max: null as number | null },
];

const LEVELS = ["C-Team", "VP", "Director", "Manager"];
const FUNCTIONS = ["Sales & Business Development", "Operations", "Advertising & Marketing", "General Business & Management"];

const STUDIO_ORDER: StudioStep[] = ["company", "contacts", "signals"];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("domain");
  const [studioStep, setStudioStep] = useState<StudioStep>("company");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Background work states. The studio appears IMMEDIATELY; research + signals
  // stream into their panels while the user fills company + contact criteria.
  const [researchState, setResearchState] = useState<LoadState>("idle");
  const [signalsState, setSignalsState] = useState<LoadState>("idle");

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

  // Resume: if the user already has a profile, open the studio directly with
  // everything prefilled. Otherwise, if they arrived from the marketing CTA, their
  // research is pre-warming - kick off the (non-blocking) flow automatically.
  useEffect(() => {
    (async () => {
      try {
        const [sr, situ] = await Promise.all([
          fetch("/api/seller").then((r) => r.json()),
          fetch("/api/situations").then((r) => r.json()),
        ]);
        const p = sr.profile;
        if (!p) {
          try {
            const pw = localStorage.getItem("hotnow_pw_domain");
            if (pw) {
              localStorage.removeItem("hotnow_pw_domain");
              setDomain(pw);
              beginSetup(pw);
            }
          } catch { /* no-op */ }
          return;
        }
        setProfile({
          company_name: p.company_name, product_description: p.product_description,
          target_customers: p.target_customers, problems_solved: p.problems_solved,
          buyer_personas: p.buyer_personas, industries: p.industries,
        });
        setDomain(p.domain ?? "");
        setResearchState("ready");
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

        if (situ.situations?.length) { setSituations(situ.situations); setSignalsState("ready"); }
        else { void generateSignals(); }
        setStep("studio");
      } catch { /* stay on domain step */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submitDomain(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim();
    if (!d) return;
    beginSetup(d);
  }

  // Non-blocking: jump straight into the studio and run research (then signals) in
  // the background. The user starts on Company criteria right away - no waiting.
  function beginSetup(domainArg: string) {
    const d = domainArg.trim();
    if (!d) return;
    setError(null);
    setStep("studio");
    setStudioStep("company");
    setResearchState("loading");
    setSignalsState("idle");

    (async () => {
      try {
        const res = await fetch("/api/seller/research", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ domain: d, description: desc || undefined }),
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
        if (pr?.industries?.length) setIndustries((cur) => cur || pr.industries.join(", "));

        await fetch("/api/seller", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify(pr ? {
            company_name: pr.companyName, product_description: pr.productDescription,
            target_customers: pr.targetCustomers, problems_solved: pr.problemsSolved,
          } : {}),
        });
        setResearchState("ready");

        // Chain signals right after research - still in the background, so by the
        // time the user reaches step 3 they're usually already here.
        await generateSignals();
      } catch (err) {
        setResearchState("error");
        setSignalsState("error");
        setError(msg(err));
      }
    })();
  }

  async function generateSignals() {
    setSignalsState("loading");
    try {
      const existing = await fetch("/api/situations").then((r) => r.json());
      if (existing.situations?.length) { setSituations(existing.situations); setSignalsState("ready"); return; }
      const res = await fetch("/api/situations", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "We could not map your buying signals. Please try again.");
      if (j.status === "done" && j.situations) { setSituations(j.situations); setSignalsState("ready"); return; }
      const done = await pollUntilDone("/api/situations/status", 90);
      setSituations(done.situations ?? []);
      setSignalsState("ready");
    } catch (err) {
      setSignalsState("error");
      setError(msg(err));
    }
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
  const size = SIZE_RANGES[sizeIdx];
  const stepIdx = STUDIO_ORDER.indexOf(studioStep);
  const goNext = () => setStudioStep(STUDIO_ORDER[Math.min(stepIdx + 1, STUDIO_ORDER.length - 1)]);
  const goBack = () => setStudioStep(STUDIO_ORDER[Math.max(stepIdx - 1, 0)]);

  // ---- domain entry ----
  if (step === "domain") {
    return (
      <div className="min-h-dvh flex flex-col hero-wrap">
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-xl">
            <div className="text-center">
              <span className="chip mb-5">Set up in under a minute</span>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                Find companies ready to buy, right now.
              </h1>
              <p className="mt-3 text-base" style={{ color: "var(--muted)" }}>
                Tell us your website. We study your business and build your targeting while you set your filters.
              </p>
              {error && <div className="card p-3 mt-5 text-sm text-left" style={{ color: "var(--accent)" }}>{error}</div>}
              <form onSubmit={submitDomain} className="card p-2 mt-7 flex flex-col sm:flex-row items-stretch gap-2 text-left">
                <input className="input border-0 shadow-none text-base flex-1" style={{ background: "transparent" }}
                  placeholder="yourcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} required autoFocus />
                <button className="btn btn-primary px-5 py-3 text-base" disabled={!domain}>Start set-up</button>
              </form>
              <div className="mt-3">
                <input className="input text-sm" placeholder="Optional: one line on what you sell"
                  value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- studio: a 3-step journey. Research + signals load in the background. ----
  return (
    <div className="min-h-dvh flex flex-col hero-wrap">
      <TopBar />
      <div className="mx-auto w-full max-w-3xl px-5 py-8 flex-1 pb-28">
        {/* header */}
        <div className="flex items-center gap-2">
          <span className="inline-grid place-items-center h-8 w-8 rounded-lg text-white font-bold" style={{ background: "var(--accent)" }}>
            {(profile?.company_name || domain).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight leading-none truncate">{profile?.company_name || domain}</h1>
            <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>
              {researchState === "loading" ? "Studying your website in the background…" : "We studied your business. Set your targeting below."}
            </p>
          </div>
        </div>

        {/* stepper */}
        <div className="card p-3 mt-5">
          <div className="flex items-center gap-1 overflow-x-auto">
            <StepPill n={1} label="Companies" active={studioStep === "company"} done={stepIdx > 0} onClick={() => setStudioStep("company")} />
            <StepArrow />
            <StepPill n={2} label="Contacts" active={studioStep === "contacts"} done={stepIdx > 1} onClick={() => setStudioStep("contacts")} />
            <StepArrow />
            <StepPill n={3} label="Signals" active={studioStep === "signals"} done={false}
              hint={signalsState === "loading" ? "preparing…" : signalsState === "ready" ? `${enabledCount} on` : undefined}
              onClick={() => setStudioStep("signals")} />
          </div>
        </div>

        {error && <div className="card p-3 mt-5 text-sm" style={{ color: "var(--accent)" }}>{error}</div>}

        {/* ---------- STEP 1: COMPANY ---------- */}
        {studioStep === "company" && (
          <div className="mt-6">
            {profile?.product_description && !editSummary && (
              <p className="text-sm mb-4 max-w-2xl" style={{ color: "var(--muted)" }}>
                {profile.product_description}{" "}
                <button className="font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setEditSummary(true)}>Edit</button>
              </p>
            )}
            {editSummary && profile && (
              <div className="card p-5 mb-4 space-y-3">
                <Field label="What you sell" value={profile.product_description ?? ""} textarea onChange={(v) => setProfile({ ...profile, product_description: v })} />
                <Field label="Who buys" value={profile.target_customers ?? ""} textarea onChange={(v) => setProfile({ ...profile, target_customers: v })} />
                <Field label="Problems you solve" value={profile.problems_solved ?? ""} textarea onChange={(v) => setProfile({ ...profile, problems_solved: v })} />
                <div><button className="btn btn-ghost btn-sm" onClick={() => setEditSummary(false)}>Done</button></div>
              </div>
            )}
            <div className="panel">
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
                  <label className="label">Industries to focus on {researchState === "loading" && <span style={{ color: "var(--faint)" }}>· filling from your site…</span>}</label>
                  <input className="input" value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Roofing, Solar, Home services" />
                </div>
                <div>
                  <label className="label">Industries to exclude</label>
                  <input className="input" value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="Staffing, Agencies" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------- STEP 2: CONTACTS ---------- */}
        {studioStep === "contacts" && (
          <div className="mt-6">
            <div className="panel">
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
        )}

        {/* ---------- STEP 3: SIGNALS ---------- */}
        {studioStep === "signals" && (
          <div className="mt-6">
            <div className="panel">
              <div className="panel-head">
                <span className="panel-ico" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Ico name="signal" /></span>
                <div><p className="font-semibold text-sm">Pain-Qualified Signals</p><p className="text-xs" style={{ color: "var(--faint)" }}>The moments that create demand for you</p></div>
              </div>
              <div className="panel-body">
                {signalsState === "loading" || (signalsState === "idle" && situations.length === 0) ? (
                  <div className="text-center py-6">
                    <span className="spin inline-block h-6 w-6 rounded-full border-[3px]" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                    <p className="mt-3 text-sm font-medium dot">Finding the moments that create demand</p>
                    <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>We build these from everything we just learned about your business.</p>
                  </div>
                ) : situations.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No signals yet. Add your own below.</p>
                ) : (
                  <div className="space-y-2">
                    {situations.map((s) => <SignalRow key={s.id} s={s} onToggle={() => patchSituation(s.id, { enabled: !s.enabled })} onEdit={(f) => patchSituation(s.id, f)} />)}
                  </div>
                )}
                <AddSignal onAdd={addCustomSituation} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* sticky footer nav */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t backdrop-blur" style={{ borderColor: "var(--border)", background: "rgba(250,248,246,.86)" }}>
        <div className="mx-auto max-w-3xl px-5 py-3 flex items-center justify-between gap-4">
          {stepIdx > 0 ? (
            <button className="btn btn-ghost" onClick={goBack}>← Back</button>
          ) : (
            <p className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>Step 1 of 3 · set who you want to reach</p>
          )}

          {studioStep !== "signals" ? (
            <button className="btn btn-primary px-6 py-3 text-base" onClick={goNext}>
              {studioStep === "company" ? "Next: who to contact →" : "Next: your signals →"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>
                {signalsState === "loading" ? "Finishing your signals…" : <><b style={{ color: "var(--fg)" }}>{enabledCount}</b> signal{enabledCount === 1 ? "" : "s"} on · {size.label.toLowerCase()}</>}
              </p>
              <button className="btn btn-primary px-6 py-3 text-base" disabled={launching || signalsState === "loading" || enabledCount === 0} onClick={launch}>
                {launching ? "Starting the search" : signalsState === "loading" ? "Preparing…" : "Find opportunities"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function StepPill({ n, label, active, done, hint, onClick }: { n: number; label: string; active: boolean; done: boolean; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap"
      style={{ background: active ? "var(--accent-soft)" : "transparent" }}>
      <span className="inline-grid place-items-center h-5 w-5 rounded-full text-[11px] font-bold text-white"
        style={{ background: active || done ? "var(--accent)" : "var(--faint)" }}>{done ? "✓" : n}</span>
      <span className="text-sm font-medium" style={{ color: active ? "var(--accent-ink)" : "var(--muted)" }}>{label}</span>
      {hint && <span className="text-xs" style={{ color: "var(--faint)" }}>· {hint}</span>}
    </button>
  );
}
function StepArrow() {
  return <span style={{ color: "var(--faint)" }} aria-hidden>›</span>;
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
