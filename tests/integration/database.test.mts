import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

// Test-only auth schema emulates JWT claims. This is real PostgreSQL, but not
// a test of Supabase Auth/GoTrue, PostgREST, Storage or a hosted project.
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const source = '10000000-0000-4000-8000-000000000001';
const set = '20000000-0000-4000-8000-000000000001';
const card = '30000000-0000-4000-8000-000000000001';
const print = '40000000-0000-4000-8000-000000000001';

function connect(database = 'p0_test') {
  assert.equal(process.env.P0_DISPOSABLE_DB, '1', 'Use npm run test:db; it creates an isolated container');
  const port = Number(process.env.P0_TEST_PG_PORT);
  assert.ok(Number.isInteger(port) && port > 0 && port !== 5432, 'An ephemeral test port is required');
  return new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database });
}
async function actor(c: pg.Client, uid: string) {
  await c.query('set role authenticated');
  await c.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
}
async function rpc(c: pg.Client, action: string, payload: object): Promise<string> {
  const r = await c.query('select public.mutate_inventory($1,$2::jsonb) as id', [action, JSON.stringify(payload)]);
  return r.rows[0].id;
}

test('P0 PostgreSQL: RLS, eligibility, ownership, lifecycle and concurrent allocations', async t => {
  const admin = connect('postgres'); await admin.connect();
  await admin.query('create database p0_test'); await admin.end();
  const db = connect(); await db.connect();
  const a = connect(); const b = connect(); const other = connect();
  try {
    await db.query(`create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    const migrationDir=new URL('../../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(migrationDir)).filter(n=>n.endsWith('.sql')).sort()) await db.query(await readFile(new URL(name,migrationDir),'utf8'));
    // Fixtures deliberately stand in for a reviewed source to exercise the PG exception.
    // Names/URLs/cards here are synthetic, never an official Riot checklist.
    await db.query(`insert into auth.users values ('${U1}'),('${U2}');
      insert into public.catalog_sources(id,url,version,retrieved_at,checksum,usage_notes,official_verified,is_fixture)
        values('${source}','https://example.invalid/test-fixture','TEST ONLY',now(),'fixture','Synthetic test data, not Riot evidence',true,true);
      insert into public.sets(id,code,name,sort_order,source_id) values('${set}','TEST','TEST ONLY',10,'${source}');
      insert into public.cards(id,name,card_type,collection_category,source_id)
        values('${card}','Fixture card','Unknown test type','Normal','${source}');
      insert into public.card_printings(id,card_id,set_id,card_number,language,rarity,variant,treatment,source_id)
        values('${print}','${card}','${set}','002','en','Common','standard','nonfoil','${source}');`);
    await Promise.all([a.connect(), b.connect(), other.connect()]);
    await actor(a, U1); await actor(b, U1); await actor(other, U2);
    const entry = await rpc(a,'set_owned',{ printing_id: print, quantity: 3 });
    let deckA = '', lineA = '', deckB = '', lineB = '';
    await t.test('RLS hides private rows; direct DML and catalog writes are denied', async () => {
      assert.equal((await other.query('select * from public.collection_entries')).rowCount, 0);
      assert.equal((await other.query('select * from public.inventory_status')).rowCount, 0);
      await assert.rejects(other.query('update public.collection_entries set owned=999'), /permission denied/);
      await assert.rejects(a.query('insert into public.cards(name,source_id) values($1,$2)', ['Bad',source]), /permission denied/);
      await assert.rejects(other.query('select private.integer_input($1::jsonb,0)', ['1']), /permission denied/);
      await db.query('set role anon');
      await assert.rejects(db.query('select public.mutate_inventory($1,$2)', ['set_owned', '{}']), /permission denied/);
      await db.query('reset role');
    });
    await t.test('integer validation rejects fractions, negatives and numeric strings', async () => {
      for (const n of [-1, 1.5, '3', null]) {
        await assert.rejects(rpc(a,'set_owned',{ printing_id: print, quantity: n }));
      }
      assert.equal((await a.query('select owned from public.collection_entries')).rows[0].owned, 3);
    });
    await t.test('rarity treatments, variants and verified product exception', async () => {
      for (const [rarity, treatment, variant, eligible] of [
        ['Common','foil','standard',false], ['Uncommon','nonfoil','standard',true],
        ['Uncommon','foil','standard',false], ['Rare','foil','standard',true],
        ['Rare','nonfoil','standard',false], ['Epic','foil','standard',true],
        ['Epic','nonfoil','standard',false], ['Rare','foil','alternate',false],
      ] as const) {
        const c = (await db.query('insert into public.cards(name,source_id) values($1,$2) returning id', ['TEST '+rarity, source])).rows[0].id;
        const p = (await db.query('insert into public.card_printings(card_id,set_id,language,rarity,variant,treatment,source_id) values($1,$2,$3,$4,$5,$6,$7) returning id', [c,set,'en',rarity,variant,treatment,source])).rows[0].id;
        assert.equal((await a.query('select eligible from public.catalog_printings where id=$1', [p])).rows[0].eligible, eligible);
        if (!eligible) await assert.rejects(rpc(a,'set_owned',{ printing_id: p, quantity: 1 }), /not eligible/);
      }
      const c = (await db.query('insert into public.cards(name,source_id) values($1,$2) returning id', ['TEST rune, category unresolved', source])).rows[0].id;
      const p = (await db.query('insert into public.card_printings(card_id,set_id,language,rarity,variant,treatment,source_id) values($1,$2,$3,$4,$5,$6,$7) returning id', [c,set,'en','Common','standard','foil',source])).rows[0].id;
      const product = (await db.query("insert into public.products(code,name,is_proving_grounds,source_id) values('TEST-PG','TEST ONLY',true,$1) returning id", [source])).rows[0].id;
      await db.query('insert into public.product_contents values($1,$2,10,$3)', [product,p,source]);
      assert.equal((await a.query('select eligible from public.catalog_printings where id=$1', [p])).rows[0].eligible, false);
      await db.query('update public.products set checklist_verified=true where id=$1', [product]);
      const row = (await a.query('select eligible,masterset_target from public.catalog_printings where id=$1', [p])).rows[0];
      assert.equal(row.eligible, true); assert.equal(row.masterset_target, null);
      await rpc(a,'set_owned',{ printing_id: p, quantity: 1 });
      assert.equal((await a.query('select count(*)::int as n from public.catalog_printings where id=$1', [p])).rows[0].n, 1);
      await assert.rejects(db.query('update public.products set checklist_verified=false where id=$1', [product]), /invalidate existing inventory/);
    });
    await t.test('explicit OGN before SFD sequence and generated numeric identifiers', async () => {
      await db.query('insert into public.sets(code,name,sort_order,source_id) values($1,$2,$3,$4)', ['OGN','TEST ordering only',20,source]);
      await assert.rejects(db.query('insert into public.sets(code,name,sort_order,source_id) values($1,$2,$3,$4)', ['SFD','TEST ordering only',15,source]), /OGN must precede/);
      await db.query('insert into public.sets(code,name,sort_order,source_id) values($1,$2,$3,$4)', ['SFD','TEST ordering only',30,source]);
      assert.equal((await a.query('select number_sort from public.card_printings where id=$1', [print])).rows[0].number_sort, '2');
    });
    await t.test('theorycraft has no inventory requirement and cannot allocate', async () => {
      deckA = await rpc(a,'create_deck',{ name: 'Deck A' });
      lineA = await rpc(a,'set_line',{ deck_id: deckA, card_id: card, section: 'test section', quantity: 3 });
      await assert.rejects(rpc(a,'allocate',{ deck_card_id: lineA, collection_entry_id: entry, quantity: 1 }), /physical deck line/);
      assert.equal((await a.query('select legality_status from public.decks where id=$1', [deckA])).rows[0].legality_status, 'Unverified');
      await rpc(a,'set_mode',{ deck_id: deckA, mode: 'physical' });
      deckB = await rpc(a,'create_deck',{ name: 'Deck B', mode: 'physical' });
      lineB = await rpc(a,'set_line',{ deck_id: deckB, card_id: card, section: 'test section', quantity: 3 });
    });
    await t.test('theorycraft works with zero inventory for another owner', async()=>{
      const emptyDeck=await rpc(other,'create_deck',{name:'Zero inventory idea'});
      await rpc(other,'set_line',{deck_id:emptyDeck,card_id:card,section:'test section',quantity:99});
      assert.equal((await other.query('select * from public.collection_entries')).rowCount,0);
      assert.equal((await other.query('select * from public.deck_allocations')).rowCount,0);
      await rpc(other,'delete_deck',{deck_id:emptyDeck});
    });
    await t.test('concurrent transactions cannot reserve 4 of 3 copies', async () => {
      await a.query('begin');
      await rpc(a,'allocate',{ deck_card_id: lineA, collection_entry_id: entry, quantity: 2 });
      let settled = false;
      const competing = rpc(b,'allocate',{ deck_card_id: lineB, collection_entry_id: entry, quantity: 2 });
      const handled = competing.then(() => { settled = true; return null; }, e => { settled = true; return e; });
      // Observe the actual advisory-lock wait instead of relying on a timing guess.
      let waited = false;
      for (let i = 0; i < 50; i++) {
        const r = await db.query("select count(*)::int n from pg_locks where locktype='advisory' and not granted");
        if (r.rows[0].n > 0) { waited = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waited, true); assert.equal(settled, false);
      await a.query('commit');
      const failure = await handled; assert.match(failure?.message ?? '', /Insufficient available copies/);
      const row = (await a.query('select owned,reserved,available from public.inventory_status where id=$1', [entry])).rows[0];
      assert.deepEqual(row, { owned: 3, reserved: '2', available: '1' });
    });
    await t.test('ownership and identity checks; line and inventory reductions roll back', async () => {
      for (const [action,payload] of [
        ['set_mode',{ deck_id: deckA, mode: 'theorycraft' }],
        ['delete_deck',{ deck_id: deckA }],
        ['duplicate_deck',{ deck_id: deckA }],
        ['set_line',{ deck_id: deckA, card_id: card, section: 'test', quantity: 1 }],
        ['allocate',{ deck_card_id: lineA, collection_entry_id: entry, quantity: 1 }],
      ] as const) await assert.rejects(rpc(other,action,payload));
      assert.equal((await other.query('select * from public.deck_cards')).rowCount, 0);
      assert.equal((await other.query('select * from public.deck_allocations')).rowCount, 0);
      const alternateCard = (await a.query('select id from public.catalog_printings where eligible and card_id<>$1 limit 1', [card])).rows[0].id;
      const alternateEntry = await rpc(a,'set_owned',{ printing_id: alternateCard, quantity: 2 });
      await assert.rejects(rpc(a,'allocate',{ deck_card_id: lineA, collection_entry_id: alternateEntry, quantity: 1 }), /identity mismatch/);
      await rpc(a,'set_owned',{ printing_id: print, quantity: 5 });
      await assert.rejects(rpc(a,'allocate',{ deck_card_id: lineA, collection_entry_id: entry, quantity: 4 }), /exceeds deck line/);
      await rpc(a,'set_owned',{ printing_id: print, quantity: 3 });
      await assert.rejects(rpc(a,'set_owned',{ printing_id: print, quantity: 1 }), /cannot fall below reserved/);
      await assert.rejects(rpc(a,'set_line',{ deck_id: deckA, card_id: card, section: 'test section', quantity: 1 }), /Release allocations/);
      await assert.rejects(rpc(a,'allocate',{ deck_card_id: lineA, collection_entry_id: entry, quantity: 4 }), /Insufficient available/);
      await a.query('begin isolation level repeatable read');
      await assert.rejects(rpc(a,'set_owned',{ printing_id: print, quantity: 3 }), /read committed/);
      await a.query('rollback');
    });
    await t.test('wishlist reasons deduplicate and preserve manual goals; RLS and preferences isolate users', async () => {
      const write=async(action:string,payload:object)=>a.query('select public.mutate_workspace($1,$2::jsonb)',[action,JSON.stringify(payload)]);
      await write('save_wishlist',{printing_id:print,target:4,priority:'High',note:'Manual intention'});
      await write('add_wishlist_reason',{printing_id:print,reason:'Masterset'});
      await write('add_wishlist_reason',{printing_id:print,reason:'Masterset'});
      const wishes=(await a.query('select * from public.wishlist_entries')).rows;
      assert.equal(wishes.length,1);assert.equal(wishes[0].manual_target,4);assert.equal(wishes[0].note,'Manual intention');
      assert.equal((await other.query('select * from public.wishlist_entries')).rowCount,0);
      await assert.rejects(other.query('delete from public.wishlist_entries'),/permission denied/);
      await write('save_sort',{screen:'collection',field:'name',direction:'desc'});
      assert.equal((await a.query('select collection_sort from public.profiles')).rows[0].collection_sort.field,'name');
      assert.equal((await other.query('select * from public.profiles')).rowCount,0);
      await assert.rejects(write('save_sort',{screen:'collection',field:'priority',direction:'asc'}),/Invalid sort/);
      await write('save_sort',{screen:'collection',field:'canonical',direction:'asc'});
      await write('save_wishlist',{printing_id:print,target:0,priority:'High',note:'Kept reason'});
      const retained=(await a.query('select * from public.wishlist_entries')).rows[0];assert.equal(retained.manual_target,null);assert.equal(retained.include_masterset,true);
      await write('remove_wishlist_reason',{printing_id:print,reason:'Masterset'});
      assert.equal((await a.query('select * from public.wishlist_entries')).rowCount,0);
    });
    await t.test('workspace import is atomic, identity-aware and unreserved; snapshot is owner-isolated', async () => {
      const write=async(c:pg.Client,action:string,payload:object)=>(await c.query('select public.mutate_workspace($1,$2::jsonb) id',[action,JSON.stringify(payload)])).rows[0].id;
      const countBefore=(await a.query('select count(*)::int n from public.decks')).rows[0].n;
      await assert.rejects(write(a,'import_deck',{name:'Broken',lines:[{card_id:card,printing_id:print,section:'main',quantity:2},{card_id:U2,section:'main',quantity:1}]}));
      assert.equal((await a.query('select count(*)::int n from public.decks')).rows[0].n,countBefore);
      await assert.rejects(write(a,'import_deck',{name:'Duplicate',lines:[{card_id:card,section:'main',quantity:2},{card_id:card,section:'main',quantity:1}]}),/Duplicate import/);
      const imported=await write(a,'import_deck',{name:'Imported idea',lines:[{card_id:card,printing_id:print,section:'main',quantity:2}]});
      assert.equal((await a.query('select mode from public.decks where id=$1',[imported])).rows[0].mode,'theorycraft');
      await write(a,'rename_deck',{deck_id:imported,name:'Renamed idea',format:'Descriptive only'});
      await assert.rejects(write(other,'rename_deck',{deck_id:imported,name:'Stolen'}),/Deck not found/);
      const snap=(await other.query('select public.workspace_snapshot() s')).rows[0].s;
      assert.equal(snap.inventory.length,0);assert.equal(snap.decks.length,0);assert.equal(snap.wishlist.length,0);
      assert.ok(snap.printings.length>0);
      const line=(await a.query('select id from public.deck_cards where deck_id=$1',[imported])).rows[0].id;
      await write(a,'set_mode',{deck_id:imported,mode:'physical'});
      await write(a,'allocate',{deck_card_id:line,collection_entry_id:entry,quantity:1});
      await assert.rejects(write(a,'set_line_printing',{deck_card_id:line,printing_id:null}),/Release allocations/);
      await write(a,'delete_deck',{deck_id:imported});
    });
    await t.test('duplicate is theorycraft; conversion and deletion release allocations atomically', async () => {
      const copy = await rpc(a,'duplicate_deck',{ deck_id: deckA });
      assert.equal((await a.query('select mode from public.decks where id=$1', [copy])).rows[0].mode, 'theorycraft');
      assert.equal((await a.query('select count(*)::int n from public.deck_allocations')).rows[0].n, 1);
      await rpc(a,'set_mode',{ deck_id: deckA, mode: 'theorycraft' });
      assert.equal((await a.query('select count(*)::int n from public.deck_allocations')).rows[0].n, 0);
      await rpc(a,'allocate',{ deck_card_id: lineB, collection_entry_id: entry, quantity: 3 });
      await rpc(a,'delete_deck',{ deck_id: deckB });
      assert.equal((await a.query('select available from public.inventory_status where id=$1', [entry])).rows[0].available, '3');
      await rpc(a,'set_owned',{ printing_id: print, quantity: 0 });
    });
  } finally {
    await Promise.allSettled([a.end(),b.end(),other.end(),db.end()]);
  }
});
