import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
config({ path: '.env.local', quiet: true });
if (!process.argv.includes('--allow-cloud-test-writes')) throw new Error('This check requires --allow-cloud-test-writes for one temporary account.');
const base = process.env.HOTNOW_TEST_URL || 'http://127.0.0.1:3001';
const email = `hotnow-signup-check-${randomUUID()}@example.com`, password = randomUUID() + randomUUID();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const publicClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let browser, createdId;
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage(), paid = [];
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/\/api\/(prewarm|seller\/research|discovery\/start|contacts\/(source|enrich)|slack\/send)/.test(request.url())) { paid.push(request.url()); void request.abort(); }
    else void request.continue();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.click('a[href="/signup"]');
  await page.waitForSelector('#auth-email');
  await page.type('#auth-email', email); await page.type('#auth-password', password);
  await page.click('form button[type=submit], form button:not([type])');
  await page.waitForFunction(() => location.pathname === '/onboarding', { timeout: 30000 });
  await page.waitForSelector('input[placeholder="yourcompany.com"]');
  assert.equal(paid.length, 0, 'Signup started paid research without a domain action');
  const login = await publicClient.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error; createdId = login.data.user.id;
  const { data: profile, error } = await admin.schema('hotnow').from('seller_profiles').select('id').eq('user_id', createdId);
  if (error) throw error; assert.equal(profile.length, 0);
  console.log('PASS public landing → signup → authenticated empty onboarding; no paid research launched.');
} catch (error) { console.error('SIGNUP CHECK FAILED: ' + error.message); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (!createdId) { const login = await publicClient.auth.signInWithPassword({ email, password }); createdId = login.data.user?.id; }
  if (createdId) { const { error } = await admin.auth.admin.deleteUser(createdId); if (error) { console.error('Temporary signup account cleanup failed'); process.exitCode = 1; } else console.log('Temporary signup account removed.'); }
}
