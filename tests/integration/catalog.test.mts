import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { buildPlan, validateReview, stableId, digest } from '../../lib/catalog/normalize';
import { publishCatalog, reviewChecksum } from '../../lib/catalog/publish';

function client(database='catalog_test') {
  assert.equal(process.env.P0_DISPOSABLE_DB,'1');const port=Number(process.env.P0_TEST_PG_PORT);assert.ok(port>0 && port!==5432);
  return new pg.Client({host:'127.0.0.1',port,user:'postgres',database});
}
test('catalog PostgreSQL: transactional publish, stable IDs, RLS and inventory preservation',async t=>{
  const root=client('postgres');await root.connect();await root.query('create database catalog_test');await root.end();
  const db=client();const actor=client();const reader=client();await db.connect();
  try {
    await db.query(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const migrations=new URL('../../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile(new URL(name,migrations),'utf8'));
    const uid='00000000-0000-4000-8000-000000000003';await db.query('insert into auth.users values($1)',[uid]);
    await actor.connect();await reader.connect();await actor.query('set role authenticated');await actor.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await reader.query('set role anon');
    const review=validateReview({sets:[{code:'OGN',name:'TEST ONLY',order:10,releasedOn:'2025-10-31'}]});
    const records=[{cardCode:'ogn-001-298',setCode:'ogn',cardNumber:'001-298',name:'Test card',cardType:'Unit',rarity:'Common',energy:2}];
    const plan=buildPlan(records,review);const receipt={version:'TEST ONLY',checksum:digest(JSON.stringify(records)),retrievedAt:new Date().toISOString(),reviewChecksum:reviewChecksum(review)};
    const printing=stableId('printing','ogn-001-298');
    await t.test('publishes idempotently; no ownership fabricated and community source is not official',async()=>{
      assert.equal((await publishCatalog(db,plan,review,receipt,new Map())).published,1);
      await publishCatalog(db,plan,review,receipt,new Map());
      assert.equal((await db.query('select * from public.card_printings')).rowCount,1);
      assert.equal((await db.query('select * from public.collection_entries')).rowCount,0);
      assert.equal((await db.query('select * from public.catalog_sources')).rows[0].official_verified,false);
      assert.equal((await db.query('select * from public.card_images')).rows[0].state,'pending');
    });
    await t.test('unreviewed images cannot publish; reviewed failures retain error placeholders',async()=>{
      const imagePlan=structuredClone(plan);imagePlan.cards[0].imageUrl='https://cmsassets.rgpub.io/TEST-ONLY.png';
      const metadata=new Map([['ogn-001-298',{url:imagePlan.cards[0].imageUrl,width:744,height:1039,checksum:digest('TEST ONLY image bytes')}]]);
      await assert.rejects(publishCatalog(db,imagePlan,review,receipt,metadata),/authorization/);
      const rightsReview={...review,images:{reference:'https://example.invalid/TEST-ONLY-authorization',hosts:['cmsassets.rgpub.io']}};
      await publishCatalog(db,imagePlan,rightsReview,{...receipt,version:'TEST ONLY artwork'},metadata);
      assert.equal((await db.query('select * from public.card_images where printing_id=$1',[printing])).rows[0].state,'ready');
      await publishCatalog(db,imagePlan,rightsReview,{...receipt,version:'TEST ONLY artwork failure'},new Map(),new Set(['ogn-001-298']));
      const image=(await db.query('select * from public.card_images where printing_id=$1',[printing])).rows[0];
      assert.equal(image.state,'error');assert.equal(image.usage_verified,false);assert.equal(image.authorized_url,null);
    });
    await t.test('authenticated users read import status but cannot publish keys, sources or runs',async()=>{
      await db.query("insert into public.catalog_sync_runs(status) values('success')");
      const snapshot=(await actor.query('select public.workspace_snapshot() s')).rows[0].s;assert.equal(snapshot.catalogSync.status,'success');
      assert.equal((await reader.query('select * from public.catalog_sync_runs')).rowCount,1);
      await assert.rejects(actor.query("insert into public.catalog_sync_runs(status) values('success')"),/permission denied/);
      await assert.rejects(actor.query('select * from private.catalog_import_keys'),/permission denied/);
      await assert.rejects(actor.query("update public.card_printings set treatment='foil'"),/permission denied/);
    });
    await actor.query("select public.mutate_workspace('set_owned',$1::jsonb)",[JSON.stringify({printing_id:printing,quantity:3})]);
    await t.test('sync preserves quantities and cards absent from subsequent snapshots',async()=>{
      const changed=buildPlan([{...records[0],name:'Updated test card'}, {...records[0],cardCode:'ogn-002-298',cardNumber:'002-298'}],review);
      await publishCatalog(db,changed,review,{...receipt,version:'TEST ONLY 2'},new Map());
      assert.equal((await db.query('select owned from public.collection_entries')).rows[0].owned,3);
      const result=await publishCatalog(db,plan,review,{...receipt,version:'TEST ONLY 3'},new Map());assert.equal(result.retained,1);
      assert.equal((await db.query('select * from public.card_printings')).rowCount,2);
    });
    await t.test('identity changes fail and rollback rather than remapping owned printings',async()=>{
      const mapped={...review,canonical:{'ogn-001-298':'different-playable-id'}};
      await assert.rejects(publishCatalog(db,buildPlan(records,mapped),mapped,{...receipt,version:'TEST ONLY 4'},new Map()),/identity changed/);
      assert.equal((await db.query("select * from public.catalog_sources where version like 'TEST ONLY 4%'")).rowCount,0);
      assert.equal((await db.query('select owned from public.collection_entries')).rows[0].owned,3);
    });
    await t.test('database integrity failure rolls back the entire source/set/card publication',async()=>{
      const invalid=structuredClone(plan);invalid.cards[0].rarity='Unsupported';
      await assert.rejects(publishCatalog(db,invalid,review,{...receipt,version:'TEST ONLY 5'},new Map()),/invalidate/);
      assert.equal((await db.query('select rarity from public.card_printings where id=$1',[printing])).rows[0].rarity,'Common');
      assert.equal((await db.query("select * from public.catalog_sources where version like 'TEST ONLY 5%'")).rowCount,0);
    });
    await t.test('publication waits for concurrent inventory transaction then preserves its confirmed writes',async()=>{
      await actor.query('begin');await actor.query("select public.mutate_workspace('set_owned',$1::jsonb)",[JSON.stringify({printing_id:printing,quantity:4})]);
      const publication=publishCatalog(db,plan,review,{...receipt,version:'TEST ONLY 6'},new Map());
      await actor.query('commit');await publication;
      assert.equal((await db.query('select owned from public.collection_entries')).rows[0].owned,4);
    });
    if(process.env.P0_CATALOG_FILE){
      await t.test('real pinned community snapshot publishes all resolved sets with unchanged inventory',async()=>{
        const bytes=await readFile(process.env.P0_CATALOG_FILE!);assert.equal(digest(bytes),process.env.P0_CATALOG_SHA256);
        const liveReview=validateReview(JSON.parse(await readFile(new URL('../../config/catalog-review.json',import.meta.url),'utf8')));
        const livePlan=buildPlan(JSON.parse(bytes.toString('utf8')),liveReview,'2026-10-08');
        const result=await publishCatalog(db,livePlan,liveReview,{...receipt,version:'v2026-10-08',checksum:digest(bytes),reviewChecksum:reviewChecksum(liveReview)},new Map());
        const snapshot=(await actor.query('select public.workspace_snapshot() s')).rows[0].s;
        assert.equal(snapshot.printings.filter((p:{set_code:string;previewed:boolean})=>p.set_code==='RAD'&&p.previewed).length,livePlan.counts.RAD);
        assert.equal(result.published,livePlan.cards.length);assert.ok(livePlan.counts.RAD>0);assert.equal(livePlan.sets.length,6);
        assert.equal((await db.query('select owned from public.collection_entries')).rows[0].owned,4);
        assert.equal((await db.query('select count(*)::int n from public.card_images where usage_verified')).rows[0].n,0);
        assert.equal((await db.query("select count(*)::int n from public.card_printings p join public.sets s on s.id=p.set_id where s.code='RAD' and p.previewed")).rows[0].n,livePlan.counts.RAD);
      });
    }
    await t.test('fixtures are isolated from real publication',async()=>{
      await db.query("insert into public.catalog_sources(url,version,retrieved_at,checksum,usage_notes,is_fixture) values('https://example.invalid/fixture','TEST ONLY',now(),'fixture','fixture',true)");
      await assert.rejects(publishCatalog(db,plan,review,{...receipt,version:'TEST ONLY 7'},new Map()),/mix TEST ONLY/);
    });
  } finally {await actor.end();await reader.end();await db.end();}
});
