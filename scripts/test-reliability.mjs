import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
async function bundle(entry, mocks = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, tsconfig: 'tsconfig.json', packages: 'external',
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: 'mock' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: mocks[a.path], loader: 'js' }));
    } }] });
  const module = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports); return module.exports;
}
let count = 0;
async function check(name, fn) { await fn(); count++; console.log('PASS ' + name); }
const validation = await bundle('src/lib/validation.ts'), csv = await bundle('src/lib/csv.ts');
await check('targeting rejects invalid limits, reversed sizes and malformed arrays', () => {
  for (const value of [{ dailyTarget: 0 }, { dailyTarget: 16 }, { sizeMin: 20, sizeMax: 10 }, { geographies: 'US' }]) assert.equal(validation.icpInput.safeParse(value).success, false);
  assert.equal(validation.icpInput.parse({ dailyTarget: 5 }).dailyTarget, 5);
});
await check('Slack delivery accepts only real HTTPS Slack webhook destinations', () => {
  for (const value of ['http://127.0.0.1', 'https://hooks.slack.com.evil.invalid/services/a/b/c', 'https://evil.invalid', 'https://hooks.slack.com@evil.invalid/services/a/b/c', 'file:///etc/passwd']) assert.equal(validation.validSlackUrl(value), false);
  assert.equal(validation.validSlackUrl('https://hooks.slack.com/services/A/B/C'), true);
});
await check('list names and kinds are validated and repeated item IDs are deduplicated', () => {
  assert.equal(validation.listInput.safeParse({ name: '   ' }).success, false);
  assert.equal(validation.listInput.safeParse({ name: 'Test', kind: 'contacts', opportunityIds: ['11111111-1111-4111-8111-111111111111'] }).success, false);
  assert.equal(validation.listInput.parse({ name: ' Test ', opportunityIds: ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'] }).opportunityIds.length, 1);
});
await check('CSV preserves quotes and line breaks while neutralizing spreadsheet formulas', () => {
  const output = csv.csvText([{ name: '=HYPERLINK("bad")', note: 'line1\rline2', score: -3 }]);
  assert.ok(output.includes("'=HYPERLINK")); assert.ok(output.includes('"line1\rline2"')); assert.ok(output.endsWith(',-3'));
});

const t = globalThis.__reliability = { job: {}, sourceError: null, saved: 0, emailError: null, writes: 0 };
const workerId = 'test-worker';
t.db = { from() {
  let patch; const filters = [];
  const q = { select() { return q; }, update(p) { patch = p; return q; }, eq(k, v) { filters.push([k, v]); return q; },
    single: async () => ({ data: { ...t.job }, error: null }),
    then(resolve) { if (patch && filters.every(([k, v]) => t.job[k] === v)) { Object.assign(t.job, patch); t.writes++; } return Promise.resolve({ data: [], error: null }).then(resolve); } };
  return q;
} };
const jobs = await bundle('src/lib/background/jobs.ts', {
  '@/lib/supabase/admin': 'export const createAdminClient=()=>globalThis.__reliability.db',
  '@/lib/db/repo': `const t=globalThis.__reliability;
    export const getSellerProfileById=async()=>({id:'workspace',contact_criteria:{}});
    export const countCompaniesNeedingContacts=async()=>1;export const countContactsNeedingEmail=async()=>1;
    export const companiesNeedingContacts=async()=>[{companyId:'company',opportunityId:'opportunity',domain:'test.invalid'}];
    export const contactsNeedingEmail=async()=>[{id:'person',linkedin_url:'https://example.invalid'}];
    export const saveContacts=async()=>{t.saved++;return 1};export const setContactEmail=async()=>{t.saved++};`,
  '@/lib/engine/contacts': 'export const sourceContactsForCompany=async()=>{if(globalThis.__reliability.sourceError)throw globalThis.__reliability.sourceError;return {contacts:[{}]}}',
  '@/lib/providers/blitz': 'export const enrichEmail=async()=>{if(globalThis.__reliability.emailError)throw globalThis.__reliability.emailError;return null}',
});
function fresh(kind = 'contacts') { t.job = { id: 'job', seller_profile_id: 'workspace', kind, status: 'running', options: {}, completed_items: 0, total_items: 0, result_count: 0, attempts: 0, max_attempts: 3, locked_by: workerId }; t.saved = 0; t.sourceError = null; t.emailError = null; return { ...t.job }; }
await check('contact API failure schedules a retry and never marks the company empty', async () => {
  const job = fresh(); t.sourceError = new TypeError('fetch failed'); await jobs.processEnrichmentJob(job, workerId);
  assert.equal(t.job.status, 'retrying'); assert.equal(t.job.attempts, 1); assert.equal(t.saved, 0); assert.equal(t.job.locked_by, null);
});
await check('retries stop at the attempt limit and auth failures fail immediately', async () => {
  const job = fresh(); job.attempts = 2; t.sourceError = new Error('Blitz -> 503'); await jobs.processEnrichmentJob(job, workerId); assert.equal(t.job.status, 'failed');
  const next = fresh(); t.sourceError = new Error('Blitz -> 401'); await jobs.processEnrichmentJob(next, workerId); assert.equal(t.job.status, 'failed');
});
await check('cancellation stops the next batch without calling a provider', async () => {
  const job = fresh(); t.job.cancel_requested = true; await jobs.processEnrichmentJob(job, workerId); assert.equal(t.job.status, 'cancelled'); assert.equal(t.saved, 0);
});
await check('success saves a checkpoint and provider failures do not erase email eligibility', async () => {
  const job = fresh(); await jobs.processEnrichmentJob(job, workerId); assert.equal(t.saved, 1); assert.equal(t.job.completed_items, 1); assert.equal(t.job.result_count, 1);
  const email = fresh('emails'); t.emailError = new Error('Blitz -> 503'); await jobs.processEnrichmentJob(email, workerId); assert.equal(t.saved, 0); assert.equal(t.job.status, 'retrying');
});
await check('a stale worker cannot overwrite a job leased by another worker', async () => {
  const job = fresh(); t.job.locked_by = 'different-worker'; await jobs.processEnrichmentJob(job, workerId); assert.equal(t.job.completed_items, 0); assert.equal(t.saved, 0);
});
delete globalThis.__reliability;
await check('an interrupted evidence write is repaired on retry without duplicating citations', async () => {
  const state = { opportunities: [], evidence: [], failEvidence: true };
  const db = { from(table) {
    const filters = []; let operation = 'select', values;
    const q = { select() { return q; }, eq(k,v) { filters.push([k,v]); return q; },
      insert(v) { operation = 'insert'; values = v; return q; }, update(v) { operation = 'update'; values = v; return q; },
      single: async () => execute(true), maybeSingle: async () => execute(true),
      then(resolve) { return Promise.resolve(execute(false)).then(resolve); } };
    function execute(single) {
      if (operation === 'insert') {
        if (table === 'evidence' && state.failEvidence) { state.failEvidence = false; return { data: null, error: { message: 'temporary database error' } }; }
        const rows = (Array.isArray(values) ? values : [values]).map(v => ({ id: 'record-' + state[table].length, ...v }));
        state[table].push(...rows); return { data: single ? rows[0] : rows, error: null };
      }
      const rows = state[table].filter(row => filters.every(([k,v]) => row[k] === v));
      if (operation === 'update') rows.forEach(row => Object.assign(row, values));
      return { data: single ? rows[0] || null : rows, error: null };
    }
    return q;
  } };
  const { upsertOpportunity } = await bundle('src/lib/db/repo.ts');
  const input = { sellerProfileId: 'workspace', companyId: 'company', situationId: 'signal', runId: 'run',
    opp: { whatHappened: 'Test event', whyItMatters: 'Test reason', confidence: 'high', evidence: [{ url: 'https://example.invalid/evidence' }] } };
  await assert.rejects(upsertOpportunity(db, input), /temporary database error/);
  assert.equal(state.opportunities.length, 1); assert.equal(state.evidence.length, 0);
  await upsertOpportunity(db, input); await upsertOpportunity(db, input);
  assert.equal(state.opportunities.length, 1); assert.equal(state.evidence.length, 1);
});
console.log(`${count} reliability checks passed. No cloud writes or paid provider calls.`);
