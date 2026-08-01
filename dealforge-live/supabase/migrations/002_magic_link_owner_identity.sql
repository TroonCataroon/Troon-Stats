begin;
create extension if not exists pgcrypto;
create schema if not exists private;
create table if not exists private.owner_identity (
  singleton boolean primary key default true check (singleton),
  email_sha256 text not null,
  configured_at timestamptz not null default now()
);
revoke all on table private.owner_identity from public, anon, authenticated;
create or replace function public.claim_app_owner()
returns boolean
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if current_user_id is null or current_email = '' then return false; end if;
  if not exists (
    select 1 from private.owner_identity
    where singleton = true
      and email_sha256 = encode(digest(current_email, 'sha256'), 'hex')
  ) then return false; end if;
  perform pg_advisory_xact_lock(hashtext('dealforge-single-owner'));
  insert into public.app_owner (singleton, user_id, email)
  values (true, current_user_id, current_email)
  on conflict (singleton) do nothing;
  return exists (
    select 1 from public.app_owner
    where singleton = true and user_id = current_user_id
  );
end;
$$;
revoke all on function public.claim_app_owner() from public, anon;
grant execute on function public.claim_app_owner() to authenticated;
comment on table private.owner_identity is 'Provision exactly one SHA-256 hash of the normalized DealForge owner email outside source control.';
commit;
