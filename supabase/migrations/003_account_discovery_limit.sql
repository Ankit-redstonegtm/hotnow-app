-- Run in the existing Supabase project's SQL Editor.
-- Removes the daily discovery-run cap for abidansaria024@gmail.com only.
-- The exemption is stored against the immutable auth user ID, not profile data.
begin;

create table if not exists hotnow_private.discovery_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_run_limit integer check (daily_run_limit is null or daily_run_limit >= 0)
);
revoke all on hotnow_private.discovery_limits from public, anon, authenticated;

-- NULL means unlimited; accounts without an override retain 10 runs/day.
insert into hotnow_private.discovery_limits(user_id, daily_run_limit)
select id, null from auth.users where lower(email) = 'abidansaria024@gmail.com'
on conflict (user_id) do update set daily_run_limit = excluded.daily_run_limit;

create or replace function hotnow.discovery_daily_limit(target_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from hotnow_private.discovery_limits where user_id = target_user_id
  ) then (
    select daily_run_limit from hotnow_private.discovery_limits where user_id = target_user_id
  ) else 10 end;
$$;
revoke all on function hotnow.discovery_daily_limit(uuid) from public, anon, authenticated;
grant execute on function hotnow.discovery_daily_limit(uuid) to service_role;

create or replace function hotnow_private.check_discovery_budget() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  allowed_runs integer;
begin
  select user_id into owner_id from hotnow.seller_profiles where id = new.seller_profile_id;
  allowed_runs := hotnow.discovery_daily_limit(owner_id);
  if allowed_runs is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if (select count(*) from hotnow.discovery_runs r
      join hotnow.seller_profiles p on p.id = r.seller_profile_id
      where p.user_id = owner_id
        and r.requested_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= allowed_runs then
    raise exception 'Daily discovery limit reached (% runs across your companies). Try again tomorrow UTC.', allowed_runs;
  end if;
  return new;
end;
$$;
revoke all on function hotnow_private.check_discovery_budget() from public;
notify pgrst, 'reload schema';
commit;

-- Verification: this should return the requested email and "unlimited".
select u.email, case when l.daily_run_limit is null then 'unlimited' else l.daily_run_limit::text end as daily_discovery_limit
from auth.users u join hotnow_private.discovery_limits l on l.user_id = u.id
where lower(u.email) = 'abidansaria024@gmail.com';
