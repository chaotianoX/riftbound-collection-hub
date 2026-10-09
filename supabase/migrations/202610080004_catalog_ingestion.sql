-- Additive administrative import metadata. Existing inventories are untouched.
alter table public.card_printings add column previewed boolean not null default false;
create table private.catalog_import_keys (
  card_code text primary key,
  canonical_key text not null,
  card_id uuid not null references public.cards,
  printing_id uuid not null unique,
  foreign key(printing_id,card_id) references public.card_printings(id,card_id)
);
revoke all on private.catalog_import_keys from public,anon,authenticated;
create table public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'LouisCourrian/riftbound-cards',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','success','partial','error')),
  version text,
  checksum text,
  counts jsonb not null default '{}',
  unresolved integer not null default 0 check (unresolved>=0),
  images_ready integer not null default 0 check (images_ready>=0),
  images_failed integer not null default 0 check (images_failed>=0),
  retained integer not null default 0 check (retained>=0),
  error_code text check (error_code is null or error_code='IMPORT_FAILED')
);
create index catalog_sync_latest_idx on public.catalog_sync_runs(started_at desc);
alter table public.catalog_sync_runs enable row level security;
create policy catalog_sync_read on public.catalog_sync_runs for select to anon,authenticated using (true);
revoke all on public.catalog_sync_runs from public,anon,authenticated;
grant select on public.catalog_sync_runs to anon,authenticated;
-- Same invoker/RLS contract and single-statement snapshot as the original RPC.
create or replace function public.workspace_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'printings',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('is_fixture',s.is_fixture,'source_url',s.url,'source_version',s.version,'collection_category',c.collection_category,'previewed',raw.previewed))
    from public.catalog_printings p join public.card_printings raw on raw.id=p.id join public.catalog_sources s on s.id=p.source_id join public.cards c on c.id=p.card_id where p.eligible),'[]'::jsonb),
  'cards',coalesce((select jsonb_agg(to_jsonb(c)) from public.cards c),'[]'::jsonb),
  'sets',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.sets s),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p)) from public.products p),'[]'::jsonb),
  'contents',coalesce((select jsonb_agg(to_jsonb(p)) from public.product_contents p),'[]'::jsonb),
  'images',coalesce((select jsonb_agg(to_jsonb(i)) from public.card_images i where i.usage_verified and i.state='ready'),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from public.inventory_status i where i.user_id=auth.uid()),'[]'::jsonb),
  'wishlist',coalesce((select jsonb_agg(to_jsonb(w)) from public.wishlist_entries w where w.user_id=auth.uid()),'[]'::jsonb),
  'decks',coalesce((select jsonb_agg(to_jsonb(d)) from public.decks d where d.user_id=auth.uid()),'[]'::jsonb),
  'lines',coalesce((select jsonb_agg(to_jsonb(l)) from public.deck_cards l where l.user_id=auth.uid()),'[]'::jsonb),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.deck_allocations a where a.user_id=auth.uid()),'[]'::jsonb),
  'preferences', (select jsonb_build_object('collection',p.collection_sort,'wishlist',p.wishlist_sort) from public.profiles p where p.user_id=auth.uid()),
  'catalogSync', (select to_jsonb(r) from public.catalog_sync_runs r order by r.started_at desc,r.id desc limit 1),
  'sources',coalesce((select jsonb_agg(to_jsonb(s)) from public.catalog_sources s),'[]'::jsonb)
) where auth.uid() is not null;
$$;
