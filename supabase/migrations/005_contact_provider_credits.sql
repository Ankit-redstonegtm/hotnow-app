-- Additive upgrade. Run once in the Supabase SQL editor after 004.
-- Contacts can now record a mobile and more than one source (blitz, prospeo, or blitz,prospeo).
-- provider_credits stores reported credit usage per provider for a future admin view.
begin;
alter table hotnow.contacts add column if not exists mobile text;
alter table hotnow.background_jobs add column if not exists provider_credits jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
commit;
