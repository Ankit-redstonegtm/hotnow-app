"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";

type Step = "domain" | "confirm" | "situations" | "icp" | "launch";
type Profile = {
  company_name?: string; product_description?: string; target_customers?: string;
  problems_solved?: string; buyer_personas?: string[]; industries?: string[];
};
type Situation = {
  id: string; name: string; description: string; demand_hypothesis: string;
  discovery_objective: string; match_conditions: { name: string; description: string }[];
  generator: string; enabled: boolean; source: string;
};

const RESEARCH_MSGS = ["Understanding your business…", "Identifying your customers…", "Mapping the problems you solve…"];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("domain");
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [desc, setDesc] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [geographies, setGeos] = useState("United States");
  const [excluded, setExcluded] = useState("");
  const [dailyTarget, setDaily] = useState(5);

  function cycleMsgs(msgs: string[]) {
    let i = 0;
    setBusyMsg(msgs[0]);
    const t = setInterval(() => { i = (i + 1) % msgs.length; setBusyMsg(msgs[i]); }, 2500);
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
      if (!res.ok) throw new Error(j.error || "Research failed.");

      const p = await pollUntilDone("/api/seller/research/status", 90);
      const pr = p.profile;
      setProfile(pr ? {
        company_name: pr.companyName, product_description: pr.productDescription,
        target_customers: pr.targetCustomers, problems_solved: pr.problemsSolved,
        buyer_personas: pr.buyerPersonas, industries: pr.industries,
      } : null);
      setStep("confirm");
    } catch (err) { setError(msg(err)); } finally { stop(); setBusy(false); setBusyMsg(""); }
  }

  async function saveConfirm() {
    setBusy(true); setError(null);
    try {
      await fetch("/api/seller", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      await loadOrGenerateSituations();
      setStep("situations");
    } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  }

  async function loadOrGenerateSituations() {
    const existing = await fetch("/api/situations").then((r) => r.json());
    if (existing.situations?.length) { setSituations(existing.situations); return; }
    const stop = cycleMsgs(["Finding situations that create demand…", "Framing them around your buyers…"]);
    try {
      const res = await fetch("/api/situations", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not generate situations.");
      if (j.status === "done" && j.situations) { setSituations(j.situations); return; }
      const done = await pollUntilDone("/api/situations/status", 90);
      setSituations(done.situations ?? []);
    } finally { stop(); }
  }

  // Poll a status endpoint until status==='done'. Tolerant of transient non-JSON
  // responses (e.g. a one-off edge/timeout) — those are ignored and polling continues.
  async function pollUntilDone(url: string, maxTries: number): Promise<any> {
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(url);
        const text = await res.text();
        let j: any;
        try { j = JSON.parse(text); } catch { continue; } // not JSON → transient, keep polling
        if (j.status === "done") return j;
        if (j.status === "failed") throw new Error(j.error || "That step failed. Please try again.");
      } catch (err) {
        if (err instanceof Error && /failed/i.test(err.message)) throw err;
        // network blip → keep polling
      }
    }
    throw new Error("This is taking longer than expected. Please try again in a moment.");
  }

  async function patchSituation(id: string, fields: Partial<Situation>) {
    setSituations((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));
    await fetch("/api/situations", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
  }

  async function saveIcpAndContinue() {
    setBusy(true); setError(null);
    try {
      await fetch("/api/icp", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          geographies: splitList(geographies),
          excludedIndustries: splitList(excluded),
          dailyTarget,
        }),
      });
      setStep("launch");
    } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  }

  async function launch() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/discovery/start?max=2", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not start discovery.");
      router.push("/dashboard?justStarted=1");
    } catch (err) { setError(msg(err)); setBusy(false); }
  }

  const enabledCount = situations.filter((s) => s.enabled).length;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-2xl px-5 py-10 flex-1">
        <Steps step={step} />

        {error && <div className="card p-4 mb-5 text-sm" style={{ color: "var(--accent)" }}>{error}</div>}

        {busy && busyMsg && (
          <div className="card p-6 mb-5 flex items-center gap-3">
            <Spinner /><span className="text-sm dot">{busyMsg}</span>
          </div>
        )}

        {step === "domain" && (
          <form onSubmit={research} className="card p-7">
            <h2 className="text-xl font-semibold tracking-tight">What do you sell?</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Enter your company domain. We&apos;ll research it.</p>
            <div className="mt-5">
              <label className="label">Company domain</label>
              <input className="input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
            </div>
            <div className="mt-4">
              <label className="label">Optional: one line on what you sell</label>
              <input className="input" placeholder="e.g. Field-sales management software" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <button className="btn btn-primary w-full mt-6" disabled={busy || !domain}>Research my company</button>
          </form>
        )}

        {step === "confirm" && profile && (
          <div className="card p-7">
            <h2 className="text-xl font-semibold tracking-tight">Here&apos;s what we understand</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Correct anything — we&apos;ll use it for discovery.</p>
            <div className="mt-5 space-y-4">
              <Field label="Company" value={profile.company_name ?? ""} onChange={(v) => setProfile({ ...profile, company_name: v })} />
              <Field label="What you sell" value={profile.product_description ?? ""} textarea onChange={(v) => setProfile({ ...profile, product_description: v })} />
              <Field label="Who buys" value={profile.target_customers ?? ""} textarea onChange={(v) => setProfile({ ...profile, target_customers: v })} />
              <Field label="Problems you solve" value={profile.problems_solved ?? ""} textarea onChange={(v) => setProfile({ ...profile, problems_solved: v })} />
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn btn-ghost" onClick={() => setStep("domain")}>Back</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={saveConfirm}>Looks right — continue</button>
            </div>
          </div>
        )}

        {step === "situations" && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Buying situations</h2>
            <p className="mt-1 mb-4 text-sm" style={{ color: "var(--muted)" }}>
              Events at your buyers that create demand. Enable the ones worth watching.
            </p>
            <div className="space-y-3">
              {situations.map((s) => (
                <SituationCard key={s.id} s={s} onToggle={() => patchSituation(s.id, { enabled: !s.enabled })} onEdit={(f) => patchSituation(s.id, f)} />
              ))}
            </div>
            <AddSituation onAdd={async (ns) => { await loadAfterAdd(ns, setSituations); }} />
            <div className="flex gap-3 mt-6">
              <button className="btn btn-ghost" onClick={() => setStep("confirm")}>Back</button>
              <button className="btn btn-primary flex-1" disabled={enabledCount === 0} onClick={() => setStep("icp")}>
                Continue ({enabledCount} enabled)
              </button>
            </div>
          </div>
        )}

        {step === "icp" && (
          <div className="card p-7">
            <h2 className="text-xl font-semibold tracking-tight">Who should qualify?</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>A light filter. Situations do the heavy lifting.</p>
            <div className="mt-5 space-y-4">
              <Field label="Target geographies (comma-separated)" value={geographies} onChange={setGeos} />
              <Field label="Excluded industries (comma-separated)" value={excluded} onChange={setExcluded} />
              <div>
                <label className="label">Opportunities per situation (target)</label>
                <input className="input" type="number" min={1} max={15} value={dailyTarget} onChange={(e) => setDaily(parseInt(e.target.value || "5", 10))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn btn-ghost" onClick={() => setStep("situations")}>Back</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={saveIcpAndContinue}>Continue</button>
            </div>
          </div>
        )}

        {step === "launch" && (
          <div className="card p-7 text-center">
            <h2 className="text-xl font-semibold tracking-tight">Ready to find opportunities</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              We&apos;ll research the web for companies experiencing your top situations and verify each with evidence.
              This takes a few minutes — you&apos;ll watch results land on your dashboard.
            </p>
            <button className="btn btn-primary w-full mt-6 py-3 text-base" disabled={busy} onClick={launch}>
              {busy ? "Starting…" : "Find opportunities"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function loadAfterAdd(ns: { name: string; description: string; objective: string }, set: (fn: (p: Situation[]) => Situation[]) => void) {
  // persist by regenerating list through PATCH is not ideal; instead add client-side then save via a dedicated call
  const res = await fetch("/api/situations/custom", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(ns),
  });
  const j = await res.json();
  if (res.ok && j.situation) set((p) => [...p, j.situation]);
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["domain", "confirm", "situations", "icp", "launch"];
  const labels: Record<Step, string> = { domain: "Domain", confirm: "Confirm", situations: "Situations", icp: "ICP", launch: "Launch" };
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-7 text-xs" style={{ color: "var(--muted)" }}>
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full font-medium"
            style={{ background: i <= idx ? "var(--accent)" : "#eee7e1", color: i <= idx ? "#fff" : "var(--faint)" }}>{i + 1}</span>
          <span style={{ color: i === idx ? "var(--fg)" : undefined, fontWeight: i === idx ? 600 : 400 }}>{labels[s]}</span>
          {i < order.length - 1 && <span style={{ color: "var(--faint)" }}>›</span>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea
        ? <textarea className="input min-h-[72px] resize-y" value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function SituationCard({ s, onToggle, onEdit }: { s: Situation; onToggle: () => void; onEdit: (f: Partial<Situation>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4" style={{ opacity: s.enabled ? 1 : 0.6 }}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={s.enabled} onChange={onToggle} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{s.name}</p>
            {s.source === "user" && <span className="pill">custom</span>}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{s.description}</p>
          <button className="text-xs mt-2" style={{ color: "var(--accent)" }} onClick={() => setOpen(!open)}>
            {open ? "Hide details" : "Why this matters & how we search"}
          </button>
          {open && (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <span className="label">Why it creates demand</span>
                <textarea className="input min-h-[56px]" value={s.demand_hypothesis} onChange={(e) => onEdit({ demand_hypothesis: e.target.value })} />
              </div>
              <div>
                <span className="label">What we search for</span>
                <textarea className="input min-h-[72px]" value={s.discovery_objective} onChange={(e) => onEdit({ discovery_objective: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddSituation({ onAdd }: { onAdd: (s: { name: string; description: string; objective: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [description, setDesc] = useState(""); const [objective, setObj] = useState("");
  if (!open) return <button className="btn btn-ghost w-full mt-3" onClick={() => setOpen(true)}>+ Add a custom situation</button>;
  return (
    <div className="card p-4 mt-3 space-y-3">
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Description" value={description} onChange={setDesc} textarea />
      <Field label="What to search for (buyer-centric; exclude vendors)" value={objective} onChange={setObj} textarea />
      <div className="flex gap-2">
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary flex-1" disabled={!name || !objective} onClick={() => { onAdd({ name, description, objective }); setOpen(false); setName(""); setDesc(""); setObj(""); }}>Add</button>
      </div>
    </div>
  );
}

function Spinner() { return <span className="spin inline-block h-4 w-4 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />; }
function splitList(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }
function msg(e: unknown) { return e instanceof Error ? e.message : "Something went wrong."; }
