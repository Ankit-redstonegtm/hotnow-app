-- Run in the SQL Editor of a NEW Supabase cloud project.
-- Existing installations need their schema reviewed before applying this baseline.
begin;
create schema hotnow;
grant usage on schema hotnow to authenticated, service_role;

create table hotnow.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  company_name text,
  product_description text,
  target_customers text,
  problems_solved text,
  buyer_personas jsonb not null default '[]',
  industries jsonb not null default '[]',
  raw_research jsonb,
  research_task_id text,
  research_status text default 'none',
  situations_task_id text,
  situations_status text default 'none',
  slack_webhook_url text,
  contact_criteria jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, domain)
);
create table hotnow.buying_situations (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  name text not null,
  description text default '',
  demand_hypothesis text default '',
  observable_indicators jsonb not null default '[]',
  evidence_sources jsonb not null default '[]',
  discovery_objective text not null,
  match_conditions jsonb not null default '[]',
  generator text not null default 'base' check (generator in ('preview','base','core','pro')),
  enabled boolean not null default true,
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  unique (id, seller_profile_id)
);
create table hotnow.icp_constraints (
  seller_profile_id uuid primary key references hotnow.seller_profiles on delete cascade,
  geographies jsonb not null default '[]',
  industries jsonb not null default '[]',
  excluded_industries jsonb not null default '[]',
  size_min integer,
  size_max integer,
  daily_target integer not null default 5 check (daily_target between 1 and 15)
);
create table hotnow.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  situation_id uuid not null,
  provider text not null default 'parallel',
  provider_job_id text not null unique,
  generator text not null,
  match_limit integer not null,
  status text not null default 'queued',
  est_cost numeric,
  actual_cost numeric,
  candidates_count integer default 0,
  matched_count integer default 0,
  error text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  notified_at timestamptz,
  ingestion_claimed_until timestamptz,
  foreign key (situation_id, seller_profile_id) references hotnow.buying_situations(id, seller_profile_id) on delete cascade,
  unique (id, seller_profile_id)
);
create unique index one_active_run_per_signal on hotnow.discovery_runs(situation_id) where status in ('queued','running');
create index runs_workspace_status on hotnow.discovery_runs(seller_profile_id, status, requested_at);
-- Serialize budget checks for the same user across all of their workspaces.
create schema hotnow_private;
revoke all on schema hotnow_private from public;
create function hotnow_private.check_discovery_budget() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select user_id into owner_id from hotnow.seller_profiles where id = new.seller_profile_id;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if (select count(*) from hotnow.discovery_runs r
      join hotnow.seller_profiles p on p.id = r.seller_profile_id
      where p.user_id = owner_id and r.requested_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= 10 then
    raise exception 'Daily discovery limit reached (10 runs across your companies). Try again tomorrow UTC.';
  end if;
  return new;
end $$;
revoke all on function hotnow_private.check_discovery_budget() from public;
create trigger enforce_discovery_budget before insert on hotnow.discovery_runs
for each row execute function hotnow_private.check_discovery_budget();
create table hotnow.companies (
  id uuid primary key default gen_random_uuid(),
  normalized_domain text not null unique,
  name text not null,
  last_evidence_at timestamptz,
  created_at timestamptz not null default now()
);
create table hotnow.opportunities (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  company_id uuid not null references hotnow.companies,
  situation_id uuid not null,
  run_id uuid,
  what_happened text,
  why_it_matters text,
  confidence text,
  evidence_date date,
  status text default 'new',
  first_discovered_at timestamptz not null default now(),
  last_delivered_at timestamptz not null default now(),
  foreign key (situation_id, seller_profile_id) references hotnow.buying_situations(id, seller_profile_id) on delete cascade,
  foreign key (run_id, seller_profile_id) references hotnow.discovery_runs(id, seller_profile_id),
  unique (seller_profile_id, company_id, situation_id),
  unique (id, seller_profile_id)
);
create table hotnow.evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references hotnow.opportunities on delete cascade,
  reasoning text,
  source_url text not null,
  source_date date,
  citation jsonb
);
create index evidence_opportunity on hotnow.evidence(opportunity_id);
create table hotnow.contacts (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  company_id uuid not null references hotnow.companies,
  opportunity_id uuid,
  full_name text not null,
  title text,
  linkedin_url text,
  job_level text,
  job_function text,
  priority text not null check (priority in ('P1','P2','P3')),
  email text,
  source text default 'blitz',
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, seller_profile_id) references hotnow.opportunities(id, seller_profile_id) on delete cascade,
  unique (seller_profile_id, company_id, linkedin_url),
  unique (id, seller_profile_id)
);
create table hotnow.contact_sourcing (
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  company_id uuid not null references hotnow.companies,
  sourced_at timestamptz not null default now(),
  primary key (seller_profile_id, company_id)
);
create table hotnow.lists (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  name text not null,
  kind text not null check (kind in ('companies','contacts')),
  created_at timestamptz not null default now(),
  unique (id, seller_profile_id)
);
create table hotnow.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references hotnow.lists on delete cascade,
  opportunity_id uuid references hotnow.opportunities on delete cascade,
  contact_id uuid references hotnow.contacts on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(opportunity_id, contact_id) = 1),
  unique (list_id, opportunity_id),
  unique (list_id, contact_id)
);
create table hotnow.prewarm_research (
  domain text primary key,
  task_id text not null,
  created_at timestamptz not null default now()
);

-- No anonymous data access. Server-only ingestion tables are read-only for users.
grant all on all tables in schema hotnow to service_role;
grant select, insert, update, delete on hotnow.seller_profiles, hotnow.buying_situations,
  hotnow.icp_constraints, hotnow.discovery_runs, hotnow.lists, hotnow.list_items to authenticated;
grant select on hotnow.companies, hotnow.opportunities, hotnow.evidence,
  hotnow.contacts, hotnow.contact_sourcing to authenticated;

alter table hotnow.seller_profiles enable row level security;
create policy own_profiles on hotnow.seller_profiles to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
do $$
declare t text;
begin
  foreach t in array array['buying_situations','icp_constraints','discovery_runs','opportunities','contacts','contact_sourcing','lists'] loop
    execute format('alter table hotnow.%I enable row level security', t);
    execute format('create policy own_workspace on hotnow.%I to authenticated using (exists (select 1 from hotnow.seller_profiles p where p.id = seller_profile_id and p.user_id = (select auth.uid()))) with check (exists (select 1 from hotnow.seller_profiles p where p.id = seller_profile_id and p.user_id = (select auth.uid())))', t);
  end loop;
end $$;
alter table hotnow.companies enable row level security;
create policy visible_companies on hotnow.companies for select to authenticated using (
  exists (select 1 from hotnow.opportunities o where o.company_id = companies.id)
);
alter table hotnow.evidence enable row level security;
create policy visible_evidence on hotnow.evidence for select to authenticated using (
  exists (select 1 from hotnow.opportunities o where o.id = opportunity_id)
);
alter table hotnow.list_items enable row level security;
create policy own_list_items on hotnow.list_items to authenticated using (
  exists (select 1 from hotnow.lists l where l.id = list_id)
) with check (
  exists (select 1 from hotnow.lists l where l.id = list_id and (
    (contact_id is not null and exists (select 1 from hotnow.contacts c where c.id = contact_id and c.seller_profile_id = l.seller_profile_id))
    or (opportunity_id is not null and exists (select 1 from hotnow.opportunities o where o.id = opportunity_id and o.seller_profile_id = l.seller_profile_id))
  ))
);
alter table hotnow.prewarm_research enable row level security;
notify pgrst, 'reload schema';
commit;
