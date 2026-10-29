// Offline contact-provider checks. No live keys, no database writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));

async function bundle(entry) {
  const bundled = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

const { mergeContacts, contactSourceLabel } = await bundle('src/lib/engine/contact-merge.ts');
const { createCreditSink, mergeProviderCredits } = await bundle('src/lib/providers/credits.ts');
const { sourceContactsForCompany } = await bundle('src/lib/engine/contacts.ts');

const jane = { fullName: 'Jane Doe', title: 'Director of Operations', linkedinUrl: 'https://www.linkedin.com/in/jane', priority: 'P2', sources: ['blitz'], location: 'Boston, MA, US' };
const linked = mergeContacts([[jane], [{ fullName: 'Jane Doe', title: '', linkedinUrl: 'https://linkedin.com/in/jane/', priority: 'P1', sources: ['prospeo'], mobile: '+1 415-555-0100', personId: 'p-jane' }]]);
assert.equal(linked.length, 1);
assert.equal(linked[0].mobile, '+1 415-555-0100');
assert.equal(linked[0].priority, 'P1');
assert.equal(linked[0].title, 'Director of Operations');
assert.equal(linked[0].linkedinUrl, 'https://www.linkedin.com/in/jane');
assert.deepEqual(linked[0].sources, ['blitz', 'prospeo']);
const byEmail = mergeContacts([
  [{ fullName: 'Jane Doe', title: 'Director', linkedinUrl: 'https://www.linkedin.com/in/jane', email: 'jane@acme.com', priority: 'P2', sources: ['blitz'] }],
  [{ fullName: 'Someone Else', title: 'VP', linkedinUrl: 'https://www.linkedin.com/in/other', email: 'Jane@acme.com', mobile: '+15551212', priority: 'P3', sources: ['prospeo'] }],
]);
assert.equal(byEmail.length, 1);
assert.equal(byEmail[0].mobile, '+15551212');
assert.equal(byEmail[0].fullName, 'Jane Doe');
assert.equal(byEmail[0].linkedinUrl, 'https://www.linkedin.com/in/jane');
const byName = mergeContacts([[{ fullName: 'Pat Lee', title: 'Manager', linkedinUrl: '', priority: 'P3', sources: ['blitz'] }], [{ fullName: '  pat   lee ', title: '', linkedinUrl: 'https://www.linkedin.com/in/pat', email: 'pat@acme.com', priority: 'P2', sources: ['prospeo'] }]]);
assert.equal(byName.length, 1);
assert.equal(byName[0].email, 'pat@acme.com');
assert.equal(byName[0].linkedinUrl, 'https://www.linkedin.com/in/pat');
assert.equal(byName[0].title, 'Manager');
assert.equal(contactSourceLabel(['prospeo', 'blitz', 'other']), 'blitz,prospeo');
assert.equal(contactSourceLabel(undefined), 'blitz');
const sink = createCreditSink();
sink.add('prospeo', null); sink.add('blitz', 0); sink.add('blitz', 2);
assert.deepEqual(sink.snapshot(), { blitz: 2, prospeo: null });
assert.deepEqual(mergeProviderCredits({ blitz: 2, prospeo: null }, { blitz: null, prospeo: 3 }), { blitz: 2, prospeo: 3 });
assert.deepEqual(mergeProviderCredits({ blitz: 2 }, { blitz: 1, prospeo: 0 }), { blitz: 3, prospeo: 0 });
console.log('PASS merge, source label, and credit totals');

const company = 'https://www.linkedin.com/company/acme';
const fetchOriginal = globalThis.fetch;
const blitzKey = process.env.BLITZ_API_KEY;
const prospeoKey = process.env.PROSPEO_API_KEY;
let mode = 'merged';
let requests = [];
process.env.BLITZ_API_KEY = 'offline-blitz';
process.env.PROSPEO_API_KEY = 'offline-prospeo';

function person(fields) {
  return { person: { person_id: fields.id, full_name: fields.name, linkedin_url: fields.linkedin, current_job_title: fields.title,
    email: fields.email, mobile: fields.mobile, location: fields.location,
    job_history: [{ current: true, title: fields.title, seniority: fields.seniority, departments: fields.departments || [] }] },
    company: { linkedin_url: company } };
}
globalThis.fetch = async (url, options) => {
  const target = String(url);
  const body = options?.body ? JSON.parse(options.body) : {};
  requests.push({ target, body });
  if (target.includes('api.blitz-api.ai') && mode === 'blitz-missing') throw new Error('Blitz should not be called');
  if (target.includes('domain-to-linkedin')) {
    if (mode === 'blitz-down' || mode === 'both-down') return Response.json({ message: 'down' }, { status: 500 });
    if (mode === 'no-linkedin') return Response.json({ found: false, fair_usage: { records_used: 0 } });
    return Response.json({ found: true, company_linkedin_url: company, fair_usage: { records_used: 1 } });
  }
  if (target.includes('employee-finder')) {
    if (mode === 'blitz-down') return Response.json({ message: 'down' }, { status: 500 });
    const records = { fair_usage: { records_used: 1 } };
    if (body.job_level?.includes('C-Team')) return Response.json({ ...records, results: [{ full_name: 'Alice Roe', linkedin_url: 'https://linkedin.com/in/alice', job_title: 'Chief Executive Officer', job_level: 'C-Team' }] });
    return Response.json({ ...records, results: [{ full_name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/jane/', job_title: 'Director of Operations', job_level: 'Director', location: { city: 'Boston', state_code: 'MA', country_code: 'US' } }] });
  }
  if (target.endsWith('/search-person')) {
    if (mode === 'prospeo-down' || mode === 'both-down') return Response.json({ error: true, error_code: 'INTERNAL_ERROR' }, { status: 500 });
    if (mode === 'prospeo-auth') return Response.json({ error: true, error_code: 'INVALID_API_KEY' }, { status: 401 });
    if (mode === 'no-results') return Response.json({ error: true, error_code: 'NO_RESULTS' }, { status: 400 });
    if (mode === 'location' && requests.filter(request => request.target.endsWith('/search-person')).length === 1) {
      return Response.json({ error: true, error_code: 'INVALID_FILTERS', filter_error: 'Invalid location' }, { status: 400 });
    }
    return Response.json({ error: false, free: false, results: [
      person({ id: 'p-jane', name: 'Jane Doe', linkedin: 'https://www.linkedin.com/in/jane', title: 'Operations Director', seniority: 'Director', departments: ['Operations'], location: { city: 'Boston', state: 'Massachusetts', country: 'United States' } }),
      person({ id: 'p-bob', name: 'Bob Stone', linkedin: 'https://www.linkedin.com/in/bob', title: 'CEO', seniority: 'C-Suite', departments: ['C-Suite'] }),
      person({ id: 'p-chris', name: 'Chris Hale', linkedin: 'https://www.linkedin.com/in/chris', title: 'Head of Sales', seniority: 'Head', departments: ['Sales'],
        mobile: { status: 'VERIFIED', revealed: true, mobile_international: '+1 415-555-0100' },
        email: { status: 'VERIFIED', revealed: false, email: 'chris*****@acme.com' } }),
    ], pagination: { current_page: 1, per_page: 25, total_page: 3, total_count: 60 } });
  }
  if (target.endsWith('/bulk-enrich-person')) {
    if (mode === 'prospeo-down') return Response.json({ error: true, error_code: 'INTERNAL_ERROR' }, { status: 500 });
    const match = (row, fields) => ({ identifier: row.identifier, ...person(fields) });
    if (body.enrich_mobile === true) {
      const matched = body.data.filter(row => String(row.linkedin_url || '').includes('/bob')).map(row => match(row, { id: 'p-bob', name: 'Bob Stone', linkedin: row.linkedin_url, title: 'CEO', seniority: 'C-Suite',
        email: { status: 'VERIFIED', revealed: true, email: 'bob@acme.com' }, mobile: { status: 'VERIFIED', revealed: true, mobile_international: '+1 415-555-0101' } }));
      return Response.json({ error: false, total_cost: 10, matched, not_matched: body.data.filter(row => !matched.some(item => item.identifier === row.identifier)).map(row => row.identifier) });
    }
    const matched = [];
    for (const row of body.data) {
      const linkedin = String(row.linkedin_url || '');
      if (linkedin.includes('/jane')) matched.push(match(row, { id: 'p-jane', name: 'Jane Doe', linkedin, title: 'Director of Operations', email: { status: 'VERIFIED', revealed: true, email: 'jane@acme.com' } }));
      if (linkedin.includes('/alice')) matched.push(match(row, { id: 'p-alice', name: 'Alice Roe', linkedin, title: 'Chief Executive Officer', email: { status: 'UNVERIFIED', revealed: true, email: 'alice@acme.com' } }));
    }
    return Response.json({ error: false, total_cost: 1, matched, not_matched: body.data.filter(row => !matched.some(item => item.identifier === row.identifier)).map(row => row.identifier) });
  }
  throw new Error(`Unexpected request ${target}`);
};

const criteria = { countryCode: 'us', jobLevels: ['C-Team', 'VP', 'Director'], jobFunctions: ['Operations', 'Sales & Business Development'] };
try {
  const merged = await sourceContactsForCompany('https://www.acme.com/about', criteria, { maxPerCall: 4 });
  const search = requests.filter(request => request.target.endsWith('/search-person'));
  assert.equal(search.length, 1);
  assert.deepEqual(search[0].body.filters.company.websites.include, ['acme.com']);
  assert.equal(search[0].body.page, 1);
  assert.equal(search[0].body.filters.max_person_per_company, 4);
  assert.deepEqual(search[0].body.filters.person_seniority.include, ['Founder/Owner', 'C-Suite', 'Partner', 'Vice President', 'Head', 'Director']);
  assert.deepEqual(search[0].body.filters.person_department.include, ['Operations', 'Sales']);
  assert.deepEqual(search[0].body.filters.person_location_search.include, ['United States']);
  const mobile = requests.find(request => request.target.endsWith('/bulk-enrich-person') && request.body.enrich_mobile === true);
  const email = requests.find(request => request.target.endsWith('/bulk-enrich-person') && request.body.enrich_mobile === false);
  assert.equal(mobile.body.only_verified_mobile, true);
  assert.equal(mobile.body.only_verified_email, false);
  assert.deepEqual(mobile.body.data.map(row => row.linkedin_url).sort(), ['https://www.linkedin.com/in/alice', 'https://www.linkedin.com/in/bob']);
  assert.equal(mobile.body.data.find(row => row.linkedin_url.includes('/alice')).person_id, undefined);
  assert.equal(mobile.body.data.find(row => row.linkedin_url.includes('/bob')).person_id, 'p-bob');
  assert.equal(email.body.only_verified_email, true);
  assert.equal(email.body.enrich_mobile, false);
  assert.deepEqual(email.body.data.map(row => row.linkedin_url).sort(), ['https://www.linkedin.com/in/alice', 'https://www.linkedin.com/in/chris', 'https://www.linkedin.com/in/jane']);
  assert.equal(merged.contacts.length, 4);
  const janeContact = merged.contacts.find(contact => contact.fullName === 'Jane Doe');
  const alice = merged.contacts.find(contact => contact.fullName === 'Alice Roe');
  const bob = merged.contacts.find(contact => contact.fullName === 'Bob Stone');
  const chris = merged.contacts.find(contact => contact.fullName === 'Chris Hale');
  assert.equal(janeContact.title, 'Director of Operations');
  assert.equal(janeContact.priority, 'P2');
  assert.equal(janeContact.email, 'jane@acme.com');
  assert.equal(janeContact.mobile, undefined);
  assert.equal(janeContact.location, 'Boston, MA, US');
  assert.deepEqual(janeContact.sources, ['blitz', 'prospeo']);
  assert.equal(alice.priority, 'P1');
  assert.equal(alice.email, undefined);
  assert.equal(alice.mobile, undefined);
  assert.deepEqual(alice.sources, ['blitz']);
  assert.equal(bob.email, 'bob@acme.com');
  assert.equal(bob.mobile, '+1 415-555-0101');
  assert.equal(bob.priority, 'P1');
  assert.deepEqual(bob.sources, ['prospeo']);
  assert.equal(chris.mobile, '+1 415-555-0100');
  assert.equal(chris.email, undefined);
  assert.deepEqual(merged.credits, { blitz: 3, prospeo: 12 });
  console.log('PASS merged contacts, verified-only email, P1 mobile lookup, and reported credits');

  mode = 'blitz-down'; requests = [];
  const fromProspeo = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.ok(fromProspeo.contacts.some(contact => contact.fullName === 'Bob Stone'));
  assert.equal(fromProspeo.contacts.some(contact => contact.sources.includes('blitz')), false);
  console.log('PASS Blitz failure still returns Prospeo contacts');

  mode = 'prospeo-down'; requests = [];
  const fromBlitz = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.ok(fromBlitz.contacts.some(contact => contact.fullName === 'Alice Roe'));
  assert.equal(fromBlitz.contacts.every(contact => contact.sources.includes('prospeo') === false), true);
  assert.ok(requests.some(request => request.target.endsWith('/bulk-enrich-person')));
  console.log('PASS Prospeo failure still returns Blitz contacts');

  mode = 'prospeo-auth'; requests = [];
  const authFallback = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.equal(authFallback.contacts.some(contact => contact.fullName === 'Jane Doe'), true);
  assert.equal(requests.some(request => request.target.endsWith('/bulk-enrich-person')), false);
  console.log('PASS Prospeo auth failure does not spend an enrich call');

  mode = 'both-down'; requests = [];
  await assert.rejects(sourceContactsForCompany('acme.com', criteria), /500/);
  console.log('PASS both providers failing leaves the company retryable');

  mode = 'no-results'; requests = [];
  const none = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.ok(none.contacts.some(contact => contact.fullName === 'Alice Roe'));
  assert.equal(none.credits.prospeo, 11);
  console.log('PASS Prospeo NO_RESULTS is empty and still enriches saved people');

  mode = 'no-linkedin'; requests = [];
  const located = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.equal(located.companyLinkedin, company);
  assert.ok(located.contacts.some(contact => contact.fullName === 'Bob Stone'));
  console.log('PASS a missing Blitz company URL does not skip Prospeo');

  mode = 'location'; requests = [];
  const retried = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  const searches = requests.filter(request => request.target.endsWith('/search-person'));
  assert.equal(searches.length, 2);
  assert.equal(searches[1].body.filters.person_location_search, undefined);
  assert.equal(retried.contacts.length, 4);
  console.log('PASS an invalid Prospeo location filter is retried once without it');

  delete process.env.BLITZ_API_KEY;
  delete process.env.PROSPEO_API_KEY;
  requests = [];
  await assert.rejects(sourceContactsForCompany('acme.com', criteria), /BLITZ_API_KEY is not set/);
  await assert.rejects(sourceContactsForCompany('acme.com', criteria), /PROSPEO_API_KEY is not set/);
  assert.equal(requests.length, 0);
  console.log('PASS missing provider keys do not call the network');

  process.env.PROSPEO_API_KEY = 'offline-prospeo';
  mode = 'blitz-missing'; requests = [];
  const onlyProspeo = await sourceContactsForCompany('acme.com', criteria, { maxPerCall: 4 });
  assert.ok(onlyProspeo.contacts.every(contact => contact.sources.includes('prospeo')));
  assert.equal(onlyProspeo.credits.blitz, null);
  console.log('PASS a missing Blitz key still returns Prospeo contacts');
} finally {
  globalThis.fetch = fetchOriginal;
  if (blitzKey === undefined) delete process.env.BLITZ_API_KEY; else process.env.BLITZ_API_KEY = blitzKey;
  if (prospeoKey === undefined) delete process.env.PROSPEO_API_KEY; else process.env.PROSPEO_API_KEY = prospeoKey;
}
