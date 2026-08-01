begin;

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  claimed_at timestamptz not null default now()
);

alter table public.app_owner enable row level security;

create or replace function private.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.app_owner
    where singleton = true
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_app_owner() from public;
grant execute on function private.is_app_owner() to authenticated;

create or replace function public.claim_app_owner()
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if current_user_id is null or current_email = '' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('dealforge-single-owner'));

  insert into public.app_owner (singleton, user_id, email)
  values (true, current_user_id, current_email)
  on conflict (singleton) do nothing;

  return exists (
    select 1
    from public.app_owner
    where singleton = true
      and user_id = current_user_id
  );
end;
$$;

revoke all on function public.claim_app_owner() from public;
grant execute on function public.claim_app_owner() to authenticated;

drop policy if exists "Owner can view owner record" on public.app_owner;
create policy "Owner can view owner record"
on public.app_owner
for select
to authenticated
using (user_id = (select auth.uid()) and private.is_app_owner());

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  listing_id text not null,
  listing jsonb not null,
  notes text not null default '',
  status text not null default 'watching' check (status in ('watching', 'bidding', 'won', 'lost', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, listing_id)
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  query text not null,
  source text not null default 'all',
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id text not null,
  rule jsonb not null,
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete cascade,
  listing_id text not null,
  message text not null,
  observed_value numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  listings jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.manual_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  listing jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watchlist_updated_at on public.watchlist;
create trigger watchlist_updated_at
before update on public.watchlist
for each row execute function private.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at
before update on public.settings
for each row execute function private.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'watchlist',
    'saved_searches',
    'settings',
    'alerts',
    'alert_events',
    'comparisons',
    'manual_imports'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Owner select" on public.%I', table_name);
    execute format('drop policy if exists "Owner insert" on public.%I', table_name);
    execute format('drop policy if exists "Owner update" on public.%I', table_name);
    execute format('drop policy if exists "Owner delete" on public.%I', table_name);

    execute format(
      'create policy "Owner select" on public.%I for select to authenticated using (private.is_app_owner() and user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Owner insert" on public.%I for insert to authenticated with check (private.is_app_owner() and user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Owner update" on public.%I for update to authenticated using (private.is_app_owner() and user_id = (select auth.uid())) with check (private.is_app_owner() and user_id = (select auth.uid()))',
      table_name
    );
    execute format(
      'create policy "Owner delete" on public.%I for delete to authenticated using (private.is_app_owner() and user_id = (select auth.uid()))',
      table_name
    );
  end loop;
end
$$;

create index if not exists watchlist_user_id_idx on public.watchlist(user_id);
create index if not exists saved_searches_user_id_idx on public.saved_searches(user_id);
create index if not exists alerts_user_id_idx on public.alerts(user_id);
create index if not exists alert_events_user_id_idx on public.alert_events(user_id);
create index if not exists comparisons_user_id_idx on public.comparisons(user_id);
create index if not exists manual_imports_user_id_idx on public.manual_imports(user_id);

grant select on public.app_owner to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.alerts to authenticated;
grant select, insert, update, delete on public.alert_events to authenticated;
grant select, insert, update, delete on public.comparisons to authenticated;
grant select, insert, update, delete on public.manual_imports to authenticated;

commit;
