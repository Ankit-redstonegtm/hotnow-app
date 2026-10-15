"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Spinner } from "@/components/ui/Spinner";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";

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
        // New path: one Clay workflow produces seller profile + ICP + 5 situations.
        // If Clay isn't configured or won't start, fall through to the Parallel+Gemini
        // path below (no Clay run was created, so there's no double paid run).
        if (process.env.NEXT_PUBLIC_USE_CLAY === "true") {
          const started = await startClayIntelligence(d);
          if (started) {
            await pollUntilDone("/api/seller/intelligence/status", 90);
            await loadSellerAndSituationsIntoUI();
            setResearchState("ready");
            setSignalsState("ready");
            return;
          }
        }

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

  // Start the Clay seller-intelligence run. Returns true if it started (poll the status
  // route next), false if Clay is unavailable/failed to start (caller falls back).
  async function startClayIntelligence(d: string): Promise<boolean> {
    try {
      const res = await fetch("/api/seller/intelligence", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // After Clay completes, populate the studio from the persisted profile + situations.
  async function loadSellerAndSituationsIntoUI() {
    const [sr, situ] = await Promise.all([
      fetch("/api/seller").then((r) => r.json()).catch(() => ({})),
      fetch("/api/situations").then((r) => r.json()).catch(() => ({})),
    ]);
    const p = sr.profile;
    if (p) {
      setProfile({
        company_name: p.company_name, product_description: p.product_description,
        target_customers: p.target_customers, problems_solved: p.problems_solved,
        buyer_personas: p.buyer_personas, industries: p.industries,
      });
      if (p.industries?.length) setIndustries((cur) => cur || p.industries.join(", "));
    }
    if (situ.situations?.length) setSituations(situ.situations);
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
              <span className="chip mb-5">Your AI prospector</span>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                Let&apos;s find companies ready to buy from you.
              </h1>
              <p className="mt-3 text-base" style={{ color: "var(--muted)" }}>
                Start with your website. I&apos;ll study your business and build your targeting while you set your filters.
              </p>
              {error && (
                <div className="card p-3 mt-5 text-sm text-left" role="alert" style={{ color: "var(--accent)" }}>{error}</div>
              )}
              <form onSubmit={submitDomain} className="mt-7 text-left">
                <label className="section-label block mb-2">Your website</label>
                <div className="card p-2 flex flex-col sm:flex-row items-stretch gap-2">
                  <input className="input border-0 shadow-none text-base flex-1" style={{ background: "transparent" }}
                    placeholder="yourcompany.com" value={domain} onChange={(e) => setDomain(e.target.value)} required autoFocus />
                  <button className="btn btn-primary px-5 py-3 text-base" disabled={!domain}>Study my business →</button>
                </div>
                <details className="group mt-3">
                  <summary className="text-sm font-medium cursor-pointer select-none list-none inline-flex items-center gap-1.5"
                    style={{ color: "var(--muted)" }}>
                    <span aria-hidden className="transition-transform motion-reduce:transition-none group-open:rotate-90" style={{ color: "var(--faint)" }}>›</span>
                    Add a line on what you sell
                    <span style={{ color: "var(--faint)" }}>· optional, sharpens the research</span>
                  </summary>
                  <input className="input text-sm mt-2.5" placeholder="e.g. We sell commercial roofing software to contractors"
                    value={desc} onChange={(e) => setDesc(e.target.value)} />
                </details>
              </form>
              <p className="mt-6 text-xs inline-flex items-center gap-1.5" style={{ color: "var(--faint)" }}>
                <Ico name="clock" /> Takes about a minute · you can leave and come back anytime
              </p>
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
        <div className="flex items-center gap-3">
          <CompanyAvatar name={profile?.company_name || domain} domain={domain} size={40} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight leading-none truncate">{profile?.company_name || domain}</h1>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--faint)" }}>{domain}</p>
          </div>
        </div>

        {/* honest background-work status, tied to the real research + signals state */}
        {researchState !== "error" && (researchState === "loading" || signalsState === "loading") ? (
          <div className="card p-3 mt-5 flex items-start gap-3">
            <Spinner size={18} />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight dot">
                {researchState === "loading" ? "Understanding your business" : "Identifying buying situations"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {researchState === "loading"
                  ? "Reading your website to learn what you sell and who buys it."
                  : "Mapping the moments that create demand for you — keep setting your filters."}
                {" "}You can safely leave this page; we&apos;ll pick up right where you left off.
              </p>
            </div>
          </div>
        ) : researchState === "ready" && signalsState === "ready" ? (
          <div className="card p-3 mt-5 flex items-center gap-2.5">
            <span className="inline-grid place-items-center h-6 w-6 rounded-full shrink-0" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
              <Ico name="check" />
            </span>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              <b style={{ color: "var(--fg)" }}>I&apos;ve studied your business.</b> Review the targeting below, then find opportunities.
            </p>
          </div>
        ) : null}

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
            {/* what HotNow understood about the seller — clear, and one click to edit */}
            {researchState === "loading" && !profile ? (
              <div className="card p-5 mb-4">
                <p className="section-label mb-3">What I&apos;m learning about you</p>
                <div className="space-y-2.5" aria-hidden>
                  <div className="skeleton h-3.5 w-3/4 rounded-md" />
                  <div className="skeleton h-3.5 w-5/6 rounded-md" />
                  <div className="skeleton h-3.5 w-1/2 rounded-md" />
                </div>
              </div>
            ) : profile && !editSummary ? (
              <div className="card p-5 mb-4">
                <div className="flex items-center justify-between gap-3 mb-3.5">
                  <p className="section-label">What I understood about you</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditSummary(true)}>Edit</button>
                </div>
                <dl className="space-y-3">
                  {profile.product_description && <Understood label="What you sell" value={profile.product_description} />}
                  {profile.target_customers && <Understood label="Who buys" value={profile.target_customers} />}
                  {profile.problems_solved && <Understood label="Problems you solve" value={profile.problems_solved} />}
                </dl>
              </div>
            ) : editSummary && profile ? (
              <div className="card p-5 mb-4 space-y-3">
                <p className="section-label">Correct anything I got wrong</p>
                <Field label="What you sell" value={profile.product_description ?? ""} textarea onChange={(v) => setProfile({ ...profile, product_description: v })} />
                <Field label="Who buys" value={profile.target_customers ?? ""} textarea onChange={(v) => setProfile({ ...profile, target_customers: v })} />
                <Field label="Problems you solve" value={profile.problems_solved ?? ""} textarea onChange={(v) => setProfile({ ...profile, problems_solved: v })} />
                <div><button className="btn btn-primary btn-sm" onClick={() => setEditSummary(false)}>Done</button></div>
              </div>
            ) : null}
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
                  <label className="label">Industries to focus on {researchState === "loading" && <span className="dot font-normal" style={{ color: "var(--faint)" }}>· filling from your site…</span>}</label>
                  <input className="input" value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Roofing, Solar, Home services" />
                </div>
                <details className="group">
                  <summary className="text-xs font-semibold cursor-pointer select-none list-none inline-flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                    <span aria-hidden className="transition-transform motion-reduce:transition-none group-open:rotate-90" style={{ color: "var(--faint)" }}>›</span>
                    Exclude some industries
                    {excluded.trim() && <span className="pill">on</span>}
                  </summary>
                  <input className="input mt-2" value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="Staffing, Agencies" />
                </details>
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
                  <div className="flex flex-col items-center text-center py-7">
                    <Spinner size={26} />
                    <p className="mt-3 text-sm font-medium dot">Finding the moments that create demand</p>
                    <p className="text-xs mt-1 max-w-sm" style={{ color: "var(--faint)" }}>
                      I&apos;m building these from everything I just learned about your business. Safe to leave — they&apos;ll be here when you&apos;re back.
                    </p>
                  </div>
                ) : situations.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>No signals yet — add your own below to get started.</p>
                ) : (
                  <>
                    <p className="text-xs" style={{ color: "var(--faint)" }}>
                      <b style={{ color: "var(--muted)" }}>{enabledCount}</b> of {situations.length} on · toggle the ones you want us to watch for.
                    </p>
                    <div className="space-y-2">
                      {situations.map((s) => <SignalRow key={s.id} s={s} onToggle={() => patchSituation(s.id, { enabled: !s.enabled })} onEdit={(f) => patchSituation(s.id, f)} />)}
                    </div>
                  </>
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
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-[10px] p-3.5 transition-colors motion-reduce:transition-none"
      style={{ border: "1px solid var(--border)", background: s.enabled ? "var(--surface)" : "var(--surface-2)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold leading-tight" style={{ color: s.enabled ? "var(--fg)" : "var(--muted)" }}>{s.name}</p>
            {s.source === "user" && <span className="pill">custom</span>}
          </div>
          {s.description && <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{s.description}</p>}
        </div>
        <Switch on={s.enabled} onToggle={onToggle} label={`${s.enabled ? "Stop watching" : "Watch"} for ${s.name}`} />
      </div>
      {(s.demand_hypothesis || editing) && (
        <div className="mt-2.5 pl-2.5" style={{ borderLeft: "2px solid var(--border-strong)" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="section-label">Why now</p>
            <button className="text-xs font-medium" style={{ color: "var(--accent-ink)" }} onClick={() => setEditing(!editing)}>
              {editing ? "Done" : "Edit"}
            </button>
          </div>
          {editing
            ? <textarea className="input text-xs min-h-[56px] mt-1.5" value={s.demand_hypothesis} onChange={(e) => onEdit({ demand_hypothesis: e.target.value })} />
            : <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>{s.demand_hypothesis}</p>}
        </div>
      )}
    </div>
  );
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      className="relative shrink-0 rounded-full transition-colors motion-reduce:transition-none focus-ring"
      style={{ width: 40, height: 24, background: on ? "var(--accent)" : "var(--border-strong)" }}>
      <span className="absolute rounded-full bg-white transition-transform motion-reduce:transition-none"
        style={{ width: 20, height: 20, top: 2, left: 2, transform: on ? "translateX(16px)" : "translateX(0)", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
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

function Understood({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-xs font-semibold shrink-0 sm:w-28 pt-0.5" style={{ color: "var(--faint)" }}>{label}</dt>
      <dd className="text-sm leading-relaxed" style={{ color: "var(--fg)" }}>{value}</dd>
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
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  check: "M20 6 9 17l-5-5",
} as const;
function Ico({ name }: { name: keyof typeof ICOS }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICOS[name]} /></svg>;
}

function splitList(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }
function msg(e: unknown) { return e instanceof Error ? e.message : "Something went wrong."; }
