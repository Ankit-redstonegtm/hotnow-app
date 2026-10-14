-- Applied 2026-10-15. Additive, non-destructive.
-- Persisted outreach drafts (email + linkedin) per opportunity+contact. RLS owner-scoped
-- via hotnow.owns_profile(), matching every other seller-owned table.
create table if not exists hotnow.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references hotnow.seller_profiles(id) on delete cascade,
  opportunity_id uuid not null references hotnow.opportunities(id) on delete cascade,
  contact_id uuid references hotnow.contacts(id) on delete set null,
  channel text not null check (channel in ('email','linkedin')),
  subject text,
  body text not null default '',
  followups jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, contact_id, channel)
);

create index if not exists idx_outreach_drafts_profile on hotnow.outreach_drafts(seller_profile_id);
create index if not exists idx_outreach_drafts_opp on hotnow.outreach_drafts(opportunity_id);

alter table hotnow.outreach_drafts enable row level security;

drop policy if exists outreach_all on hotnow.outreach_drafts;
create policy outreach_all on hotnow.outreach_drafts
  for all
  using (hotnow.owns_profile(seller_profile_id))
  with check (hotnow.owns_profile(seller_profile_id));
