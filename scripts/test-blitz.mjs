// Offline contract checks. Optional --live uses at most two employee records,
// does not fetch emails, and does not write to the database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
const bundled = await build({ entryPoints: ['src/lib/engine/contacts.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports);
const { sourceContactsForCompany } = module.exports;
const company = 'https://www.linkedin.com/company/test';
const fetchOriginal = globalThis.fetch, keyOriginal = process.env.BLITZ_API_KEY, prospeoOriginal = process.env.PROSPEO_API_KEY;
let responseMode = 'success', requests = [];
process.env.BLITZ_API_KEY = 'offline-test';
delete process.env.PROSPEO_API_KEY;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body); requests.push({ url, body });
  if (url.endsWith('/domain-to-linkedin')) return Response.json({ found: true, company_linkedin_url: company });
  assert.deepEqual(body.country_code, ['US']);
  if (responseMode === 'error') return Response.json({ message: 'Rate limited' }, { status: 429 });
  if (responseMode === 'malformed') return Response.json({ message: 'Unknown response' });
  if (responseMode === 'empty') return Response.json({ results: [], total_pages: 0 });
  return Response.json({ results: [{ full_name: 'Test Person', linkedin_url: 'https://www.linkedin.com/in/test',
    headline: 'Generic headline', location: { city: 'Boston', state_code: 'MA', country_code: 'US' },
    experiences: [
      { company_linkedin_url: 'https://www.linkedin.com/company/other', job_is_current: true, job_title: 'Founder' },
      { company_linkedin_url: company, job_is_current: false, job_title: 'Chief Executive Officer' },
      { company_linkedin_url: company + '/', job_is_current: true, job_title: 'Director of Operations', job_level: 'Director', job_function: 'Operations' },
    ] }], total_pages: 2 });
};
const criteria = { countryCode: 'us', jobLevels: ['Director'], jobFunctions: ['Operations'] };
try {
  const result = await sourceContactsForCompany('https://www.test.invalid/path', criteria, { maxPerCall: 1 });
  assert.equal(requests[0].body.domain, 'test.invalid');
  assert.equal(requests[1].body.max_results, 1);
  assert.deepEqual(requests[1].body.job_function, ['Operations']);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].title, 'Director of Operations');
  assert.equal(result.contacts[0].jobLevel, 'Director');
  assert.equal(result.contacts[0].priority, 'P2');
  assert.equal(result.contacts[0].location, 'Boston, MA, US');
  console.log('PASS domain normalization, array country filter, current employer title, priority and location');
  responseMode = 'malformed';
  await assert.rejects(sourceContactsForCompany('test.invalid', criteria), /unexpected response/);
  console.log('PASS malformed responses cannot mark a company successfully searched');
  responseMode = 'error';
  await assert.rejects(sourceContactsForCompany('test.invalid', criteria), /429/);
  console.log('PASS provider failures propagate to the retryable background job');
  responseMode = 'empty';
  assert.equal((await sourceContactsForCompany('test.invalid', criteria)).contacts.length, 0);
  console.log('PASS legitimate zero-match results remain valid');
} finally {
  globalThis.fetch = fetchOriginal;
  if (keyOriginal === undefined) delete process.env.BLITZ_API_KEY;
  else process.env.BLITZ_API_KEY = keyOriginal;
  if (prospeoOriginal === undefined) delete process.env.PROSPEO_API_KEY;
  else process.env.PROSPEO_API_KEY = prospeoOriginal;
}
if (process.argv.includes('--live')) {
  const result = await sourceContactsForCompany('hsbc.com', {
    countryCode: 'US', jobLevels: ['C-Team', 'Director'], jobFunctions: ['Operations', 'Sales & Business Development'],
  }, { maxPerCall: 1, enrich: false, useProspeo: false });
  assert.ok(result.companyLinkedin, 'domain must resolve');
  assert.ok(result.contacts.length > 0, 'known company must return a contact');
  assert.ok(result.contacts.some(c => c.title), 'returned contacts must include a title');
  assert.ok(result.contacts.every(c => typeof c.location === 'string' || c.location === undefined));
  console.log(JSON.stringify({ live: 'PASS', domain: 'hsbc.com', contacts: result.contacts.length,
    withTitles: result.contacts.filter(c => c.title).length, priorities: result.contacts.map(c => c.priority), databaseWrites: 0, emailLookups: 0 }));
}
