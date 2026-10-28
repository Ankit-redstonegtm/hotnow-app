import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const PB = '10000000-0000-4000-8000-000000000003';
const S1 = '20000000-0000-4000-8000-000000000001';
const S2 = '20000000-0000-4000-8000-000000000002';
const C1 = '30000000-0000-4000-8000-000000000001';
const O1 = '40000000-0000-4000-8000-000000000001';
const O2 = '40000000-0000-4000-8000-000000000002';
const L1 = '50000000-0000-4000-8000-000000000001';

async function userQuery(user, sql, params = []) {
  await db.exec('begin; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    return await db.query(sql, params);
  } finally { await db.exec('rollback'); }
}
async function check(name, fn) { await fn(); console.log(`PASS ${name}`); checks++; }

try {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/001_hotnow.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into auth.users(id,email) values ('${A}','abidansaria024@gmail.com'), ('${B}','ordinary@example.com');
    insert into hotnow.seller_profiles(id,user_id,domain) values
      ('${P1}','${A}','one.example'), ('${P2}','${A}','two.example'), ('${PB}','${B}','one.example');
    insert into hotnow.buying_situations(id,seller_profile_id,name,discovery_objective) values
      ('${S1}','${P1}','Expansion','Find expanding operators'), ('${S2}','${P2}','Hiring','Find hiring operators');
    insert into hotnow.companies(id,normalized_domain,name) values ('${C1}','buyer.example','Buyer');
    insert into hotnow.opportunities(id,seller_profile_id,company_id,situation_id) values
      ('${O1}','${P1}','${C1}','${S1}'), ('${O2}','${P2}','${C1}','${S2}');
    insert into hotnow.evidence(opportunity_id,source_url) values ('${O1}','https://buyer.example/news');
    insert into hotnow.lists(id,seller_profile_id,name,kind) values ('${L1}','${P1}','Outreach','companies');`);

  await check('one user can save two domains; another user can save the same domain', async () => {
    assert.equal((await userQuery(A, 'select * from hotnow.seller_profiles')).rows.length, 2);
    assert.equal((await userQuery(B, 'select * from hotnow.seller_profiles')).rows.length, 1);
  });
  await check('duplicate domain for the same user is rejected', async () => {
    await assert.rejects(userQuery(A, 'insert into hotnow.seller_profiles(user_id,domain) values ($1,$2)', [A,'one.example']), /unique/i);
  });
  await check('users cannot read or update another user profile', async () => {
    assert.equal((await userQuery(B, 'select * from hotnow.seller_profiles where id=$1', [P1])).rows.length, 0);
    assert.equal((await userQuery(B, "update hotnow.seller_profiles set company_name='intruder' where id=$1 returning id", [P1])).rows.length, 0);
  });
  await check('users cannot create a profile for someone else', async () => {
    await assert.rejects(userQuery(B, "insert into hotnow.seller_profiles(user_id,domain) values ($1,'attack.example')", [A]), /row-level security/i);
  });
  await check('opportunities, companies and citations stay private', async () => {
    for (const table of ['opportunities','companies','evidence']) {
      assert.equal((await userQuery(B, `select * from hotnow.${table}`)).rows.length, 0);
      assert.ok((await userQuery(A, `select * from hotnow.${table}`)).rows.length > 0);
    }
  });
  await check('list accepts an opportunity from its workspace', async () => {
    assert.equal((await userQuery(A, 'insert into hotnow.list_items(list_id,opportunity_id) values ($1,$2) returning id', [L1,O1])).rows.length, 1);
  });
  await check('list rejects an opportunity from another workspace of the same user', async () => {
    await assert.rejects(userQuery(A, 'insert into hotnow.list_items(list_id,opportunity_id) values ($1,$2)', [L1,O2]), /row-level security/i);
  });
  await check('users cannot write server-managed contacts or read prewarm data', async () => {
    await assert.rejects(userQuery(A, "insert into hotnow.contacts(seller_profile_id,company_id,full_name,priority) values ($1,$2,'Fake','P1')", [P1,C1]), /permission denied/i);
    await assert.rejects(userQuery(A, 'select * from hotnow.prewarm_research'), /permission denied/i);
  });
  await check('runs cannot reference a signal from a different workspace', async () => {
    await assert.rejects(userQuery(A, "insert into hotnow.discovery_runs(seller_profile_id,situation_id,provider_job_id,generator,match_limit) values ($1,$2,'bad','base',5)", [P1,S2]), /foreign key/i);
  });
  const run = (job, profile=P1, signal=S1, status='running') => db.query(
    'insert into hotnow.discovery_runs(seller_profile_id,situation_id,provider_job_id,generator,match_limit,status) values ($1,$2,$3,$4,5,$5) returning id',
    [profile,signal,job,'base',status]);
  const first = (await run('job-1')).rows[0].id;
  await check('overlapping launches for the same signal are rejected', async () => {
    await assert.rejects(run('job-duplicate'), /unique/i);
  });
  await check('only one ingestion worker can claim an active run', async () => {
    const claim = () => db.query(`update hotnow.discovery_runs set ingestion_claimed_until=now()+interval '10 minutes'
      where id=$1 and (ingestion_claimed_until is null or ingestion_claimed_until<now()) returning id`, [first]);
    assert.equal((await claim()).rows.length, 1);
    assert.equal((await claim()).rows.length, 0);
  });
  await check('contact sourcing state is separate for each company workspace', async () => {
    await db.query('insert into hotnow.contact_sourcing(seller_profile_id,company_id) values ($1,$2)', [P1,C1]);
    assert.equal((await userQuery(A, 'select * from hotnow.contact_sourcing where seller_profile_id=$1', [P2])).rows.length, 0);
    assert.equal((await userQuery(B, 'select * from hotnow.contact_sourcing')).rows.length, 0);
  });
  await check('daily cap is enforced across all workspaces belonging to one user', async () => {
    await db.query("update hotnow.discovery_runs set status='completed' where id=$1", [first]);
    for (let i=2; i<=10; i++) await run(`job-${i}`, P1, S1, 'completed');
    await assert.rejects(run('eleventh', P2, S2), /Daily discovery limit/i);
  });
  await db.exec(await readFile(new URL('../supabase/migrations/002_background_jobs.sql', import.meta.url), 'utf8'));
  await check('enrichment jobs are private and only service role can claim work', async () => {
    const job = (await db.query("insert into hotnow.background_jobs(seller_profile_id,kind) values ($1,'contacts') returning id", [P1])).rows[0].id;
    assert.equal((await userQuery(A, 'select id from hotnow.background_jobs')).rows.length, 1);
    assert.equal((await userQuery(B, 'select id from hotnow.background_jobs')).rows.length, 0);
    await assert.rejects(userQuery(A, 'select * from hotnow.claim_background_jobs($1,1)', [A]), /permission denied/i);
    assert.equal((await db.query('select * from hotnow.claim_background_jobs($1,1)', [A])).rows.length, 1);
    assert.equal((await db.query('select * from hotnow.claim_background_jobs($1,1)', [B])).rows.length, 0);
    await db.query("update hotnow.background_jobs set locked_until=now()-interval '1 second' where id=$1", [job]);
    assert.equal((await db.query('select * from hotnow.claim_background_jobs($1,1)', [B])).rows[0].locked_by, B);
    await assert.rejects(db.query("insert into hotnow.background_jobs(seller_profile_id,kind) values ($1,'contacts')", [P1]), /duplicate key/i);
  });
  await db.exec(await readFile(new URL('../supabase/migrations/003_account_discovery_limit.sql', import.meta.url), 'utf8'));
  await check('requested account can exceed ten daily runs across its companies', async () => {
    assert.equal((await db.query('select hotnow.discovery_daily_limit($1) as limit_value', [A])).rows[0].limit_value, null);
    for (let i = 11; i <= 22; i++) await run(`exempt-${i}`, i % 2 ? P1 : P2, i % 2 ? S1 : S2, 'completed');
    assert.equal((await db.query('select count(*)::int as total from hotnow.discovery_runs where seller_profile_id in ($1,$2)', [P1,P2])).rows[0].total, 22);
  });
  await check('other users retain ten-run cap and cannot grant themselves exemptions', async () => {
    assert.equal((await db.query('select hotnow.discovery_daily_limit($1) as limit_value', [B])).rows[0].limit_value, 10);
    const signal = '20000000-0000-4000-8000-000000000003';
    await db.query("insert into hotnow.buying_situations(id,seller_profile_id,name,discovery_objective) values ($1,$2,'Test','Test')", [signal,PB]);
    for (let i = 1; i <= 10; i++) await run(`ordinary-${i}`, PB, signal, 'completed');
    await assert.rejects(run('ordinary-eleventh', PB, signal, 'completed'), /Daily discovery limit/i);
    await assert.rejects(userQuery(B, 'insert into hotnow_private.discovery_limits(user_id,daily_run_limit) values ($1,null)', [B]), /permission denied/i);
    await assert.rejects(userQuery(B, 'select hotnow.discovery_daily_limit($1)', [A]), /permission denied/i);
  });
  await check('unlimited daily runs still cannot duplicate an active signal search', async () => {
    await run('exempt-active', P1, S1);
    await assert.rejects(run('exempt-duplicate', P1, S1), /unique/i);
  });
  await db.exec(await readFile(new URL('../supabase/migrations/004_delivery_connections.sql', import.meta.url), 'utf8'));
  await check('delivery status is visible only to the workspace owner', async () => {
    await db.query("insert into hotnow.delivery_connections(seller_profile_id, provider, status, destination_label) values ($1,'slack','connected','#leads')", [P1]);
    assert.equal((await userQuery(A, 'select provider from hotnow.delivery_connections')).rows.length, 1);
    assert.equal((await userQuery(B, 'select provider from hotnow.delivery_connections')).rows.length, 0);
    await assert.rejects(userQuery(A, "insert into hotnow.delivery_connections(seller_profile_id, provider) values ($1,'teams')", [P1]), /permission denied/i);
    await assert.rejects(userQuery(B, "insert into hotnow.delivery_connections(seller_profile_id, provider) values ($1,'teams')", [P1]), /permission denied|row-level security/i);
  });
  await check('delivery secrets stay on the server and follow the connection', async () => {
    await db.query("insert into hotnow.delivery_secrets(seller_profile_id, provider, ciphertext) values ($1,'slack','cipher')", [P1]);
    await assert.rejects(userQuery(A, 'select ciphertext from hotnow.delivery_secrets'), /permission denied/i);
    await assert.rejects(userQuery(A, "insert into hotnow.delivery_secrets(seller_profile_id, provider, ciphertext) values ($1,'slack','x')", [P1]), /permission denied/i);
    await db.query("delete from hotnow.delivery_connections where seller_profile_id=$1 and provider='slack'", [P1]);
    assert.equal((await db.query('select count(*)::int as total from hotnow.delivery_secrets')).rows[0].total, 0);
  });
  console.log(`${checks} database checks passed. No cloud credentials or paid calls used.`);
} finally { await db.close(); }
