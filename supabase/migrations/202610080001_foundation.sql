-- P0. Catalog writes are restricted to trusted, reviewed import tooling.
-- No official cards, rules, products or images are seeded by this migration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.catalog_sources (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https://'),
  version text not null,
  retrieved_at timestamptz not null,
  checksum text not null,
  usage_notes text not null,
  official_verified boolean not null default false,
  unique(url, version)
);
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null unique check (sort_order >= 0),
  released_on date,
  source_id uuid not null references public.catalog_sources
);
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  card_type text,
  domains text[] not null default '{}',
  attributes jsonb not null default '{}',
  collection_category text check (collection_category in ('Normal','Legend','Battlefield')),
  source_id uuid not null references public.catalog_sources
);
create table public.card_printings (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards,
  set_id uuid not null references public.sets,
  card_number text,
  number_sort bigint generated always as (case when card_number ~ '^[0-9]+' then substring(card_number from '^[0-9]+')::bigint end) stored,
  suffix_sort text generated always as (case when card_number ~ '^[0-9]+' then regexp_replace(card_number,'^[0-9]+','') else '' end) stored,
  language text not null,
  rarity text,
  variant text not null check (variant in ('standard','alternate','special','promo')),
  treatment text not null check (treatment in ('nonfoil','foil','special')),
  printed_text text,
  source_id uuid not null references public.catalog_sources,
  unique(card_id, set_id, language, variant, treatment),
  unique(id, card_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_proving_grounds boolean not null default false,
  checklist_verified boolean not null default false,
  source_id uuid not null references public.catalog_sources
);
create table public.product_contents (
  product_id uuid not null references public.products on delete cascade,
  printing_id uuid not null references public.card_printings,
  published_quantity integer check (published_quantity > 0),
  source_id uuid not null references public.catalog_sources,
  primary key(product_id, printing_id)
);
create table public.card_images (
  printing_id uuid primary key references public.card_printings on delete cascade,
  storage_key text,
  authorized_url text check (authorized_url ~ '^https://'),
  source_id uuid not null references public.catalog_sources,
  usage_verified boolean not null default false,
  checksum text,
  width integer check (width > 0),
  height integer check (height > 0),
  state text not null default 'pending' check (state in ('pending','ready','error')),
  check (state <> 'ready' or (usage_verified and checksum is not null and width is not null and height is not null and (storage_key is not null or authorized_url is not null)))
);

-- Product exception is based on reviewed official composition, never box quantity.
-- It may include runes/tokens or non-standard treatments without inventing targets.
create view public.catalog_printings with (security_invoker = true) as
with pg as (
  select distinct cp.id, cp.card_id, cp.set_id, cp.language
  from public.card_printings cp
  join public.product_contents pc on pc.printing_id = cp.id
  join public.products p on p.id = pc.product_id
  join public.catalog_sources ps on ps.id = p.source_id
  join public.catalog_sources cs on cs.id = pc.source_id
  where p.is_proving_grounds and p.checklist_verified and ps.official_verified and cs.official_verified
)
select cp.*, s.code as set_code, s.sort_order, c.name, c.card_type, c.domains,
  case c.collection_category when 'Normal' then 3 when 'Legend' then 1 when 'Battlefield' then 1 end as masterset_target,
  (exists(select 1 from pg where pg.id = cp.id) or (
    not exists(select 1 from pg where pg.card_id = cp.card_id and pg.set_id = cp.set_id and pg.language = cp.language)
    and cp.variant = 'standard' and (
      (cp.rarity in ('Common','Uncommon') and cp.treatment = 'nonfoil') or
      (cp.rarity in ('Rare','Epic') and cp.treatment = 'foil')
    )
  )) as eligible,
  case when exists(select 1 from pg where pg.id = cp.id) then 'Verified Proving Grounds composition'
       else 'Standard rarity/treatment policy' end as eligibility_basis
from public.card_printings cp join public.sets s on s.id = cp.set_id join public.cards c on c.id = cp.card_id;

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  collection_sort jsonb not null default '{"field":"canonical","direction":"asc"}',
  wishlist_sort jsonb not null default '{"field":"canonical","direction":"asc"}'
);
create table public.collection_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  printing_id uuid not null references public.card_printings,
  owned integer not null default 0 check (owned >= 0),
  updated_at timestamptz not null default now(),
  unique(user_id, printing_id), unique(id, user_id)
);
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  mode text not null default 'theorycraft' check (mode in ('theorycraft','physical')),
  format text,
  -- No verified legality profile exists in P0; positive validation is impossible.
  legality_status text not null default 'Unverified' check (legality_status = 'Unverified'),
  unique(id, user_id)
);
create table public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  deck_id uuid not null,
  card_id uuid not null references public.cards,
  section text not null check (length(trim(section)) between 1 and 80),
  quantity integer not null check (quantity > 0),
  foreign key(deck_id,user_id) references public.decks(id,user_id) on delete cascade,
  unique(deck_id,card_id,section), unique(id,user_id)
);
create table public.deck_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  deck_card_id uuid not null,
  collection_entry_id uuid not null,
  quantity integer not null check (quantity > 0),
  foreign key(deck_card_id,user_id) references public.deck_cards(id,user_id) on delete cascade,
  foreign key(collection_entry_id,user_id) references public.collection_entries(id,user_id),
  unique(deck_card_id,collection_entry_id)
);
create index collection_printing_idx on public.collection_entries(printing_id);
create index lines_owner_idx on public.deck_cards(user_id,deck_id);
create index allocations_inventory_idx on public.deck_allocations(collection_entry_id);
create index allocations_owner_idx on public.deck_allocations(user_id,deck_card_id);
create index decks_owner_idx on public.decks(user_id);
create index printings_order_idx on public.card_printings(set_id,number_sort,suffix_sort,id);
create index contents_printing_idx on public.product_contents(printing_id);

