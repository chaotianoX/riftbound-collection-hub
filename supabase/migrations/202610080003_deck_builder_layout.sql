-- Additive UI layout support. Existing inventory/reservation RPCs are unchanged.
alter table public.deck_cards add column display_order integer not null default 0 check (display_order >= 0);

create function public.edit_deck_layout(action text, payload jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); src public.deck_cards; dst public.deck_cards;
  destination text := payload->>'section'; ids uuid[]; expected uuid[];
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Workspace operations require read committed isolation' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if payload is null or jsonb_typeof(payload) <> 'object' or destination is null or length(destination) not between 1 and 80 or destination ~ E'[\t\r\n]' then
    raise exception 'Invalid section' using errcode='22023';
  end if;
  if action='move_line' then
    select * into src from public.deck_cards where id=(payload->>'deck_card_id')::uuid and user_id=uid for update;
    if not found then raise exception 'Deck line not found' using errcode='42501'; end if;
    if src.section=destination then return src.id; end if;
    if exists(select 1 from public.deck_allocations where deck_card_id=src.id) then
      raise exception 'Release allocations before moving this line' using errcode='23514';
    end if;
    select * into dst from public.deck_cards where deck_id=src.deck_id and card_id=src.card_id and section=destination and user_id=uid for update;
    if found then
      if dst.preferred_printing_id is distinct from src.preferred_printing_id then
        raise exception 'Destination printing differs; resolve printing choices before merging' using errcode='23514';
      end if;
      update public.deck_cards set quantity=quantity+src.quantity where id=dst.id;
      delete from public.deck_cards where id=src.id;
      return dst.id;
    end if;
    update public.deck_cards set section=destination, display_order=coalesce((select max(display_order)+1 from public.deck_cards where deck_id=src.deck_id and section=destination),0) where id=src.id;
    return src.id;
  elsif action='reorder_lines' then
    if not exists(select 1 from public.decks where id=(payload->>'deck_id')::uuid and user_id=uid) then raise exception 'Deck not found' using errcode='42501'; end if;
    if jsonb_typeof(payload->'line_ids') is distinct from 'array' then raise exception 'Invalid display order' using errcode='22023'; end if;
    select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(payload->'line_ids');
    select array_agg(id order by id) into expected from public.deck_cards where deck_id=(payload->>'deck_id')::uuid and section=destination and user_id=uid;
    if ids is distinct from expected or ids is null then raise exception 'Display order changed; refresh and retry' using errcode='23514'; end if;
    update public.deck_cards l set display_order=(items.ordinality-1)::integer
      from jsonb_array_elements_text(payload->'line_ids') with ordinality items(value,ordinality)
      where l.id=items.value::uuid and l.user_id=uid;
    return (payload->>'deck_id')::uuid;
  end if;
  raise exception 'Unknown layout action' using errcode='22023';
end $$;
revoke all on function public.edit_deck_layout(text,jsonb) from public,anon;
grant execute on function public.edit_deck_layout(text,jsonb) to authenticated;
