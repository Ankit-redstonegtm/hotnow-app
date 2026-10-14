-- Additive, non-destructive. Lightweight per-opportunity feedback so the founder can
-- judge opportunity quality: one verdict (+ optional reason) per opportunity per seller.
-- NOT YET APPLIED to production (requires founder approval) - apply at/just before deploy.
create table if not exists hotnow.opportunity_feedback (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references hotnow.opportunities(id) on delete cascade,
  seller_profile_id uuid not null references hotnow.seller_profiles(id) on delete cascade,
  verdict text not null check (verdict in ('useful','not_relevant')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create index if not exists idx_oppfeedback_profile on hotnow.opportunity_feedback(seller_profile_id);

alter table hotnow.opportunity_feedback enable row level security;

drop policy if exists oppfeedback_all on hotnow.opportunity_feedback;
create policy oppfeedback_all on hotnow.opportunity_feedback
  for all
  using (hotnow.owns_profile(seller_profile_id))
  with check (hotnow.owns_profile(seller_profile_id));
