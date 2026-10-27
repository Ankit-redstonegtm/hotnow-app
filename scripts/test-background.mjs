// Offline checks: never contacts Parallel, spends credits, or writes cloud data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
async function bundle(entry, mocks = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false,
    tsconfig: "tsconfig.json", packages: "external", plugins: [{ name: "offline-mocks", setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log("PASS " + name); }
const { verifyParallelWebhook } = await bundle("src/lib/parallel-webhook.ts");
const secret = "whsec_" + Buffer.from("offline-test-signing-key").toString("base64");
const body = JSON.stringify({ type: "task_run.status", data: { run_id: "test" } });
const ts = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", Buffer.from("offline-test-signing-key")).update(`delivery.${ts}.${body}`).digest("base64");
const headers = new Headers({ "webhook-id": "delivery", "webhook-timestamp": ts, "webhook-signature": "v1," + signature });
await check("signed webhook accepted; tampering, stale delivery and unknown versions rejected", () => {
  assert.equal(verifyParallelWebhook(headers, body, secret), true);
  assert.equal(verifyParallelWebhook(headers, body + " ", secret), false);
  assert.equal(verifyParallelWebhook(headers, body, secret, Date.now() + 600_000), false);
  const wrong = new Headers(headers); wrong.set("webhook-signature", "v2," + signature);
  assert.equal(verifyParallelWebhook(wrong, body, secret), false);
  assert.equal(verifyParallelWebhook(new Headers(), body, secret), false);
});

const tables = { seller_profiles: [], discovery_runs: [] };
globalThis.__backgroundTest = {
  tables, starts: 0, launches: 0, finish: null, transient: false, ingests: 0,
  db: { from(table) {
    const filters = []; let patch;
    const q = {
      select() { return q; }, order() { return q; },
      or() { filters.push(r => ["queued", "starting", "running", "ready"].includes(r.research_status) || ["queued", "starting", "running", "ready"].includes(r.situations_status)); return q; },
      update(p) { patch = p; return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; },
      in(k, v) { filters.push(r => v.includes(r[k])); return q; },
      then(resolve) {
        const rows = tables[table].filter(r => filters.every(fn => fn(r)));
        if (patch) rows.forEach(r => Object.assign(r, patch));
        return Promise.resolve({ data: rows.map(r => ({ ...r })), error: null }).then(resolve);
      },
    }; return q;
  } },
};
const worker = await bundle("src/lib/background/worker.ts", {
  "@/lib/supabase/admin": "export const createAdminClient=()=>globalThis.__backgroundTest.db",
  "./jobs": "export const claimEnrichmentJobs=async()=>[];export const processEnrichmentJob=async()=>{}",
  "@/lib/providers/parallel": "export const isTransientParallelError=e=>e instanceof TypeError",
  "@/lib/engine": `const t=globalThis.__backgroundTest;
    export const startResearch=async()=>{t.starts++;return {taskId:'provider-task'}};
    export const finishResearch=async()=>{if(t.transient)throw new TypeError('fetch failed');return t.finish};
    export const startSituations=async()=>({taskId:'signal-task'});
    export const finishSituations=async()=>null;
    export const defaultIcp=()=>({});
    export const launchDiscovery=async()=>{t.launches++;return {runId:'provider-discovery'}};`,
  "@/lib/db/repo": `const t=globalThis.__backgroundTest;
    export const updateSellerProfile=async(_,id,fields)=>Object.assign(t.tables.seller_profiles.find(r=>r.id===id),fields);
    export const updateRun=async(_,id,fields)=>Object.assign(t.tables.discovery_runs.find(r=>r.id===id),fields);
    export const upsertIcp=async()=>{};export const replaceSituations=async()=>{};
    export const getIcp=async()=>null;export const getFreshPrewarm=async()=>null;
    export const getSituations=async()=>[{id:'signal',name:'signal'}];`,
  "@/lib/discovery/worker": `const t=globalThis.__backgroundTest;
    export const toSituation=r=>r;export const notifyIfWaveComplete=async()=>{};
    export const ingestRun=async(_,row)=>{t.ingests++;Object.assign(t.tables.discovery_runs.find(r=>r.id===row.id),{status:'completed',matched_count:2})};`,
});
async function drain() { while (worker.activeJobs()) await new Promise(resolve => setTimeout(resolve, 1)); }
const p = { id: "profile", domain: "example.invalid", research_status: "queued", situations_status: "none", updated_at: new Date().toISOString() };
tables.seller_profiles.push(p);
await check("research is launched by worker once, then persisted without a page request", async () => {
  await worker.tick(); await drain(); assert.equal(p.research_status, "running"); assert.equal(globalThis.__backgroundTest.starts, 1);
  await worker.tick(); await drain(); assert.equal(globalThis.__backgroundTest.starts, 1);
  globalThis.__backgroundTest.finish = { companyName: "Offline company", industries: [], buyerPersonas: [] };
  await worker.tick(); await drain(); assert.equal(p.research_status, "done"); assert.equal(p.company_name, "Offline company");
  assert.equal(p.situations_status, "queued"); p.situations_status = "done";
});
await check("temporary API failures keep research running for retry", async () => {
  p.research_status = "running"; globalThis.__backgroundTest.transient = true;
  await worker.tick(); await drain(); assert.equal(p.research_status, "running");
  globalThis.__backgroundTest.transient = false; p.research_status = "done";
});
await check("interrupted launch is failed rather than spending twice", async () => {
  p.research_status = "starting"; p.updated_at = new Date(Date.now() - 600_000).toISOString();
  await worker.tick(); await drain(); assert.equal(p.research_status, "failed"); assert.equal(globalThis.__backgroundTest.starts, 1);
});
await check("discovery queue starts and saves results without browser polling", async () => {
  const run = { id: "discovery", seller_profile_id: "profile", situation_id: "signal", status: "queued", provider_job_id: "pending-test", requested_at: new Date().toISOString() };
  tables.discovery_runs.push(run);
  await worker.tick(); await drain(); assert.equal(run.status, "running"); assert.equal(run.provider_job_id, "provider-discovery");
  await worker.tick(); await drain(); assert.equal(run.status, "completed"); assert.equal(run.matched_count, 2);
  await worker.tick(); await drain(); assert.equal(globalThis.__backgroundTest.launches, 1); assert.equal(globalThis.__backgroundTest.ingests, 1);
});
await check("worker concurrency is bounded to three jobs", async () => {
  tables.seller_profiles.length = 0;
  for (let i = 0; i < 6; i++) tables.seller_profiles.push({ ...p, id: "parallel-" + i, research_status: "queued" });
  const before = globalThis.__backgroundTest.starts;
  await worker.tick(); assert.ok(worker.activeJobs() <= 3); await drain();
  assert.equal(globalThis.__backgroundTest.starts - before, 3);
});
await check("earlier running tasks do not starve later queued users", async () => {
  const before = globalThis.__backgroundTest.starts;
  await worker.tick(); await drain();
  assert.equal(globalThis.__backgroundTest.starts - before, 3);
  assert.ok(tables.seller_profiles.every(row => row.research_status === "running"));
});
delete globalThis.__backgroundTest;

const writes = [];
globalThis.__webhookTest = { writes, db: { from() {
  let patch;
  const q = { update(p) { patch = p; return q; }, eq() { return q; }, select() { return q; },
    maybeSingle: async () => ({ data: { id: "owned-run" }, error: null }),
    then(resolve) { if (patch) writes.push(patch); return Promise.resolve({ error: null }).then(resolve); } };
  return q;
} } };
const webhook = await bundle("src/app/api/discovery/webhook/route.ts", {
  "next/server": "export const NextResponse={json:(body,init)=>Response.json(body,init)}",
  "@/lib/supabase/admin": "export const createAdminClient=()=>globalThis.__webhookTest.db",
  "@/lib/providers/parallel": "export const findAllStatus=async()=>({candidatesCount:4,matchedCount:2})",
});
const savedSecret = process.env.PARALLEL_WEBHOOK_SECRET;
try {
  delete process.env.PARALLEL_WEBHOOK_SECRET;
  await check("unconfigured and unsigned callback requests are rejected", async () => {
    assert.equal((await webhook.POST(new Request("http://test/webhook", { method: "POST", body }))).status, 503);
    process.env.PARALLEL_WEBHOOK_SECRET = secret;
    assert.equal((await webhook.POST(new Request("http://test/webhook", { method: "POST", body }))).status, 401);
  });
  await check("duplicate candidate deliveries set cumulative counts without incrementing or ingesting", async () => {
    const event = JSON.stringify({ type: "findall.candidate.matched", data: { findall_id: "provider-run", candidate_id: "candidate" } });
    const deliveryHeaders = new Headers(headers);
    deliveryHeaders.set("webhook-signature", "v1," + createHmac("sha256", Buffer.from("offline-test-signing-key")).update(`delivery.${ts}.${event}`).digest("base64"));
    for (let i = 0; i < 2; i++) assert.equal((await webhook.POST(new Request("http://test/webhook", { method: "POST", body: event, headers: deliveryHeaders }))).status, 200);
    assert.deepEqual(writes, [{ candidates_count: 4, matched_count: 2 }, { candidates_count: 4, matched_count: 2 }]);
  });
} finally {
  if (savedSecret === undefined) delete process.env.PARALLEL_WEBHOOK_SECRET; else process.env.PARALLEL_WEBHOOK_SECRET = savedSecret;
  delete globalThis.__webhookTest;
}
console.log(`${checks} offline background checks passed.`);
