-- Additive upgrade for an existing HotNow project. Run once in the Supabase SQL Editor.
-- Stores where a workspace delivers new opportunities. Credentials live in
-- delivery_secrets, which signed-in users cannot read. The app writes both
-- tables with the service role after checking workspace ownership.
begin;

create table if not exists hotnow.delivery_connections (
  seller_profile_id uuid not null references hotnow.seller_profiles on delete cascade,
  provider text not null check (provider in ('slack')),
  status text not null default 'pending' check (status in ('pending','connected','error')),
  enabled boolean not null default true,
  display_name text,
  destination_label text,
  external_id text,
  config jsonb not null default '{}',
  last_error text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (seller_profile_id, provider)
);

create table if not exists hotnow.delivery_secrets (
  seller_profile_id uuid not null,
  provider text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  primary key (seller_profile_id, provider),
  foreign key (seller_profile_id, provider)
    references hotnow.delivery_connections (seller_profile_id, provider) on delete cascade
);

alter table hotnow.delivery_connections enable row level security;
drop policy if exists read_own_delivery on hotnow.delivery_connections;
create policy read_own_delivery on hotnow.delivery_connections
  for select to authenticated
  using (
    exists (
      select 1 from hotnow.seller_profiles p
      where p.id = seller_profile_id and p.user_id = (select auth.uid())
    )
  );

alter table hotnow.delivery_secrets enable row level security;

revoke all on hotnow.delivery_connections from public, anon;
revoke all on hotnow.delivery_secrets from public, anon, authenticated;
grant select on hotnow.delivery_connections to authenticated;
grant select, insert, update, delete on hotnow.delivery_connections to service_role;
grant select, insert, update, delete on hotnow.delivery_secrets to service_role;

notify pgrst, 'reload schema';
commit;
