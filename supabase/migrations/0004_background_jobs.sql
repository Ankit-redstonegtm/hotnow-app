-- Additive, non-destructive. Durable queue for contact + email enrichment so the work
-- continues when the browser tab is closed. Adapted from PR #1 (metaabid) migration 002.
-- Creates one new table and one function; touches no existing table. Safe to re-run.
-- NOT YET APPLIED to production - apply BEFORE deploying the code that uses it.
begin;

create table if not exists hotnow.background_jobs (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles(id) on delete cascade,
  kind text not null check (kind in ('contacts','emails')),
  status text not null default 'queued' check (status in ('queued','running','retrying','completed','failed','cancelled')),
  step text not null default 'Waiting for a worker',
  options jsonb not null default '{}',
  completed_items integer not null default 0,
  total_items integer not null default 0,
  result_count integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  locked_by uuid,
  locked_until timestamptz,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

-- At most one active job of each kind per workspace (enqueue is idempotent).
create unique index if not exists one_active_background_kind
  on hotnow.background_jobs(seller_profile_id, kind)
  where status in ('queued','running','retrying');
create index if not exists background_jobs_claim
  on hotnow.background_jobs(next_attempt_at, created_at)
  where status in ('queued','running','retrying');

-- Users may read their own jobs; every write goes through the service-role worker/API.
alter table hotnow.background_jobs enable row level security;
drop policy if exists read_owned_jobs on hotnow.background_jobs;
create policy read_owned_jobs on hotnow.background_jobs
  for select to authenticated
  using (hotnow.owns_profile(seller_profile_id));
grant select on hotnow.background_jobs to authenticated;
grant all on hotnow.background_jobs to service_role;

-- Only the worker can claim work. Expired leases allow crash recovery. A claimed job
-- processes one company/person per batch, then releases its lease.
create or replace function hotnow.claim_background_jobs(worker_id uuid, batch_size integer default 1)
returns setof hotnow.background_jobs language sql security definer set search_path = '' as $$
  with candidates as (
    select id from hotnow.background_jobs
    where status in ('queued','running','retrying') and next_attempt_at <= now()
      and (locked_until is null or locked_until < now())
    order by next_attempt_at, created_at for update skip locked limit greatest(1, least(batch_size, 3))
  ) update hotnow.background_jobs j set status = 'running', locked_by = worker_id,
      locked_until = now() + interval '3 minutes', updated_at = now()
    from candidates c where j.id = c.id returning j.*;
$$;
revoke all on function hotnow.claim_background_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function hotnow.claim_background_jobs(uuid, integer) to service_role;

notify pgrst, 'reload schema';
commit;

-- Rollback (nothing else depends on it):
--   drop function if exists hotnow.claim_background_jobs(uuid, integer);
--   drop table if exists hotnow.background_jobs;
