import pg from 'pg';
import { readFile } from 'node:fs/promises';
// Deliberately fixed loopback/port and no remote URL option. Do not point this at
// a forwarded remote DB; it refuses catalogs containing non-fixture sources.
if(!process.argv.includes('--test-only'))throw new Error('Explicit opt-in required: npm run fixtures:local -- --test-only');
const db=new pg.Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
await db.connect();
try {
  const existing=await db.query('select count(*)::int n from public.catalog_sources where not is_fixture');
  if(existing.rows[0].n>0)throw new Error('Refusing to mix fixtures with an authorized catalog. Use a separate local project.');
  await db.query(await readFile(new URL('../supabase/fixtures/local.sql',import.meta.url),'utf8'));
  console.log('Loaded synthetic TEST ONLY catalog. No user inventory, official checklist, rules or images were created.');
} finally {await db.end();}
