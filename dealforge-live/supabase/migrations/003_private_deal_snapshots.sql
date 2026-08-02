begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.deal_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_listing_id text not null,
  url text not null,
  title text not null,
  description text not null default '',
  category text not null default 'Electronics',
  item_price numeric(12,2) not null check (item_price >= 0),
  shipping_cost numeric(12,2) check (shipping_cost is null or shipping_cost >= 0),
  minimum_purchase numeric(12,2) check (minimum_purchase is null or minimum_purchase >= 0),
  estimated_landed_cost numeric(12,2) check (estimated_landed_cost is null or estimated_landed_cost >= 0),
  condition text not null default 'unknown',
  seller_name text,
  seller_confidence integer not null default 50 check (seller_confidence between 0 and 100),
  city text,
  state text,
  distance_miles numeric(8,2) check (distance_miles is null or distance_miles >= 0),
  pickup_available boolean not null default false,
  capacity_gb integer check (capacity_gb is null or capacity_gb > 0),
  form_factor text,
  interface text,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_listing_id)
);

create index if not exists deal_snapshots_active_expiry_idx
  on public.deal_snapshots(active, expires_at desc);
create index if not exists deal_snapshots_hardware_idx
  on public.deal_snapshots(capacity_gb, form_factor, interface);
create index if not exists deal_snapshots_observed_idx
  on public.deal_snapshots(observed_at desc);

alter table public.deal_snapshots enable row level security;
alter table public.deal_snapshots force row level security;

revoke all on public.deal_snapshots from public, anon, authenticated;

create table if not exists private.deal_search_owner (
  singleton boolean primary key default true check (singleton),
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);

revoke all on private.deal_search_owner from public, anon, authenticated;

create or replace function public.private_deal_search(p_access_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, pg_temp
as $$
declare
  token_is_valid boolean := false;
  snapshots jsonb := '[]'::jsonb;
begin
  if p_access_token is null or length(p_access_token) < 32 or length(p_access_token) > 256 then
    return jsonb_build_object('authorized', false, 'snapshots', '[]'::jsonb);
  end if;

  select exists (
    select 1
    from private.deal_search_owner
    where singleton = true
      and token_sha256 = encode(digest(p_access_token, 'sha256'), 'hex')
  ) into token_is_valid;

  if not token_is_valid then
    return jsonb_build_object('authorized', false, 'snapshots', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.observed_at desc), '[]'::jsonb)
  into snapshots
  from (
    select *
    from public.deal_snapshots
    where active = true
      and expires_at > now()
    order by observed_at desc
    limit 200
  ) snapshot_row;

  return jsonb_build_object('authorized', true, 'snapshots', snapshots);
end;
$$;

revoke all on function public.private_deal_search(text) from public;
grant execute on function public.private_deal_search(text) to anon, authenticated;

comment on table private.deal_search_owner is
  'Stores only the SHA-256 hash of the sole DealForge owner search token. Provision the hash outside source control.';
comment on function public.private_deal_search(text) is
  'Returns active private deal snapshots only when the supplied owner token matches the stored SHA-256 hash.';

commit;
