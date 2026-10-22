import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Runs only from the opt-in API suite while the background worker is paused.
// Paid endpoints and outbound Slack delivery are blocked in this browser.
export async function browserJourney({ base, account, workspace, otherWorkspace, admin }) {
  const durations = await Promise.all(Array.from({ length: 10 }, async () => {
    const controller = new AbortController(), start = performance.now();
    const deadline = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(base + '/api/activity/stream', { headers: { cookie: account.cookie }, signal: controller.signal });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(), decoder = new TextDecoder(); let text = '';
      while (!text.includes('STATE_SNAPSHOT')) { const chunk = await reader.read(); if (chunk.done) throw new Error('Stream ended before snapshot'); text += decoder.decode(chunk.value); }
      assert.ok(text.includes(workspace)); await reader.cancel(); return performance.now() - start;
    } finally { clearTimeout(deadline); controller.abort(); }
  }));
  durations.sort((a,b) => a-b);
  console.log('PASS concurrency: 10 authenticated SSE connections; slowest initial snapshot ' + Math.round(durations.at(-1)) + 'ms (local sample)');
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage(), jsErrors = [], paidRequests = [];
  let loadFailure = false;
  const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
  try {
    await browser.defaultBrowserContext().setCookie(...account.cookie.split('; ').map(value => {
      const i = value.indexOf('='); return { name: value.slice(0, i), value: value.slice(i + 1), domain: new URL(base).hostname, path: '/' };
    }));
    await page.setViewport({ width: 1366, height: 1050 });
    page.on('pageerror', error => jsErrors.push(error.message));
    await page.evaluateOnNewDocument(id => sessionStorage.setItem('hotnow_workspace', id), workspace);
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/\/api\/(contacts\/(source|enrich)|seller\/research$|discovery\/start|slack\/send)/.test(request.url())) { paidRequests.push(request.url()); void request.abort(); }
      else if (loadFailure && request.url().endsWith('/api/settings') && request.method() === 'GET') void request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test outage' }) });
      else void request.continue();
    });
    async function go(path, heading) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(text => document.querySelector('h1')?.textContent.includes(text), {}, heading);
    }
    async function button(text) {
      const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && b.getClientRects().length), text);
      assert.ok(handle.asElement(), 'Button missing: ' + text); await handle.asElement().click(); await handle.dispose();
    }
    async function fill(selector, value) {
      await page.waitForSelector(selector); await page.click(selector, { clickCount: 3 });
      await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.type(selector, value);
    }
    async function mobile() {
      await page.setViewport({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows mobile viewport: ' + page.url());
      await page.setViewport({ width: 1366, height: 1050 });
    }
    await go('/dashboard', 'Overview');
    await page.waitForSelector('.agent-task');
    await page.waitForFunction(() => document.querySelector('.agent-connection')?.textContent.includes('Live updates'));
    await mobile();
    console.log('PASS journey: Overview live AG-UI connection and responsive activity cards');

    await go('/dashboard/companies', 'Companies');
    await page.waitForSelector('.tbl tbody tr');
    const checks = await page.$$('.tbl input[type=checkbox]'); await checks[1].click();
    await button('Save as list'); await page.waitForSelector('dialog[open]');
    await fill('#list-name', 'Browser journey selection'); await button('Save list');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.ok((await page.$eval('main', node => node.textContent)).includes('Saved “Browser journey selection”'));
    await mobile();
    console.log('PASS journey: Companies selection and accessible list dialog save');

    await go('/dashboard/contacts', 'Contacts'); await page.waitForSelector('.tbl tbody tr');
    assert.ok((await page.$eval('.tbl', node => node.textContent)).includes('Synthetic integration contact'));
    await button('P2 (0)'); assert.equal(await page.$$eval('.tbl tbody tr', rows => rows.length), 0);
    await button('All (1)'); await page.waitForSelector('.tbl tbody tr'); await mobile();
    console.log('PASS journey: Contacts data, priority filters and mobile table containment');

    await go('/dashboard/lists', 'Lists');
    const listLink = await page.waitForFunction(() => [...document.querySelectorAll('main a')].find(a => a.textContent.includes('Browser journey selection'))?.getAttribute('href'));
    await page.goto(base + await listLink.jsonValue(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Browser journey selection');
    assert.equal(await page.$$eval('.tbl tbody tr', rows => rows.length), 1); await mobile();
    console.log('PASS journey: Lists and saved selection details');

    await go('/dashboard/company-criteria', 'Company Criteria'); await page.waitForSelector('#daily-target');
    await fill('#daily-target', '0'); await button('Save criteria');
    await page.waitForFunction(() => !!document.querySelector('[role=status]')?.textContent && document.querySelector('[role=status]')?.textContent !== 'Saved.');
    await fill('#daily-target', '8'); await button('Save criteria');
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved.');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.querySelector('#daily-target')?.value === '8'); await mobile();
    console.log('PASS journey: Company criteria validation, save and reload persistence');

    await go('/dashboard/contact-criteria', 'Contact Criteria'); await page.waitForSelector('#country-code');
    await fill('#country-code', '1!'); await button('Save criteria');
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('two-letter'));
    await fill('#country-code', 'US'); await button('Save criteria');
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Saved.');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.querySelector('#country-code')?.value === 'US'); await mobile();
    console.log('PASS journey: Contact criteria validation, save and reload persistence');

    await go('/dashboard/settings', 'Settings'); await page.waitForSelector('#slack-webhook');
    await fill('#slack-webhook', 'http://127.0.0.1/internal'); await button('Save & send test');
    await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('valid HTTPS Slack'));
    loadFailure = true; await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role=alert]'); assert.ok((await page.$eval('[role=alert]', node => node.textContent)).includes('Temporary test outage'));
    loadFailure = false; await button('Retry'); await page.waitForSelector('#slack-webhook'); await mobile();
    console.log('PASS journey: Settings rejects unsafe delivery URL, shows load failure and recovers');

    await go('/dashboard/signals', 'Pain-Qualified Signals'); await page.waitForSelector('input[type=checkbox]');
    const original = await page.$eval('main input[type=checkbox]', node => node.checked);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/situations') && response.request().method() === 'PATCH'), page.click('main input[type=checkbox]')]);
    await page.waitForFunction(value => document.querySelector('main input[type=checkbox]')?.checked !== value && !document.querySelector('main input[type=checkbox]')?.disabled, {}, original);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(value => document.querySelector('main input[type=checkbox]')?.checked !== value, {}, original); await mobile();
    console.log('PASS journey: Signal toggle saves and survives reload without launching a search');

    await go('/onboarding', 'Temporary API check'); await page.waitForFunction(() => document.body.textContent.includes('Find opportunities')); await mobile();
    await go('/onboarding?new=1', 'Find companies ready to buy'); await page.waitForSelector('input[placeholder="yourcompany.com"]'); await mobile();
    console.log('PASS journey: Existing setup resumes and add-company onboarding is usable on mobile');

    // Real browser reconnect plus persisted task controls; all fixture jobs are
    // created under this test's user and removed before the worker restarts.
    const failed = checked(await admin.from('background_jobs').insert({ seller_profile_id: workspace, kind: 'contacts', status: 'failed', step: 'Needs attention', last_error: 'Synthetic provider outage', total_items: 3, completed_items: 1 }).select('id').single());
    try {
      await go('/dashboard', 'Overview'); await page.waitForFunction(() => document.querySelector('.agent-connection')?.textContent.includes('Live updates'));
      await button('Needs attention'); await page.waitForSelector('.agent-task[data-status=failed]'); await button('Retry task');
      await button('In progress'); await page.waitForFunction(() => [...document.querySelectorAll('.agent-task')].some(node => node.textContent.includes('Find decision-makers')));
      await button('Stop task'); await button('All activity');
      await page.waitForFunction(() => !!document.querySelector('.agent-task[data-status=cancelled]'));
      if (process.env.HOTNOW_TEST_SCREENSHOT) await page.screenshot({ path: process.env.HOTNOW_TEST_SCREENSHOT, fullPage: true });
      await page.setOfflineMode(true);
      await page.waitForFunction(() => document.querySelector('.agent-connection')?.textContent.includes('Reconnecting'), { timeout: 15000 });
      await page.setOfflineMode(false);
      await page.waitForFunction(() => document.querySelector('.agent-connection')?.textContent.includes('Live updates'), { timeout: 20000 });
      assert.equal(checked(await admin.from('background_jobs').select('status').eq('id', failed.id).single()).status, 'cancelled');
      console.log('PASS journey: Failed-task retry, stop controls and offline/reconnect restore saved state');
    } finally { checked(await admin.from('background_jobs').delete().eq('id', failed.id)); }

    await button('Sign out');
    await page.waitForFunction(() => location.pathname === '/login');
    await fill('#auth-email', account.email); await fill('#auth-password', 'incorrect-test-password'); await button('Log in');
    await page.waitForSelector('[role=alert]');
    await fill('#auth-password', account.password); await button('Log in');
    await page.waitForFunction(() => location.pathname === '/dashboard');
    console.log('PASS journey: Sign out, invalid-password feedback and successful sign-in');
    assert.equal(paidRequests.length, 0, 'Browsing unexpectedly tried to start paid work or send Slack');
    assert.deepEqual(jsErrors, [], 'Unhandled browser JavaScript errors');
  } finally { await browser.close(); }
}
