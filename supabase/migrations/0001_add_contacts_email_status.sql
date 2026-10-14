-- Applied 2026-10-15. Additive, non-destructive.
-- Track email lookup outcome without ever mislabeling an unverified email as verified.
-- null/'unknown' = not attempted, 'none' = checked none found, 'found' = have email (UNVERIFIED),
-- 'verified' = reserved for an explicit provider verification signal (unused today).
alter table hotnow.contacts add column if not exists email_status text;

update hotnow.contacts
set email_status = case
  when email is null then null
  when email = '' then 'none'
  else 'found'
end
where email_status is null;
