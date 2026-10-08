-- P1/P2/P3: additive evolution. The P0 migration is preserved.
alter table public.catalog_sources add column is_fixture boolean not null default false;
alter table public.deck_cards add column preferred_printing_id uuid;
alter table public.deck_cards add constraint preferred_printing_identity
  foreign key(preferred_printing_id,card_id) references public.card_printings(id,card_id);

-- Quantities here are TOTAL acquisition goals, not pending purchases.
-- Reasons are independent: derived suggestions never overwrite a manual goal.
create table public.wishlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  printing_id uuid not null references public.card_printings,
  manual_target integer check (manual_target > 0),
  include_masterset boolean not null default false,
  include_decks boolean not null default false,
  priority text not null default 'Medium' check (priority in ('High','Medium','Low')),
  note text not null default '' check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  unique(user_id,printing_id),
  check (manual_target is not null or include_masterset or include_decks)
);
alter table public.wishlist_entries enable row level security;
create policy own_rows on public.wishlist_entries to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.wishlist_entries from anon, authenticated;
grant select on public.wishlist_entries to authenticated;
create index wishlist_printing_idx on public.wishlist_entries(printing_id);

create function public.mutate_workspace(action text, payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_printing uuid; v_deck uuid;
  v_target integer; v_reason text; v_preference jsonb; v_line jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Workspace operations require read committed isolation' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
  case action
  when 'save_sort' then
    if payload->>'screen' not in ('collection','wishlist') or payload->>'screen' is null then raise exception 'Unknown sort screen' using errcode='22023'; end if;
    if payload->>'field' is null or payload->>'field' not in ('canonical','name','rarity','type','domain','owned','missing','priority','desired')
      or (payload->>'screen'='collection' and payload->>'field' in ('priority','desired'))
      or payload->>'direction' is null or payload->>'direction' not in ('asc','desc') then
      raise exception 'Invalid sort preference' using errcode='22023';
    end if;
    v_preference := jsonb_build_object('field',payload->>'field','direction',payload->>'direction');
    insert into public.profiles(user_id) values(v_uid) on conflict(user_id) do nothing;
    if payload->>'screen'='collection' then update public.profiles set collection_sort=v_preference where user_id=v_uid;
    else update public.profiles set wishlist_sort=v_preference where user_id=v_uid; end if;
    return v_uid;
  when 'save_wishlist', 'add_wishlist_reason', 'remove_wishlist_reason', 'delete_wishlist' then
    v_printing := (payload->>'printing_id')::uuid;
    if not exists(select 1 from public.catalog_printings p where p.id=v_printing and p.eligible) then raise exception 'Printing is not eligible' using errcode='22023'; end if;
    if action='delete_wishlist' then
      delete from public.wishlist_entries where user_id=v_uid and printing_id=v_printing returning id into v_id;
    elsif action='save_wishlist' then
      v_target := private.integer_input(payload->'target',0);
      if payload->>'priority' is null or payload->>'priority' not in ('High','Medium','Low') or payload->>'note' is null then raise exception 'Invalid wishlist fields' using errcode='22023'; end if;
      -- Zero removes only the manual reason, retaining saved derived reasons.
      if v_target=0 then
        update public.wishlist_entries set manual_target=null, priority=payload->>'priority', note=payload->>'note',updated_at=now()
        where user_id=v_uid and printing_id=v_printing and (include_masterset or include_decks) returning id into v_id;
        delete from public.wishlist_entries where user_id=v_uid and printing_id=v_printing and not include_masterset and not include_decks returning id into v_id;
      else
        insert into public.wishlist_entries(user_id,printing_id,manual_target,priority,note)
          values(v_uid,v_printing,v_target,payload->>'priority',payload->>'note')
        on conflict(user_id,printing_id) do update set manual_target=excluded.manual_target, priority=excluded.priority,note=excluded.note,updated_at=now() returning id into v_id;
      end if;
    else
      v_reason := payload->>'reason';
      if v_reason is null or v_reason not in ('Masterset','Deck') then raise exception 'Invalid wishlist reason' using errcode='22023'; end if;
      if action='add_wishlist_reason' then
        insert into public.wishlist_entries(user_id,printing_id,include_masterset,include_decks)
          values(v_uid,v_printing,v_reason='Masterset',v_reason='Deck')
        on conflict(user_id,printing_id) do update set
          include_masterset=public.wishlist_entries.include_masterset or excluded.include_masterset,
          include_decks=public.wishlist_entries.include_decks or excluded.include_decks,updated_at=now() returning id into v_id;
      else
        -- Delete if this was the only reason; otherwise remove just the selected one.
        delete from public.wishlist_entries w where w.user_id=v_uid and w.printing_id=v_printing and w.manual_target is null
          and ((v_reason='Masterset' and not w.include_decks) or (v_reason='Deck' and not w.include_masterset)) returning id into v_id;
        update public.wishlist_entries w set include_masterset=case when v_reason='Masterset' then false else w.include_masterset end,
          include_decks=case when v_reason='Deck' then false else w.include_decks end,updated_at=now()
          where w.user_id=v_uid and w.printing_id=v_printing returning id into v_id;
      end if;
    end if;
    return v_id;
  when 'rename_deck' then
    v_deck := (payload->>'deck_id')::uuid;
    update public.decks set name=payload->>'name',format=nullif(payload->>'format','') where id=v_deck and user_id=v_uid returning id into v_id;
    if not found then raise exception 'Deck not found' using errcode='42501'; end if;
    return v_id;
  when 'set_line_printing' then
    v_id := (payload->>'deck_card_id')::uuid;
    v_printing := nullif(payload->>'printing_id','')::uuid;
    if not exists(select 1 from public.deck_cards l where l.id=v_id and l.user_id=v_uid) then raise exception 'Deck line not found' using errcode='42501'; end if;
    if v_printing is not null and not exists(select 1 from public.catalog_printings p join public.deck_cards l on l.card_id=p.card_id where l.id=v_id and p.id=v_printing and p.eligible) then raise exception 'Printing identity or eligibility mismatch' using errcode='22023'; end if;
    if exists(select 1 from public.deck_allocations a join public.collection_entries ce on ce.id=a.collection_entry_id where a.deck_card_id=v_id and ce.printing_id is distinct from v_printing) then raise exception 'Release allocations before changing the planned printing' using errcode='23514'; end if;
    update public.deck_cards set preferred_printing_id=v_printing where id=v_id;
    return v_id;
  when 'set_line' then
    v_id := public.mutate_inventory(action,payload);
    if (payload->>'quantity')::integer>0 and payload ? 'printing_id' then
      perform public.mutate_workspace('set_line_printing',jsonb_build_object('deck_card_id',v_id,'printing_id',payload->'printing_id'));
    end if;
    return v_id;
  when 'allocate' then
    if exists(select 1 from public.deck_cards l join public.collection_entries ce on ce.id=(payload->>'collection_entry_id')::uuid
      where l.id=(payload->>'deck_card_id')::uuid and l.user_id=v_uid and l.preferred_printing_id is not null and l.preferred_printing_id<>ce.printing_id) then
      raise exception 'Allocation must match the planned printing' using errcode='22023';
    end if;
    return public.mutate_inventory(action,payload);
  when 'duplicate_deck' then
    v_deck := (payload->>'deck_id')::uuid;
    -- Keep P0's safe duplication behavior and copy printing choices without reservations.
    v_id := public.mutate_inventory(action,payload);
    update public.deck_cards copied set preferred_printing_id=original.preferred_printing_id
      from public.deck_cards original where original.deck_id=v_deck and copied.deck_id=v_id and original.card_id=copied.card_id and original.section=copied.section;
    return v_id;
  when 'import_deck' then
    if payload->'lines' is null or jsonb_typeof(payload->'lines') <> 'array' or jsonb_array_length(payload->'lines') not between 1 and 500 then raise exception 'Import requires 1 to 500 lines' using errcode='22023'; end if;
    v_deck := public.mutate_inventory('create_deck', jsonb_build_object('name',payload->>'name','mode','theorycraft','format',payload->>'format'));
    if exists(select 1 from jsonb_array_elements(payload->'lines') x group by x->>'card_id',x->>'section' having count(*)>1) then
      raise exception 'Duplicate import card/section' using errcode='22023';
    end if;
    for v_line in select value from jsonb_array_elements(payload->'lines') loop
      perform private.integer_input(v_line->'quantity',1);
      perform public.mutate_workspace('set_line',v_line || jsonb_build_object('deck_id',v_deck));
    end loop;
    return v_deck;
  else
    return public.mutate_inventory(action,payload);
  end case;
end $$;
revoke all on function public.mutate_workspace(text,jsonb) from public,anon;
grant execute on function public.mutate_workspace(text,jsonb) to authenticated;

-- Prevent a raw P0 RPC from bypassing a chosen printing. Existing callers remain valid.
create function private.check_planned_printing() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.deck_allocations a join public.deck_cards l on l.id=a.deck_card_id
    join public.collection_entries ce on ce.id=a.collection_entry_id
    where a.user_id=coalesce(new.user_id,old.user_id) and l.preferred_printing_id is not null and l.preferred_printing_id<>ce.printing_id) then
    raise exception 'Allocation must match the planned printing' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger planned_printing_integrity after insert or update on public.deck_cards
  deferrable initially deferred for each row execute function private.check_planned_printing();
