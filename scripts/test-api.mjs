// Opt-in live integration check: temporary users/data, no research/provider calls.
// Cleanup only touches IDs created by this invocation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

config({ path: '.env.local', quiet: true });
if (process.argv.includes('--browser') && !process.argv.includes('--worker-paused')) throw new Error('Browser mutation tests require --worker-paused and the worker service stopped.');
if (!process.argv.includes('--allow-cloud-test-writes')) {
  console.error('This check creates and removes temporary Supabase users and fixtures. Run with --allow-cloud-test-writes to opt in.');
  process.exit(1);
}
const base = process.env.HOTNOW_TEST_URL || 'http://127.0.0.1:3001';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const schema = process.env.HOTNOW_DB_SCHEMA || 'hotnow';
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema }, auth: { persistSession: false, autoRefreshToken: false },
});
const users = [], companies = [];
let passed = 0;
function ok(result) { if (result.error) throw new Error(result.error.message); return result.data; }
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function account() {
  const email = `hotnow-api-check-${randomUUID()}@example.com`;
  const password = randomUUID() + randomUUID();
  const data = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
  users.push(data.user.id);
  const jar = new Map();
  const client = createServerClient(url, key, {
    db: { schema }, cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { id: data.user.id, email, password, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
}
async function api(account, path, workspace, body, expected = 200) {
  const headers = { cookie: account?.cookie || '' };
  if (workspace) headers['x-hotnow-workspace'] = workspace;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET', headers,
    body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json();
  assert.equal(response.status, expected, `${path}: ${response.status}; ${json.error || 'unexpected response'}`);
  return json;
}
async function workspace(user, suffix) {
  return ok(await admin.from('seller_profiles').insert({
    user_id: user.id, domain: `api-check-${randomUUID()}.invalid`,
    company_name: `Temporary API check ${suffix}`, research_status: 'done',
  }).select('id').single()).id;
}

try {
  const A = await account(), B = await account();
  const first = await workspace(A, 'first'), second = await workspace(A, 'second'), other = await workspace(B, 'other user');
  const signalRows = ok(await admin.from('buying_situations').insert([1, 2].map(n => ({
    seller_profile_id: first, name: `Temporary test signal ${n}`,
    discovery_objective: 'Synthetic integration test; never launch discovery',
    enabled: true, source: 'integration-test',
  }))).select('id'));
  await check('anonymous section APIs require login', async () => {
    for (const path of ['/api/overview', '/api/opportunities', '/api/contacts', '/api/lists', '/api/activity', '/api/activity/stream']) {
      await api(null, path, null, undefined, 401);
    }
  });
  await check('empty companies, contacts and lists are arrays, never null', async () => {
    for (const [path, field] of [['/api/opportunities', 'opportunities'], ['/api/contacts', 'contacts'], ['/api/lists', 'lists']]) {
      const data = await api(A, path, first); assert.deepEqual(data[field], []);
    }
    const overview = await api(A, '/api/overview', first);
    assert.equal(overview.discovery.state, 'not_started');
    assert.equal(overview.summary.enabledSignals, 2);
  });
  await check('activity is private and includes all owned company workspaces', async () => {
    const data = await api(A, '/api/activity', second);
    assert.equal(data.items.length, 2);
    assert.ok(data.items.some(i => i.id === first + ':research'));
    assert.ok(data.items.some(i => i.id === second + ':research'));
    assert.ok(!data.items.some(i => i.id.startsWith(other)));
    assert.ok((await api(B, '/api/activity', other)).items.every(i => i.id.startsWith(other)));
  });
  if (process.argv.includes('--worker-paused')) {
    await check('discovery enqueues immediately and polling is read-only', async () => {
      const started = await api(A, '/api/discovery/start?max=1', first, {}, 202);
      assert.equal(started.queued, true); assert.equal(started.launched.length, 1);
      const row = ok(await admin.from('discovery_runs').select('*').eq('id', started.launched[0].runId).single());
      assert.equal(row.status, 'queued'); assert.ok(row.provider_job_id.startsWith('pending-'));
      const activity = await api(A, '/api/activity', second);
      assert.equal(activity.active, 1); assert.equal(activity.items[0].id, row.id);
      const progress = await api(A, '/api/discovery/poll', first, {});
      assert.equal(progress.remaining, 1);
      assert.equal(ok(await admin.from('discovery_runs').select('status').eq('id', row.id).single()).status, 'queued');
      if (process.argv.includes('--browser')) {
        const { default: puppeteer } = await import('puppeteer-core');
        const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
        try {
          await browser.defaultBrowserContext().setCookie(...A.cookie.split('; ').map(value => {
            const index = value.indexOf('=');
            return { name: value.slice(0, index), value: value.slice(index + 1), domain: new URL(base).hostname, path: '/' };
          }));
          const page = await browser.newPage();
          await page.setViewport({ width: 1366, height: 1000 });
          await page.evaluateOnNewDocument(id => sessionStorage.setItem('hotnow_workspace', id), first);
          const paidRequests = [];
          await page.setRequestInterception(true);
          page.on('request', request => {
            if (/\/api\/(contacts\/(source|enrich)|seller\/research$|discovery\/start)/.test(request.url())) {
              paidRequests.push(request.url()); void request.abort();
            } else void request.continue();
          });
          await page.goto(base + '/dashboard', { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => !!document.querySelector('#parallel-activity [data-status=queued]'));
          assert.ok((await page.$eval('#parallel-activity', node => node.textContent)).includes('Waiting for a worker'));
          if (process.env.HOTNOW_TEST_SCREENSHOT) await page.screenshot({ path: process.env.HOTNOW_TEST_SCREENSHOT });
          await page.setViewport({ width: 390, height: 844 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Activity overflows mobile viewport');
          await page.setViewport({ width: 1366, height: 1000 });
          await page.click('a.nav-item[href="/dashboard/contacts"]');
          await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Contacts');
          assert.ok((await page.$eval('.activity-badge', node => node.textContent)).includes('1 task running'));
          await page.click('a.nav-item[href="/dashboard/lists"]');
          await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Lists');
          assert.equal(paidRequests.length, 0, 'Navigation attempted a paid API call');
          console.log('PASS browser: live queued activity, responsive layout, Contacts/Lists navigation with task running');
        } finally { await browser.close(); }
      }
      ok(await admin.from('discovery_runs').delete().eq('id', row.id));
    });
    await check('company research is persisted before any provider call', async () => {
      const result = await api(A, '/api/seller/research', first, { domain: 'offline-' + randomUUID() + '.invalid' }, 202);
      const row = ok(await admin.from('seller_profiles').select('*').eq('id', result.profileId).single());
      assert.equal(row.research_status, 'queued'); assert.equal(row.research_task_id, null);
      assert.equal((await api(A, '/api/seller/research/status', row.id)).status, 'running');
      ok(await admin.from('seller_profiles').delete().eq('id', row.id));
    });
  }
  await check('AG-UI stream is authenticated and restores only owned workspace state', async () => {
    const controller = new AbortController();
    try {
      const response = await fetch(base + '/api/activity/stream', { headers: { cookie: A.cookie }, signal: controller.signal });
      assert.equal(response.status, 200); assert.ok(response.headers.get('content-type').includes('text/event-stream'));
      const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '';
      while (!text.includes('STATE_SNAPSHOT')) text += decoder.decode((await reader.read()).value);
      assert.ok(text.includes(first)); assert.ok(text.includes(second)); assert.ok(!text.includes(other));
      await reader.cancel();
    } finally { controller.abort(); }
  });
  if (process.argv.includes('--worker-paused')) await check('contact jobs deduplicate, enforce ownership, and support cancellation/retry', async () => {
    const firstJob = await api(A, '/api/contacts/source', first, {}, 202);
    const duplicate = await api(A, '/api/contacts/source', first, {}, 202);
    assert.equal(firstJob.job.id, duplicate.job.id);
    await api(B, '/api/jobs/' + firstJob.job.id, other, { action: 'cancel' }, 404);
    await api(A, '/api/jobs/' + firstJob.job.id, first, { action: 'cancel' });
    assert.equal(ok(await admin.from('background_jobs').select('status').eq('id', firstJob.job.id).single()).status, 'cancelled');
    await api(A, '/api/jobs/' + firstJob.job.id, first, { action: 'retry' });
    assert.equal(ok(await admin.from('background_jobs').select('status').eq('id', firstJob.job.id).single()).status, 'queued');
    ok(await admin.from('background_jobs').delete().eq('id', firstJob.job.id));
  });
  const company = ok(await admin.from('companies').insert({
    normalized_domain: `api-check-buyer-${randomUUID()}.invalid`, name: 'Temporary synthetic prospect',
  }).select('id').single()).id;
  companies.push(company);
  const opportunityRows = ok(await admin.from('opportunities').insert(signalRows.map(s => ({
    seller_profile_id: first, company_id: company, situation_id: s.id,
    what_happened: 'Synthetic API test, not a real buying signal', why_it_matters: 'Integration check only', confidence: 'low',
  }))).select('id'));
  ok(await admin.from('evidence').insert({ opportunity_id: opportunityRows[0].id, source_url: 'https://example.invalid/test-evidence' }));
  const contact = ok(await admin.from('contacts').insert({
    seller_profile_id: first, company_id: company, opportunity_id: opportunityRows[0].id,
    full_name: 'Synthetic integration contact', title: 'Test record', priority: 'P1',
    linkedin_url: 'https://example.invalid/test-person', email: 'test@example.invalid', source: 'integration-test',
  }).select('id').single()).id;
  ok(await admin.from('contact_sourcing').insert({ seller_profile_id: first, company_id: company }));
  await check('companies API returns joined companies, signals and evidence', async () => {
    const data = await api(A, '/api/opportunities', first);
    assert.equal(data.opportunities.length, 2);
    assert.ok(data.opportunities.every(o => o.companies?.name && o.buying_situations?.name));
    assert.ok(data.opportunities.some(o => o.evidence?.length === 1));
  });
  await check('contacts API returns saved people and pending counts', async () => {
    const data = await api(A, '/api/contacts', first);
    assert.equal(data.contacts.length, 1); assert.equal(data.contacts[0].companies.name, 'Temporary synthetic prospect');
    assert.equal(data.pending, 0); assert.equal(data.pendingEmails, 0);
  });
  let listId;
  await check('company list creation, listing and detail work', async () => {
    const data = await api(A, '/api/lists', first, { name: 'Temporary company API check', kind: 'companies', opportunityIds: [opportunityRows[0].id] });
    listId = data.list.id; assert.equal(data.added, 1);
    const lists = await api(A, '/api/lists', first);
    assert.equal(lists.lists.length, 1); assert.equal(lists.lists[0].list_items[0].count, 1);
    const detail = await api(A, `/api/lists/${listId}`, first);
    assert.equal(detail.items.length, 1); assert.ok(detail.items[0].opportunities.companies.name);
  });
  await check('adding another company item to a saved list works', async () => {
    const result = await api(A, '/api/lists/add', first, { listId, opportunityIds: [opportunityRows[1].id] });
    assert.equal(result.added, 1);
    assert.equal((await api(A, `/api/lists/${listId}`, first)).items.length, 2);
  });
  await check('contact lists return joined contact details', async () => {
    const result = await api(A, '/api/lists', first, { name: 'Temporary contact API check', kind: 'contacts', contactIds: [contact] });
    const detail = await api(A, `/api/lists/${result.list.id}`, first);
    assert.equal(detail.items[0].contacts.full_name, 'Synthetic integration contact');
  });
  await check('overview counts all sections and deduplicates companies', async () => {
    const data = await api(A, '/api/overview', first);
    assert.equal(data.summary.opportunities, 2); assert.equal(data.summary.companies, 1);
    assert.equal(data.summary.contacts, 1); assert.equal(data.summary.lists, 2);
    assert.equal(data.summary.enabledSignals, 2); assert.equal(data.discovery.state, 'ready');
  });
  await check('second workspace does not see the first workspace records', async () => {
    assert.deepEqual((await api(A, '/api/opportunities', second)).opportunities, []);
    assert.deepEqual((await api(A, '/api/contacts', second)).contacts, []);
    assert.deepEqual((await api(A, '/api/lists', second)).lists, []);
    await api(A, `/api/lists/${listId}`, second, undefined, 404);
  });
  await check('another user cannot access this workspace or its lists', async () => {
    for (const path of ['/api/overview', '/api/opportunities', '/api/contacts', '/api/lists']) {
      await api(B, path, first, undefined, 404);
    }
    await api(B, `/api/lists/${listId}`, other, undefined, 404);
    assert.deepEqual((await api(B, '/api/opportunities', other)).opportunities, []);
  });
  await check('all four dashboard pages render for an authenticated user', async () => {
    for (const [path, title] of [['/dashboard', 'Overview'], ['/dashboard/companies', 'Companies'], ['/dashboard/contacts', 'Contacts'], ['/dashboard/lists', 'Lists']]) {
      const response = await fetch(base + path, { headers: { cookie: A.cookie }, redirect: 'manual' });
      assert.equal(response.status, 200, path);
      assert.ok((await response.text()).includes(title), `${title} page content missing`);
    }
  });
  await check('adding list items twice is idempotent', async () => {
    const result = await api(A, '/api/lists/add', first, { listId, opportunityIds: [opportunityRows[0].id] });
    assert.equal(result.added, 0);
    assert.equal((await api(A, '/api/lists/' + listId, first)).items.length, 2);
  });
  if (process.argv.includes('--browser')) {
    const { browserJourney } = await import('./browser-journey.mjs');
    await check('deep browser journeys through every workspace section', async () => { await browserJourney({ base, account: A, workspace: first, otherWorkspace: second, admin }); });
  }
  console.log(`${passed} API checks passed. No Parallel, Blitz, or Slack calls were made by this test.`);
} catch (e) { console.error('API CHECK FAILED: ' + e.message); process.exitCode = 1; }
finally {
  let cleanupFailed = false;
  for (const id of users) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) { console.error('Cleanup failed for temporary test user ' + id); cleanupFailed = true; }
  }
  if (companies.length) {
    const result = await admin.from('companies').delete().in('id', companies);
    if (result.error) { console.error('Cleanup failed for temporary test companies: ' + companies.join(',')); cleanupFailed = true; }
  }
  if (cleanupFailed) process.exitCode = 1;
  else console.log('Temporary test users and records removed.');
}
