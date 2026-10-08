-- OPT-IN LOCAL TEST DATA. No real Riot cards, official images or official rules.
-- The simulated PG membership exercises software behavior, not a real checklist.
begin;
insert into public.catalog_sources(id,url,version,retrieved_at,checksum,usage_notes,official_verified,is_fixture)
 values('f0000000-0000-4000-8000-000000000001','https://example.invalid/riftbound-local-fixtures','TEST ONLY v1',now(),'test-only-v1','SYNTHETIC DATA; not a Riot source. No official assets.',true,true)
 on conflict(id) do nothing;
insert into public.sets(id,code,name,sort_order,source_id)
 values('f1000000-0000-4000-8000-000000000001','OGN','TEST ONLY OGN ordering',1000,'f0000000-0000-4000-8000-000000000001'),
 ('f1000000-0000-4000-8000-000000000002','SFD','TEST ONLY SFD ordering',2000,'f0000000-0000-4000-8000-000000000001')
 on conflict(id) do nothing;
do $$
declare i integer; cid uuid; pid uuid; sid uuid; category text; rarity text;
begin
 for i in 1..64 loop
  cid := ('f2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  pid := ('f3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  sid := case when i<=32 then 'f1000000-0000-4000-8000-000000000001'::uuid else 'f1000000-0000-4000-8000-000000000002'::uuid end;
  category := case when i=2 then 'Legend' when i=3 then 'Battlefield' else 'Normal' end;
  rarity := case (i%4) when 1 then 'Common' when 2 then 'Uncommon' when 3 then 'Rare' else 'Epic' end;
  insert into public.cards(id,name,card_type,domains,collection_category,source_id)
   values(cid,'TEST Card '||lpad(i::text,2,'0'),case when category='Normal' then 'Unit' else category end,
    array[case when i%2=0 then 'Test domain A' else 'Test domain B' end],category,'f0000000-0000-4000-8000-000000000001') on conflict(id) do nothing;
  insert into public.card_printings(id,card_id,set_id,card_number,language,rarity,variant,treatment,printed_text,source_id)
   values(pid,cid,sid,lpad((case when i<=32 then i else i-32 end)::text,3,'0'),'en',rarity,'standard',
    case when rarity in ('Common','Uncommon') then 'nonfoil' else 'foil' end,
    'TEST ONLY placeholder text. This is not a Riftbound card or ruling.','f0000000-0000-4000-8000-000000000001') on conflict(id) do nothing;
 end loop;
end $$;
insert into public.cards(id,name,card_type,collection_category,source_id)
 values('f2000000-0000-4000-8000-000000000065','TEST PG unresolved category','Test rune',null,'f0000000-0000-4000-8000-000000000001') on conflict(id) do nothing;
insert into public.card_printings(id,card_id,set_id,card_number,language,rarity,variant,treatment,source_id)
 values('f3000000-0000-4000-8000-000000000065','f2000000-0000-4000-8000-000000000065','f1000000-0000-4000-8000-000000000001',null,'en','Common','standard','foil','f0000000-0000-4000-8000-000000000001'),
 ('f3000000-0000-4000-8000-000000000066','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','001','en','Common','alternate','nonfoil','f0000000-0000-4000-8000-000000000001') on conflict(id) do nothing;
insert into public.products(id,code,name,is_proving_grounds,checklist_verified,source_id)
 values('f4000000-0000-4000-8000-000000000001','TEST-PG','TEST ONLY simulated Proving Grounds',true,true,'f0000000-0000-4000-8000-000000000001') on conflict(id) do nothing;
insert into public.product_contents(product_id,printing_id,published_quantity,source_id)
 values('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',2,'f0000000-0000-4000-8000-000000000001'),
 ('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000065',5,'f0000000-0000-4000-8000-000000000001') on conflict do nothing;
commit;