-- No counters are persisted: ownership and reservation remain separate.
create view public.inventory_status with (security_invoker = true) as
select ce.*, coalesce(a.reserved,0) as reserved, ce.owned - coalesce(a.reserved,0) as available
from public.collection_entries ce left join (
  select collection_entry_id, sum(quantity) as reserved from public.deck_allocations group by collection_entry_id
) a on a.collection_entry_id = ce.id;

-- All API writes are RPC-only. RLS additionally isolates reads and future writes.
do $$
declare t text;
begin
  foreach t in array array['catalog_sources','sets','cards','card_printings','products','product_contents','card_images'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (true)',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to anon, authenticated',t);
  end loop;
  foreach t in array array['profiles','collection_entries','decks','deck_cards','deck_allocations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy own_rows on public.%I to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
revoke all on public.catalog_printings, public.inventory_status from anon, authenticated;
grant select on public.catalog_printings to anon, authenticated;
grant select on public.inventory_status to authenticated;

create function private.integer_input(v jsonb, minimum integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare n integer;
begin
  if v is null or jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]+$' then
    raise exception 'Quantity must be a whole number' using errcode = '22023';
  end if;
  n := v::text::integer;
  if n < minimum then raise exception 'Quantity is below the allowed minimum' using errcode = '22023'; end if;
  return n;
end $$;

-- Advisory serialization is per owner, covering inventory, lines, mode and deletes.
-- Read committed is required so reads after a waited lock see the latest commit.
-- Do not accept an owner ID from the caller.
create function public.mutate_inventory(action text, payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  uid uuid := auth.uid(); result_id uuid; deck_id uuid; line_id uuid;
  entry_id uuid; printing_id uuid; card_id uuid; n integer; reserved bigint;
  selected_mode text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Inventory operations require read committed isolation' using errcode = '25001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid payload' using errcode = '22023'; end if;
  case action
  when 'set_owned' then
    printing_id := (payload->>'printing_id')::uuid;
    n := private.integer_input(payload->'quantity',0);
    if not exists(select 1 from public.catalog_printings p where p.id = printing_id and p.eligible) then
      raise exception 'Printing is not eligible' using errcode = '22023';
    end if;
    select ce.id into entry_id from public.collection_entries ce where ce.user_id = uid and ce.printing_id = printing_id;
    select coalesce(sum(a.quantity),0) into reserved from public.deck_allocations a where a.collection_entry_id = entry_id;
    if n < reserved then
      raise exception 'Owned quantity cannot fall below reserved copies' using errcode = '23514',
        detail = (select coalesce(string_agg(distinct d.name, ', '),'') from public.deck_allocations a join public.deck_cards l on l.id = a.deck_card_id join public.decks d on d.id = l.deck_id where a.collection_entry_id = entry_id);
    end if;
    insert into public.collection_entries(user_id,printing_id,owned) values(uid,printing_id,n)
    on conflict on constraint collection_entries_user_id_printing_id_key do update set owned = excluded.owned, updated_at = now() returning id into result_id;
  when 'create_deck' then
    selected_mode := coalesce(payload->>'mode','theorycraft');
    insert into public.decks(user_id,name,mode,format) values(uid,payload->>'name',selected_mode,payload->>'format') returning id into result_id;
  when 'set_line' then
    deck_id := (payload->>'deck_id')::uuid;
    if not exists(select 1 from public.decks d where d.id = deck_id and d.user_id = uid) then raise exception 'Deck not found' using errcode = '42501'; end if;
    card_id := (payload->>'card_id')::uuid;
    n := private.integer_input(payload->'quantity',0);
    select l.id into line_id from public.deck_cards l where l.deck_id = deck_id and l.card_id = card_id and l.section = payload->>'section';
    select coalesce(sum(a.quantity),0) into reserved from public.deck_allocations a where a.deck_card_id = line_id;
    if n < reserved then raise exception 'Release allocations before reducing this line' using errcode = '23514'; end if;
    if n = 0 then delete from public.deck_cards where id = line_id; result_id := line_id;
    else
      insert into public.deck_cards(user_id,deck_id,card_id,section,quantity) values(uid,deck_id,card_id,payload->>'section',n)
      on conflict on constraint deck_cards_deck_id_card_id_section_key do update set quantity = excluded.quantity returning id into result_id;
    end if;
  when 'allocate' then
    line_id := (payload->>'deck_card_id')::uuid; entry_id := (payload->>'collection_entry_id')::uuid;
    n := private.integer_input(payload->'quantity',0);
    select d.mode, l.card_id into selected_mode,card_id from public.deck_cards l join public.decks d on d.id = l.deck_id where l.id = line_id and l.user_id = uid;
    if selected_mode is distinct from 'physical' then raise exception 'An owned physical deck line is required' using errcode = '42501'; end if;
    if not exists(select 1 from public.collection_entries ce join public.catalog_printings p on p.id = ce.printing_id where ce.id = entry_id and ce.user_id = uid and p.card_id = card_id and p.eligible) then
      raise exception 'Inventory ownership, eligibility or card identity mismatch' using errcode = '42501';
    end if;
    -- Until language/printing equivalence is verified, one exact printing per line.
    if n > 0 and exists(select 1 from public.deck_allocations a join public.collection_entries ce on ce.id = a.collection_entry_id where a.deck_card_id = line_id and ce.id <> entry_id) then
      raise exception 'Printing equivalence is unverified; release the current allocation first' using errcode = '22023';
    end if;
    select coalesce(sum(a.quantity),0) into reserved from public.deck_allocations a where a.collection_entry_id = entry_id and a.deck_card_id <> line_id;
    if n + reserved > (select ce.owned from public.collection_entries ce where ce.id = entry_id) then raise exception 'Insufficient available copies' using errcode = '23514'; end if;
    select coalesce(sum(a.quantity),0) into reserved from public.deck_allocations a where a.deck_card_id = line_id and a.collection_entry_id <> entry_id;
    if n + reserved > (select l.quantity from public.deck_cards l where l.id = line_id) then raise exception 'Allocation exceeds deck line quantity' using errcode = '23514'; end if;
    if n = 0 then delete from public.deck_allocations where deck_card_id = line_id and collection_entry_id = entry_id;
    else
      insert into public.deck_allocations(user_id,deck_card_id,collection_entry_id,quantity) values(uid,line_id,entry_id,n)
      on conflict on constraint deck_allocations_deck_card_id_collection_entry_id_key do update set quantity = excluded.quantity returning id into result_id;
    end if;
  when 'set_mode', 'delete_deck', 'duplicate_deck' then
    deck_id := (payload->>'deck_id')::uuid;
    if not exists(select 1 from public.decks d where d.id = deck_id and d.user_id = uid) then raise exception 'Deck not found' using errcode = '42501'; end if;
    if action = 'delete_deck' then delete from public.decks where id = deck_id; result_id := deck_id;
    elsif action = 'set_mode' then
      selected_mode := payload->>'mode';
      if selected_mode = 'theorycraft' then delete from public.deck_allocations a using public.deck_cards l where a.deck_card_id = l.id and l.deck_id = deck_id; end if;
      update public.decks set mode = selected_mode where id = deck_id; result_id := deck_id;
    else
      insert into public.decks(user_id,name,mode,format) select uid,coalesce(payload->>'name',d.name || ' copy'),'theorycraft',d.format from public.decks d where d.id = deck_id returning id into result_id;
      insert into public.deck_cards(user_id,deck_id,card_id,section,quantity) select uid,result_id,l.card_id,l.section,l.quantity from public.deck_cards l where l.deck_id = deck_id;
    end if;
  else raise exception 'Unknown inventory operation' using errcode = '22023';
  end case;
  return result_id;
end $$;
revoke all on function public.mutate_inventory(text,jsonb) from public, anon;
grant execute on function public.mutate_inventory(text,jsonb) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Defense in depth: cross-row integrity also applies to trusted SQL maintenance.
-- Trusted tooling must use the same owner lock; API roles have no direct DML grants.
create function private.check_inventory() returns trigger language plpgsql set search_path = '' as $$
declare uid uuid := coalesce(new.user_id,old.user_id);
begin
  if exists(select 1 from public.collection_entries ce join public.catalog_printings p on p.id = ce.printing_id where ce.user_id = uid and not p.eligible) then
    raise exception 'Inventory contains an ineligible printing' using errcode = '23514';
  end if;
  if exists(select 1 from public.collection_entries ce join public.deck_allocations a on a.collection_entry_id = ce.id where ce.user_id = uid group by ce.id,ce.owned having sum(a.quantity) > ce.owned) then
    raise exception 'Reserved copies exceed owned quantity' using errcode = '23514';
  end if;
  if exists(select 1 from public.deck_cards l join public.deck_allocations a on a.deck_card_id = l.id where l.user_id = uid group by l.id,l.quantity having sum(a.quantity) > l.quantity) then
    raise exception 'Allocations exceed line quantity' using errcode = '23514';
  end if;
  if exists(select 1 from public.deck_allocations a join public.deck_cards l on l.id = a.deck_card_id join public.decks d on d.id = l.deck_id join public.collection_entries ce on ce.id = a.collection_entry_id join public.card_printings p on p.id = ce.printing_id where a.user_id = uid and (d.mode <> 'physical' or p.card_id <> l.card_id)) then
    raise exception 'Allocation is incompatible with deck mode or identity' using errcode = '23514';
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['collection_entries','decks','deck_cards','deck_allocations'] loop
    execute format('create constraint trigger inventory_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.check_inventory()',t);
  end loop;
end $$;
revoke all on function private.check_inventory() from public, anon, authenticated;

-- A catalog update cannot silently invalidate previously recorded inventory.
-- Canonical set sequence is explicit; never infer it alphabetically.
create function private.check_catalog() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.sets a cross join public.sets b where a.code = 'OGN' and b.code = 'SFD' and a.sort_order >= b.sort_order) then
    raise exception 'OGN must precede SFD in the explicit set sequence' using errcode = '23514';
  end if;
  if exists(select 1 from public.collection_entries ce join public.catalog_printings p on p.id = ce.printing_id where not p.eligible) then
    raise exception 'Catalog update would invalidate existing inventory; reconcile before publishing' using errcode = '23514';
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['sets','card_printings','products','product_contents','catalog_sources'] loop
    execute format('create constraint trigger catalog_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.check_catalog()',t);
  end loop;
end $$;
revoke all on function private.check_catalog() from public, anon, authenticated;
