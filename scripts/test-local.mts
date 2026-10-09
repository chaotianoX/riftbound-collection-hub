// Integration harness: real PostgreSQL 17, Supabase GoTrue and PostgREST.
// A test-only loopback gateway replaces Kong; this is not a hosted deployment
// or a verification of the full Supabase CLI/Storage/realtime stack.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { createServer, request as proxyRequest } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const suffix=randomBytes(5).toString('hex');const network=`riftbound-local-${suffix}`;
const containers:string[]=[];const secret=randomBytes(32).toString('hex');
const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
function docker(args:string[]) {
  const p=spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,encoding:'utf8',maxBuffer:2*1024*1024});
  if(p.status!==0)throw new Error(`Local Docker operation failed: ${args[0]} (check daemon/image availability)`);
  return p.stdout.trim();
}
function token(role:string) {
  const encode=(data:unknown)=>Buffer.from(JSON.stringify(data)).toString('base64url');
  const unsigned=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})}`;
  return `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;
}
function runContainer(image:string,alias:string,port:number,env:Record<string,string>,extra:string[]=[]) {
  const args=['run','--detach','--rm','--network',network,'--network-alias',alias,'--publish',`127.0.0.1::${port}`,...extra];
  for(const [name,value]of Object.entries(env))args.push('--env',`${name}=${value}`);
  const id=docker([...args,image]);containers.push(id);
  return {id,port:Number(docker(['port',id,`${port}/tcp`]).split(':').at(-1))};
}
async function waitFor(url:string) {
  for(let attempt=0;attempt<120;attempt++) {
    try {const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('A local integration service did not become healthy.');
}
function command(args:string[],env:NodeJS.ProcessEnv) {
  return new Promise<void>((resolve,reject)=>{
    const child=spawn('npm',args,{cwd,env,stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`npm ${args.join(' ')} failed`)));
  });
}
const key=token('anon');let database:pg.Client|null=null;
let upstreamAuth=0,upstreamRest=0;
const gateway=createServer((req,res)=>{
  if(req.headers.apikey!==key){res.writeHead(401);res.end('Invalid local test key');return;}
  const auth=req.url?.startsWith('/auth/v1/');const rest=req.url?.startsWith('/rest/v1/');
  if(!auth&&!rest){res.writeHead(404);res.end();return;}
  const port=auth?upstreamAuth:upstreamRest;const path=req.url!.replace(auth?'/auth/v1':'/rest/v1','');
  const proxy=proxyRequest({hostname:'127.0.0.1',port,path,method:req.method,headers:{...req.headers,host:`127.0.0.1:${port}`}},r=>{res.writeHead(r.statusCode??502,r.headers);r.pipe(res);});
  proxy.on('error',()=>{res.writeHead(502);res.end('Local test upstream unavailable');});req.pipe(proxy);
});
try {
  docker(['network','create',network]);
  const db=runContainer('postgres:17-alpine','db',5432,{POSTGRES_HOST_AUTH_METHOD:'trust'},['--tmpfs','/var/lib/postgresql/data']);
  for(let i=0;i<60;i++) {
    try {database=new pg.Client({host:'127.0.0.1',port:db.port,user:'postgres',database:'postgres'});await database.connect();break;}
    catch{database=null;await new Promise(resolve=>setTimeout(resolve,250));}
  }
  if(!database)throw new Error('Local PostgreSQL unavailable');
  await database.query(`create role anon nologin; create role authenticated nologin; create role authenticator login noinherit;
    grant anon,authenticated to authenticator; create schema auth; create extension if not exists "uuid-ossp"; create extension if not exists pgcrypto;`);
  await new Promise<void>(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  const address=gateway.address();if(!address||typeof address==='string')throw new Error('Test gateway missing');
  const api=`http://127.0.0.1:${address.port}`;
  const auth=runContainer('ghcr.io/supabase/gotrue:v2.197.0','auth',9999,{
    GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:api,GOTRUE_SITE_URL:'http://localhost:3000',
    GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://postgres@db:5432/postgres?search_path=auth,public',
    GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',
    GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_LOG_LEVEL:'warn',
  });upstreamAuth=auth.port;await waitFor(`http://127.0.0.1:${auth.port}/health`);
  await database.query(`create or replace function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await database.query(await readFile(new URL(name,migrations),'utf8'));
  if(process.env.P0_CATALOG_FILE){
    const version=process.env.P0_CATALOG_VERSION;if(!version || !/^v\d{4}-\d{2}-\d{2}$/.test(version))throw new Error('Pinned preview requires P0_CATALOG_VERSION.');
    const {buildPlan,validateReview,digest}=await import('../lib/catalog/normalize');
    const {publishCatalog,reviewChecksum}=await import('../lib/catalog/publish');
    const bytes=await readFile(process.env.P0_CATALOG_FILE);
    if(digest(bytes)!==process.env.P0_CATALOG_SHA256)throw new Error('Pinned catalog preview checksum mismatch.');
    const review=validateReview(JSON.parse(await readFile(new URL('../config/catalog-review.json',import.meta.url),'utf8')));
    const plan=buildPlan(JSON.parse(bytes.toString('utf8')),review);
    await publishCatalog(database,plan,review,{version,checksum:digest(bytes),retrievedAt:new Date().toISOString(),reviewChecksum:reviewChecksum(review)},new Map());
    await database.query(`insert into public.catalog_sync_runs(status,version,finished_at,counts,unresolved) values('partial',$1,now(),$2,$3)`,[version,JSON.stringify(plan.counts),plan.unresolved.length]);
  }else{
    await database.query(await readFile(new URL('../supabase/fixtures/local.sql',import.meta.url),'utf8'));
    // Synthetic import-status/preview fixtures for browser verification only.
    await database.query(`update public.card_printings set previewed=true where id='f3000000-0000-4000-8000-000000000001';
      insert into public.catalog_sync_runs(provider,status,version,finished_at,unresolved) values('TEST ONLY importer','partial','TEST ONLY',now(),2);`);
  }
  const rest=runContainer('ghcr.io/supabase/postgrest:v16.4','rest',3000,{
    PGRST_DB_URI:'postgres://authenticator@db:5432/postgres',PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,
  });upstreamRest=rest.port;await waitFor(`http://127.0.0.1:${rest.port}/`);
  const registration=await fetch(`${api}/auth/v1/signup`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:'smoke@example.test',password:'Local-test-only-Password-123!'})});
  const account=await registration.json();
  if(!registration.ok||!account.access_token)throw new Error('Local Auth smoke registration failed');
  const smoke=await fetch(`${api}/rest/v1/rpc/workspace_snapshot`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${account.access_token}`,'Content-Type':'application/json'},body:'{}'});
  if(!smoke.ok){const failure=await smoke.json();throw new Error(`Workspace RPC smoke failed: ${failure.code}: ${failure.message}`);}
  const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,RIFTBOUND_LOCAL_TEST:'1',RIFTBOUND_REAL_CATALOG_TEST:process.env.P0_CATALOG_FILE?'1':undefined};
  console.log(`Local real GoTrue/PostgREST/PostgreSQL ready. ${process.env.P0_CATALOG_FILE?'Pinned community catalog loaded in disposable database; no artwork authorization claimed.':'TEST ONLY fixture catalog loaded.'}`);
  await command(['run','build'],env);
  await command(['run','test:ui',...(process.env.P0_UI_GREP?['--','--grep',process.env.P0_UI_GREP]:[])],{...env,CI:'1'});
} finally {
  gateway.close();await database?.end().catch(()=>{});
  for(const id of [...containers].reverse()){try{docker(['stop',id]);}catch{}}
  try{docker(['network','rm',network]);}catch{}
}