create constraint trigger planned_printing_integrity after insert or update on public.deck_allocations
  deferrable initially deferred for each row execute function private.check_planned_printing();
revoke all on function private.check_planned_printing() from public,anon,authenticated;

-- One SQL statement = one consistent snapshot. Aggregate avoids PostgREST's 1000
-- row limit truncating sorting/masterset calculations. No shared private cache.
create function public.workspace_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'printings',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('is_fixture',s.is_fixture,'source_url',s.url,'source_version',s.version,'collection_category',c.collection_category))
    from public.catalog_printings p join public.catalog_sources s on s.id=p.source_id join public.cards c on c.id=p.card_id where p.eligible),'[]'::jsonb),
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
  'sources',coalesce((select jsonb_agg(to_jsonb(s)) from public.catalog_sources s),'[]'::jsonb)
) where auth.uid() is not null;
$$;
revoke all on function public.workspace_snapshot() from public,anon;
grant execute on function public.workspace_snapshot() to authenticated;
alter table public.decks add constraint format_label_length check (format is null or length(format)<=80);
alter table public.deck_cards add constraint section_tsv_safe check (section !~ E'[\t\r\n]');

create function private.check_wishlist_eligibility() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.wishlist_entries w join public.catalog_printings p on p.id=w.printing_id where not p.eligible) then
    raise exception 'Catalog update would invalidate saved wishlist entries' using errcode='23514';
  end if;
  return null;
end $$;
create constraint trigger wishlist_catalog_integrity after insert or update on public.wishlist_entries deferrable initially deferred for each row execute function private.check_wishlist_eligibility();
do $$ declare t text; begin
  foreach t in array array['card_printings','products','product_contents','catalog_sources'] loop
    execute format('create constraint trigger wishlist_catalog_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.check_wishlist_eligibility()',t);
  end loop;
end $$;
revoke all on function private.check_wishlist_eligibility() from public,anon,authenticated;
